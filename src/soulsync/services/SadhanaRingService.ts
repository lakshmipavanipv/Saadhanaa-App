/**
 * SadhanaRingService — real-hardware RingService backed by the Sadhana Ring
 * SDK (Jieli-family transport). This is now the only RingService — the
 * MockRingService simulator it used to sit beside has been removed, so every
 * number the app shows comes from the hardware.
 *
 * What this DOES today:
 *   • Connects (either to a given deviceId or by auto-scan).
 *   • Pushes the phone clock to the ring so timestamps stay honest.
 *   • Enables the ring's continuous health-monitor master switch.
 *   • Observes ALL incoming Jieli frames and, when it recognizes an HR /
 *     SpO2 / HRV / battery frame, emits a RingSample.
 *   • During a session, drives the ring to actually MEASURE HRV and SpO2 on a
 *     paced cycle rather than reporting whatever it last stored — see the
 *     live-window notes below.
 *   • Runs connection-time setup only when it opened the link, so joining a
 *     link the Japa tab already holds costs nothing.
 *
 * What this DOESN'T do yet:
 *   • Per-beat R-R intervals — the ring computes HR in firmware and only
 *     pushes aggregated samples; RR arrival cadence needs a live test.
 *   • Accel / BVP streams — not yet wired.
 *   • Buzz — the ring has no vibration motor (owner-confirmed); we no-op.
 *
 * The service prints unknown-opcode frames so we can decode more of the
 * protocol from live data.
 */

import {
  SadhanaRing,
  type FrameObserver,
  type ScannedRing,
  type JieliFrame,
  type Spo2Sample,
  type HrvSample,
} from '../ring';
import type { BuzzPattern, RingSample, RingService, SampleHandler } from './RingTelemetryService';
import { readSr16DeviceId } from '../ring/japaCounter';
import { vitalsRepo } from '../db/vitalsRepo';

/** SpO2/temperature older than this no longer describes the current moment. */
const COMPANION_FRESHNESS_MS = 6 * 60 * 60 * 1000;   // 6 h

/**
 * ── Live HRV / SpO2 during a session ────────────────────────────────────
 *
 * The ring does not volunteer HRV or SpO2. It measures them only when told to,
 * either on the timer `monitoring.ts` configures or on demand via the live
 * measurement switch {6,9,0}. Until now a session showed whatever those two
 * channels last happened to store — up to six hours stale — which is why the
 * numbers never moved while the user watched them.
 *
 * So a session arms one metric at a time, waits for the ring to take the
 * reading, and turns it back off. The pacing is not arbitrary:
 *
 *   • ONE metric armed at a time, always released — leaving a sensor armed, or
 *     re-arming it on a short timer, is what previously froze the ring
 *     mid-japa (see the LiveMetric notes in SadhanaRing.ts).
 *   • Windows are seconds apart, not milliseconds. RWfit's own capture shows
 *     7–9 s ON/OFF pairs, and this stays in that shape.
 *   • Total traffic is a couple of small frames per cycle, orders of magnitude
 *     below the ten-channel sweep that `vitalsScheduler` refuses to run while
 *     the japa link is live.
 *
 * Reading the result: the ring's *stored* channels ({5,9,16} SpO2, {5,10,16}
 * HRV) have verified record layouts, so the value is pulled from there right
 * after the window closes — at which point the newest stored sample IS the
 * measurement just taken. Live push frames ({2,9,16} / {2,10,16}) are decoded
 * opportunistically too, but their payload layout is NOT confirmed on this
 * firmware, so a pushed value is only trusted when it lands where the verified
 * HR push puts its value.
 */
const LIVE_WINDOW_MS = 10_000;   // how long a metric stays armed
const LIVE_GAP_MS = 20_000;      // idle between windows
/** Metrics rotated through the cycler, in order. */
const LIVE_CYCLE: Array<'hrv' | 'spo2'> = ['hrv', 'spo2'];

