import { MockRingService, RingSample } from './RingTelemetryService';
import { RMSSDCalculator } from '../hrv/RMSSDCalculator';
import { ambientBaselineRepo, ActivityState } from '../db/ambientBaselineRepo';

/**
 * AmbientIngestionService — captures passive ring telemetry during
 * non-session hours and writes one snapshot per minute into `ambient_baseline`.
 *
 * Currently driven by MockRingService for software-only development.
 * Swap to BleRingService once hardware is available.
 */
export class AmbientIngestionService {
  private ring = new MockRingService();
  private rmssd = new RMSSDCalculator({ baselineDurationSec: 0 });
  private running = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private lastBpm = 72;
  private lastSpo2 = 97.5;
  private lastSkinTempC = 36.5;
  private currentActivity: ActivityState = 'idle';
  // Single-flight guard: don't run both ambient + session at the same time
  private paused = false;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    await this.ring.start((s: RingSample) => {
      if (this.paused) return;
      this.lastBpm = s.bpm;
      this.lastSpo2 = s.spo2;
      this.lastSkinTempC = s.skinTempC;
      for (const rr of s.rrMs) this.rmssd.addRR(rr, s.receivedAt);
    }, 'ambient');

    // Flush one row per minute
    this.flushTimer = setInterval(async () => {
      if (this.paused) return;
      const snap = this.rmssd.addRR(60_000 / this.lastBpm); // gentle nudge
      await ambientBaselineRepo.insert({
        timestamp: new Date().toISOString(),
        ambient_bpm: this.lastBpm,
        ambient_rmssd: snap.rmssd ?? 0,
        activity_state: this.currentActivity,
        spo2: this.lastSpo2,
        skin_temp_c: this.lastSkinTempC,
      });
    }, 60_000);
  }

  /** Pause writes while a Japa session owns the ring stream. */
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  setActivity(state: ActivityState): void {
    this.currentActivity = state;
  }

  async stop(): Promise<void> {
    this.running = false;
    if (this.flushTimer) clearInterval(this.flushTimer);
    this.flushTimer = null;
    await this.ring.stop();
  }
}

// Singleton — one ambient stream per app lifecycle
export const ambientIngestion = new AmbientIngestionService();
