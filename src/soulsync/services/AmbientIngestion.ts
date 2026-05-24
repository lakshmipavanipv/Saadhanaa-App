import { MockRingService, RingSample } from './RingTelemetryService';
import { RMSSDCalculator } from '../hrv/RMSSDCalculator';
import { ambientBaselineRepo, ActivityState } from '../db/ambientBaselineRepo';
import { EmotionalEngine, setEmotionalEngine, getEmotionalEngine } from '../emotional/EmotionalEngine';
import { getDB } from '../db/database';

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
  // Step counter — accumulates and flushes to daily_activity hourly
  private stepsToday = 0;
  private lastStepDate = '';
  private lastStepFlush = 0;
  private accelLastValue = 0;

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;

    // Lazily provision the EmotionalEngine singleton
    if (!getEmotionalEngine()) setEmotionalEngine(new EmotionalEngine(this.ring));
    const engine = getEmotionalEngine();

    // Daily depressive-cycle check on boot
    void engine?.dailyCheck();

    await this.ring.start((s: RingSample) => {
      if (this.paused) return;
      this.lastBpm = s.bpm;
      this.lastSpo2 = s.spo2;
      this.lastSkinTempC = s.skinTempC;
      // Feed RMSSD calc
      for (const rr of s.rrMs) {
        const snap = this.rmssd.addRR(rr, s.receivedAt);
        engine?.updateRmssd(snap.rmssd);
      }
      // Step counting — accelMag peaks above a stride threshold count as steps.
      // Standard wearable algorithm: count "above-then-below" crossings of 1.2 m/s².
      if (this.accelLastValue < 1.2 && s.accelMag >= 1.2) {
        this.stepsToday += 1;
      }
      this.accelLastValue = s.accelMag;
      // Feed real-time emotional detectors
      void engine?.ingest(s);
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
      await this.flushSteps();
    }, 60_000);
  }

  /** Upsert today's accumulated step count into daily_activity. */
  private async flushSteps(): Promise<void> {
    const today = new Date().toISOString().slice(0, 10);
    // New day → reset counter
    if (today !== this.lastStepDate) {
      this.stepsToday = 0;
      this.lastStepDate = today;
    }
    if (Date.now() - this.lastStepFlush < 60_000) return;
    this.lastStepFlush = Date.now();
    try {
      const db = await getDB();
      // active_minutes = approx minutes since last flush where step rate > 30/min
      await db.runAsync(
        `INSERT INTO daily_activity (activity_date, step_count, active_minutes)
         VALUES (?, ?, ?)
         ON CONFLICT(activity_date) DO UPDATE SET
           step_count = excluded.step_count,
           active_minutes = excluded.active_minutes`,
        [today, this.stepsToday, Math.round(this.stepsToday / 110)]  // ~110 steps/active-min
      );
    } catch { /* soft-fail */ }
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