export interface SadhanaRingServiceOpts {
  /** If given, connect to this deviceId; otherwise pick strongest ring in a scan. */
  deviceId?: string;
  /** How often to refresh battery (ms). null = never. */
  batteryRefreshMs?: number | null;
  /** Called on every incoming Jieli frame — useful for protocol reverse-engineering. */
  onFrame?: FrameObserver;
  /** Called with a candidate list mid-scan when no deviceId is set; return the chosen id. */
  onPickDevice?: (candidates: ScannedRing[]) => Promise<string>;
}

export class SadhanaRingService implements RingService {
  readonly isMock = false;
  private ring: SadhanaRing | null = null;
  private onSample: SampleHandler | null = null;
  private batteryTimer: ReturnType<typeof setInterval> | null = null;
  private lastBattery: number | null = null;
  private freshSpo2: number | null = null;
  private freshTempC: number | null = null;
  private freshHrv: number | null = null;
  /** Most recent heart rate, so a fresh SpO2/HRV can be emitted on its own. */
  private lastBpm = 0;
  /** Removes this service's frame observer from the shared ring instance. */
  private unsubscribeFrames: (() => void) | null = null;
  /** True when THIS service opened the GATT link rather than joining one. */
  private ownsLink = false;
  private liveTimer: ReturnType<typeof setTimeout> | null = null;
  private liveCycleIndex = 0;
  private liveRunning = false;
  /** Metrics whose live push frames we have successfully decoded at least once. */
  private livePushSeen = new Set<'hrv' | 'spo2'>();
  private livePushThisWindow: 'hrv' | 'spo2' | null = null;

  constructor(private readonly opts: SadhanaRingServiceOpts = {}) {}

  async start(onSample: SampleHandler, mode: 'ambient' | 'session' = 'ambient'): Promise<void> {
    this.onSample = onSample;

    const observer: FrameObserver = (frame) => {
      this.opts.onFrame?.(frame);
      const sample = this.tryDecodeSample(frame);
      if (sample && this.onSample) this.onSample(sample);
    };

    // Prefer an explicit id, then the ring the user already paired. Only fall
    // back to a scan when neither is available.
    const savedId = this.opts.deviceId ?? (await readSr16DeviceId().catch(() => null));

    if (savedId) {
      this.ring = await SadhanaRing.connect(savedId);
    } else if (this.opts.onPickDevice) {
      const candidates: ScannedRing[] = [];
      await new Promise<void>((resolve, reject) => {
        const stop = SadhanaRing.scan(
          (r) => candidates.push(r),
          (err) => { stop(); reject(new Error(err)); }
        );
        setTimeout(() => { stop(); resolve(); }, 5000);
      });
      if (candidates.length === 0) throw new Error('no rings found in scan');
      const chosen = await this.opts.onPickDevice(candidates);
      this.ring = await SadhanaRing.connect(chosen);
    } else {
      this.ring = await SadhanaRing.connectByScan();
    }

    // Subscribe through onFrame() rather than connect()'s option so we hold an
    // unsubscribe. Passing the observer to connect() leaked it: the shared ring
    // instance outlives a session, so every start/stop cycle stacked another
    // copy and each frame was decoded — and stored — once per past session.
    this.unsubscribeFrames = this.ring.onFrame(observer);

    // ── Connection-time setup: ONLY if we opened this link ───────────────
    //
    // The SR16 accepts one central connection, so `SadhanaRing.connect()`
    // hands every caller the same instance. When the Japa tab already holds it
    // for bead counting, re-running this block is not a harmless repeat: each
    // command is a write plus up to four 2.5 s reply waits on the very link the
    // ring is using to push bead taps, and `setHealthMonitorMaster` re-arms the
    // continuous sensor loop underneath a session already in progress.
    //
    // That is what "starting Soulsync stops the ring counting japa" was — not a
    // lost subscription but a ten-second command storm over the tap channel,
    // followed by a battery poll re-running it every minute for as long as the
    // session lasted. Whoever opened the link has already done this setup; a
    // joiner only needs to listen.
    //
    // Both halves of the test matter. `claimSetup()` alone would still let a
    // session configure a link the japa counter opened moments earlier;
    // `refCount` alone would skip configuration forever on a link nobody ever
    // configured. Short-circuit order is deliberate — when we are not the sole
    // holder the claim is left unspent, so a later sole holder can take it.
    this.ownsLink = this.ring.refCount <= 1 && this.ring.claimSetup();

    if (this.ownsLink) {
      // Push phone clock so ring timestamps stay coherent.
      try { await this.ring.device.setDateTime(); } catch { /* not fatal */ }

      // Turn on continuous health monitoring.
      try { await this.ring.device.setHealthMonitorMaster(true); } catch { /* not fatal */ }
    }

    // Prime the SpO2/temperature companions from stored history.
    await this.refreshCompanions();

    if (this.ownsLink) {
      // Prime battery once so the app has an immediate signal even if no HR
      // samples arrive right away.
      try {
        const bat = await this.ring.device.getBattery();
        this.lastBattery = bat.percent;
      } catch { /* ignore */ }

      // Periodic battery poll keeps the GATT link warm and gives the UI a
      // heartbeat that the connection is alive. A joiner skips it — the owner
      // is already keeping the link warm, and a second poller only adds
      // contention.
      if (this.opts.batteryRefreshMs !== null) {
        const period = this.opts.batteryRefreshMs ?? 60_000;
        this.batteryTimer = setInterval(() => this.pingBattery(), period);
      }
    }

    // A session — and only a session — drives the ring to actually measure HRV
    // and SpO2 while the user is watching. Ambient capture leaves that to the
    // on-ring timer configured in monitoring.ts.
    if (mode === 'session') this.startLiveVitalsCycle();
  }

