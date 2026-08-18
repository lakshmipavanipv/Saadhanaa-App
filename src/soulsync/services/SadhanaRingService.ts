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
 *     SpO2 / battery frame, emits a RingSample.
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
} from '../ring';
import type { BuzzPattern, RingSample, RingService, SampleHandler } from './RingTelemetryService';
import { readSr16DeviceId } from '../ring/japaCounter';
import { vitalsRepo } from '../db/vitalsRepo';

/** SpO2/temperature older than this no longer describes the current moment. */
const COMPANION_FRESHNESS_MS = 6 * 60 * 60 * 1000;   // 6 h

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

  constructor(private readonly opts: SadhanaRingServiceOpts = {}) {}

  async start(onSample: SampleHandler, _mode?: 'ambient' | 'session'): Promise<void> {
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
      this.ring = await SadhanaRing.connect(savedId, { onFrame: observer });
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
      this.ring = await SadhanaRing.connect(chosen, { onFrame: observer });
    } else {
      this.ring = await SadhanaRing.connectByScan();
      // connectByScan doesn't take an observer — resubscribe.
      // (Callers who care about protocol observation should pass deviceId or onPickDevice.)
    }

    // Push phone clock so ring timestamps stay coherent.
    try { await this.ring.device.setDateTime(); } catch { /* not fatal */ }

    // Turn on continuous health monitoring.
    try { await this.ring.device.setHealthMonitorMaster(true); } catch { /* not fatal */ }

    // Prime the SpO2/temperature companions from stored history.
    await this.refreshCompanions();

    // Prime battery once so the app has an immediate signal even if no HR
    // samples arrive right away.
    try {
      const bat = await this.ring.device.getBattery();
      this.lastBattery = bat.percent;
    } catch { /* ignore */ }

    // Periodic battery poll keeps the GATT link warm and gives the UI a
    // heartbeat that the connection is alive.
    if (this.opts.batteryRefreshMs !== null) {
      const period = this.opts.batteryRefreshMs ?? 60_000;
      this.batteryTimer = setInterval(() => this.pingBattery(), period);
    }
  }

  async stop(): Promise<void> {
    if (this.batteryTimer) { clearInterval(this.batteryTimer); this.batteryTimer = null; }
    if (this.ring) { await this.ring.disconnect(); this.ring = null; }
    this.onSample = null;
    this.freshSpo2 = null;
    this.freshTempC = null;
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
        return this.sampleFromHr(hr);
      }
    }
    return null;
  }

  /**
   * Build a RingSample from a live heart-rate frame.
   *
   * `rrMs` is deliberately empty: the SR16 reports HR only, and a mean R-R
   * reconstructed from BPM has no beat-to-beat variance, so feeding it to the
   * RMSSD calculator would yield a fabricated HRV. Real HRV comes from the
   * ring's HRV channel via vitalsRepo.
   *
   * SpO2 and skin temperature are carried from the most recent *measured*
   * readings when they are still fresh; otherwise 0 ("not measured").
   */
  private sampleFromHr(bpm: number): RingSample {
    return {
      bpm,
      rrMs: [],
      spo2: this.freshSpo2 ?? 0,
      skinTempC: this.freshTempC ?? 0,
      accelMag: 0,
      gyroMag: 0,
      bvpVelocity: 0,
      receivedAt: Date.now(),
    };
  }

  /** Refresh the cached SpO2/temperature companions to the live HR stream. */
  private async refreshCompanions(): Promise<void> {
    const fresh = async (metric: 'spo2' | 'temp'): Promise<number | null> => {
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
  }
}
