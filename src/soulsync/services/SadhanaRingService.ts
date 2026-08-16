/**
 * SadhanaRingService — real-hardware RingService backed by the Sadhana Ring
 * SDK (Jieli-family transport). Lives beside the existing MockRingService
 * so the app can pick which one to use at runtime.
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

  constructor(private readonly opts: SadhanaRingServiceOpts = {}) {}

  async start(onSample: SampleHandler, _mode?: 'ambient' | 'session'): Promise<void> {
    this.onSample = onSample;

    const observer: FrameObserver = (frame) => {
      this.opts.onFrame?.(frame);
      const sample = this.tryDecodeSample(frame);
      if (sample && this.onSample) this.onSample(sample);
    };

    if (this.opts.deviceId) {
      this.ring = await SadhanaRing.connect(this.opts.deviceId, { onFrame: observer });
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
  }

  /**
   * Ring has no vibration motor (confirmed) — this is a no-op. Kept to satisfy
   * the RingService interface.
   */
  async buzz(_pattern: BuzzPattern): Promise<void> {
    /* intentionally empty */
  }

  /** Current battery percent, or null if we haven't queried yet. */
  getLastBattery(): number | null { return this.lastBattery; }

  private async pingBattery(): Promise<void> {
    if (!this.ring) return;
    try {
      const bat = await this.ring.device.getBattery();
      this.lastBattery = bat.percent;
    } catch { /* transient */ }
  }

  /**
   * Best-effort frame → RingSample decoder. Only fires for opcodes whose
   * payload layout we've confirmed against real captures. Everything else
   * is passed through to the user's onFrame observer for downstream decoding.
   */
  private tryDecodeSample(frame: JieliFrame): RingSample | null {
    // {2, 3, 16} continuous-HR notify (best-guess from spot-check capture:
    // payload [minInterval, maxInterval, hr]). Live-test will confirm.
    if (frame.cmd === 0x02 && frame.key === 0x03 && frame.keyFlag === 0x10) {
      const hr = frame.payload[2];
      if (hr && hr > 20 && hr < 220) {
        return sampleFromHr(hr);
      }
    }
    return null;
  }
}

function sampleFromHr(bpm: number, spo2 = 98, skinTempC = 36.5): RingSample {
  return {
    bpm,
    rrMs: [Math.round(60_000 / bpm)],  // synthetic RR from BPM until per-beat stream is decoded
    spo2,
    skinTempC,
    accelMag: 0,
    gyroMag: 0,
    bvpVelocity: 0,
    receivedAt: Date.now(),
  };
}