  async stop(): Promise<void> {
    this.stopLiveVitalsCycle();
    if (this.batteryTimer) { clearInterval(this.batteryTimer); this.batteryTimer = null; }
    this.unsubscribeFrames?.();
    this.unsubscribeFrames = null;
    if (this.ring) { await this.ring.disconnect(); this.ring = null; }
    this.onSample = null;
    this.freshSpo2 = null;
    this.freshTempC = null;
    this.freshHrv = null;
    this.lastBpm = 0;
    this.ownsLink = false;
  }

  /**
   * Vibrate the ring. Earlier this was a no-op because the SR16 was thought
   * motorless; the firmware opcode table (0xDF · vibration find-ring) shows
   * it does support it.
   *
   * The RingService interface takes a BuzzPattern { pattern: number[] } where
   * even indices are "on" durations and odd indices are gaps. We can only
   * send discrete pulses (0xDF is one-shot), so we count on-segments to derive
   * how many times to buzz: pattern [200] → 1 pulse, [100,80,100] → 2 pulses,
   * [100,80,100,80,100] → 3 pulses. Cap at 5 to be gentle on the motor.
   */
  async buzz(pattern: BuzzPattern): Promise<void> {
    if (!this.ring) return;
    const onSegments = Math.max(1, Math.ceil((pattern.pattern?.length ?? 1) / 2));
    const pulses = Math.min(5, onSegments);
    try {
      await this.ring.device.vibrate(pulses);
    } catch (e) {
      // Non-fatal — some SR16 firmware revs don't accept the opcode.
      console.warn('[SadhanaRing] vibrate failed:', (e as Error).message);
    }
  }

  /** Current battery percent, or null if we haven't queried yet. */
  getLastBattery(): number | null { return this.lastBattery; }

  private async pingBattery(): Promise<void> {
    if (!this.ring) return;
    try {
      const bat = await this.ring.device.getBattery();
      this.lastBattery = bat.percent;
    } catch { /* transient */ }
    // Cheap piggyback: keep the companion readings current on the same tick.
    await this.refreshCompanions();
  }

  /**
   * Best-effort frame → RingSample decoder. Only fires for opcodes whose
   * payload layout we've confirmed against real captures. Everything else
   * is passed through to the user's onFrame observer for downstream decoding.
   */
  private tryDecodeSample(frame: JieliFrame): RingSample | null {
    // {2, 3, 16} continuous-HR notify — payload [minInterval, maxInterval, hr].
    if (frame.cmd === 0x02 && frame.key === 0x03 && frame.keyFlag === 0x10) {
      const hr = frame.payload[2];
      if (hr && hr > 20 && hr < 220) {
        // Every live beat is history too: record it so the KPIs still have
        // this reading after the screen unmounts.
        void vitalsRepo
          .insertMany([{ metric: 'hr', ts: Date.now(), value: hr, source: 'live' }])
          .catch(() => { /* storage is best-effort; never break the stream */ });
        this.lastBpm = hr;
        return this.buildSample(hr);
      }
    }

    // {2, 9, 16} SpO2 and {2, 10, 16} HRV live notifies. These are the same
    // shape as the HR push above — the sync cluster numbers metrics
    // identically — but this firmware's payload layout for them is NOT
    // confirmed, so only a value sitting where HR puts its value is trusted.
    // Anything else is logged for decoding and left to the verified history
    // pull that closes each measurement window.
    if (frame.cmd === 0x02 && frame.keyFlag === 0x10 && (frame.key === 0x09 || frame.key === 0x0a)) {
      const metric = frame.key === 0x09 ? 'spo2' : 'hrv';
      const value = this.decodeCompanionPush(metric, frame.payload);
      if (value !== null) {
        this.livePushSeen.add(metric);
        this.livePushThisWindow = metric;
        return this.applyCompanion(metric, value);
      }
    }
    return null;
  }

  /**
   * Read a live SpO2/HRV push. Accepts only offset 2 — where the verified
   * {2,3,16} heart-rate push carries its value — and only when the result is
   * physiologically plausible. HRV's plausible band is nearly every non-zero
   * byte, so scanning the payload for "something that looks right" would
   * happily return a fragment of a timestamp; better to decline and let the
   * verified {5,10,16} pull supply the number.
   */
  private decodeCompanionPush(metric: 'spo2' | 'hrv', payload: Uint8Array): number | null {
    const raw = payload.length > 2 ? payload[2] : payload.length === 1 ? payload[0] : undefined;
    const lo = metric === 'spo2' ? 70 : 5;
    const hi = metric === 'spo2' ? 100 : 300;
    if (raw === undefined || raw < lo || raw > hi) {
      if (!this.livePushSeen.has(metric) && this.pushLogs < 6) {
        this.pushLogs++;
        // eslint-disable-next-line no-console
        console.log(
          `[SadhanaRing] live ${metric} push not decoded — payload ${Array.from(payload).join(',')}`
        );
      }
      return null;
    }
    return raw;
  }

  private pushLogs = 0;

  /**
   * Record a fresh SpO2/HRV reading and turn it into a sample immediately.
   *
   * Emitting right away matters: these arrive far less often than heart rate,
   * and waiting to fold them into the next HR frame is what made the session
   * HUD look like it was showing a stale number.
   */
  private applyCompanion(metric: 'spo2' | 'hrv', value: number): RingSample {
    if (metric === 'spo2') this.freshSpo2 = value;
    else this.freshHrv = value;
    void vitalsRepo
      .insertMany([{ metric, ts: Date.now(), value, source: 'live' }])
      .catch(() => { /* best-effort */ });
    return this.buildSample(this.lastBpm);
  }

  // ── Live measurement cycle ──────────────────────────────────────────────

  private startLiveVitalsCycle(): void {
    if (this.liveRunning) return;
    this.liveRunning = true;
    this.liveCycleIndex = 0;
    // First window starts immediately — the user just pressed Start.
    this.liveTimer = setTimeout(() => void this.runLiveWindow(), 0);
  }

  private stopLiveVitalsCycle(): void {
    this.liveRunning = false;
    if (this.liveTimer) { clearTimeout(this.liveTimer); this.liveTimer = null; }
  }

  /**
   * Arm one metric, hold it for LIVE_WINDOW_MS, release it, then read the
   * result. `withLiveMetric` guarantees the release even if the wait throws,
   * which is the invariant the ring's sensor loop depends on.
   */
  private async runLiveWindow(): Promise<void> {
    this.liveTimer = null;
    if (!this.liveRunning || !this.ring) return;

    const metric = LIVE_CYCLE[this.liveCycleIndex % LIVE_CYCLE.length];
    this.liveCycleIndex++;
    this.livePushThisWindow = null;

    try {
      await this.ring.withLiveMetric(
        metric,
        () => new Promise<void>((resolve) => setTimeout(resolve, LIVE_WINDOW_MS))
      );
      // The push, if this firmware sends one, already updated the companion
      // during the window. Otherwise fall back to the channel whose record
      // layout is verified — the ring has just measured, so its newest stored
      // sample is the reading we asked for.
      if (this.livePushThisWindow !== metric) await this.pullLatest(metric);
    } catch (e) {
      // A refused or timed-out window is not worth surfacing — the next one
      // will try again, and the stored history keeps the UI populated.
      // eslint-disable-next-line no-console
      console.log(`[SadhanaRing] live ${metric} window failed: ${(e as Error).message}`);
    }

    if (!this.liveRunning) return;
    this.liveTimer = setTimeout(() => void this.runLiveWindow(), LIVE_GAP_MS);
  }

  /** One-page priority pull of a metric's newest stored sample. */
  private async pullLatest(metric: 'spo2' | 'hrv'): Promise<void> {
    if (!this.ring) return;
    const res = metric === 'spo2'
      ? await this.ring.sync.sync<Spo2Sample>('spo2', { priority: true, maxPages: 2 })
      : await this.ring.sync.sync<HrvSample>('hrv', { priority: true, maxPages: 2 });
    if (res.samples.length === 0) return;

    // Persist the whole page — reads are destructive (the ring drops a page
    // once it is ACKed), so anything decoded here has to be kept.
    const rows = res.samples.map((s) => ({
      metric,
      ts: s.timestamp.getTime(),
      value: metric === 'spo2' ? (s as Spo2Sample).spo2 : (s as HrvSample).hrv,
      source: 'live' as const,
    }));
    await vitalsRepo.insertMany(rows).catch(() => { /* best-effort */ });

    const newest = rows[rows.length - 1];
    if (metric === 'spo2') this.freshSpo2 = newest.value;
    else this.freshHrv = newest.value;
    this.onSample?.(this.buildSample(this.lastBpm));
  }

  /**
   * Build a RingSample from the current readings.
   *
   * `rrMs` is deliberately empty: the SR16 reports HR only, and a mean R-R
   * reconstructed from BPM has no beat-to-beat variance, so feeding it to the
   * RMSSD calculator would yield a fabricated HRV. Real HRV rides on the `hrv`
   * field instead, measured by the ring's own firmware.
   *
   * SpO2, HRV and skin temperature are carried from the most recent *measured*
   * readings when they are still fresh; otherwise 0 ("not measured").
   */
  private buildSample(bpm: number): RingSample {
    return {
      bpm,
      rrMs: [],
      spo2: this.freshSpo2 ?? 0,
      hrv: this.freshHrv ?? 0,
      skinTempC: this.freshTempC ?? 0,
      accelMag: 0,
      gyroMag: 0,
      bvpVelocity: 0,
      receivedAt: Date.now(),
    };
  }

  /** Refresh the cached SpO2/HRV/temperature companions to the live HR stream. */
  private async refreshCompanions(): Promise<void> {
    const fresh = async (metric: 'spo2' | 'temp' | 'hrv'): Promise<number | null> => {
      try {
        const row = await vitalsRepo.latest(metric);
        if (!row) return null;
        return Date.now() - row.ts <= COMPANION_FRESHNESS_MS ? row.value : null;
      } catch {
        return null;
      }
    };
    this.freshSpo2 = await fresh('spo2');
    this.freshTempC = await fresh('temp');
    this.freshHrv = await fresh('hrv');
  }
}
