import { createDefaultRing, type RingService, type RingSample } from './RingTelemetryService';
import { RMSSDCalculator } from '../hrv/RMSSDCalculator';
import { ambientBaselineRepo, ActivityState } from '../db/ambientBaselineRepo';
import { EmotionalEngine, setEmotionalEngine, getEmotionalEngine } from '../emotional/EmotionalEngine';
import { vitalsRepo } from '../db/vitalsRepo';
import { vitalsSafetyWatcher } from '../safety/VitalsSafetyWatcher';

/** A stored reading older than this is too stale to describe "now". */
const FRESHNESS_MS = 6 * 60 * 60 * 1000;   // 6 h

/**
 * AmbientIngestionService — captures passive ring telemetry during
 * non-session hours and writes one snapshot per minute into `ambient_baseline`.
 *
 * Driven by the real SR16 over BLE. If no ring is paired, `start()` throws and
 * ambient capture simply stays off — the app shows an unpaired state rather
 * than writing invented baselines into the table.
 *
 * Every column written here is measured, never inferred:
 *   • ambient_bpm   — live heart-rate frames off the held link.
 *   • ambient_rmssd — the ring's own HRV channel ({5,10,16}) via vitalsRepo,
 *     because the SR16 does not expose per-beat R-R intervals. It is NOT
 *     derived from BPM; a mean RR reconstructed from heart rate has zero
 *     beat-to-beat variance and would report a meaningless HRV.
 *   • spo2 / skin_temp_c — the ring's SpO2 and temperature channels, used
 *     only while still fresh.
 *
 * A row is written only once a real heart-rate frame has arrived. Steps are
 * owned exclusively by `ringVitalsSync` (the ring's {5,2,16} step channel) —
 * this service must never touch daily_activity, or it would overwrite the
 * ring's real counts with a number it has no sensor to produce.
 */
/**
 * One live reading the UI can subscribe to while no Soul Sync sitting is open.
 *
 * The ring streams frames whether or not the user has tapped Start. Yoga and
 * Meditation now show a live graph the moment the screen mounts — no bar to
 * press — and that graph needs a data source outside the session hook. This
 * mirrors a RingSample but is trimmed to the four channels the live tiles draw.
 */
export interface AmbientLiveSample {
  /** Beats per minute. null means "not yet reported". */
  bpm: number | null;
  /** Blood oxygen %. null when the ring has not taken a reading. */
  spo2: number | null;
  /** The ring's own HRV figure in ms. null when the ring has not armed HRV. */
  hrv: number | null;
  /** Skin temperature °C. null when no reading exists. */
  skinTempC: number | null;
  /** When the ring reported this sample. */
  at: number;
}

export type AmbientLiveListener = (s: AmbientLiveSample) => void;

export class AmbientIngestionService {
  private ring: RingService = createDefaultRing();
  private rmssd = new RMSSDCalculator({ baselineDurationSec: 0 });
  private running = false;
  private starting = false;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  /** null until the ring actually reports one — never seeded with a guess. */
  private lastBpm: number | null = null;
  private lastSpo2: number | null = null;
  private lastSkinTempC: number | null = null;
  private liveRmssd: number | null = null;
  private currentActivity: ActivityState = 'idle';
  // Single-flight guard: don't run both ambient + session at the same time
  private paused = false;
  /** UI listeners that want every ring frame — see subscribeLive(). */
  private liveListeners = new Set<AmbientLiveListener>();

  async start(): Promise<void> {
    // `running` is claimed only once the ring is actually streaming. Setting it
    // up front meant a launch with the ring out of range left it stuck true, so
    // nothing could ever bring ambient capture up again for that app session.
    // `starting` covers the window in between so two callers can't overlap.
    if (this.running || this.starting) return;
    this.starting = true;
    try {

    // Lazily provision the EmotionalEngine singleton
    if (!getEmotionalEngine()) setEmotionalEngine(new EmotionalEngine(this.ring));
    const engine = getEmotionalEngine();

    // Daily depressive-cycle check on boot
    void engine?.dailyCheck();

    await this.ring.start((s: RingSample) => {
      if (this.paused) return;
      if (s.bpm > 0) this.lastBpm = s.bpm;
      if (s.spo2 > 0) this.lastSpo2 = s.spo2;
      if (s.skinTempC > 0) this.lastSkinTempC = s.skinTempC;

      // Fan out to any UI subscribers. The live graphs on Yoga and Meditation
      // use this to draw whether or not a Soul Sync sitting is open — the ring
      // is streaming either way, and hiding the trace behind a Start button
      // just made the graph look broken whenever the user hadn't tapped it.
      // 0 is this stream's "not measured" sentinel, so it is passed through as
      // null to keep subscribers from charting zeros.
      if (this.liveListeners.size > 0) {
        const emit: AmbientLiveSample = {
          bpm: s.bpm > 0 ? s.bpm : null,
          spo2: s.spo2 > 0 ? s.spo2 : null,
          hrv: s.hrv > 0 ? s.hrv : null,
          skinTempC: s.skinTempC > 0 ? s.skinTempC : null,
          at: s.receivedAt,
        };
        for (const fn of this.liveListeners) {
          try { fn(emit); } catch { /* one bad listener must not stop the rest */ }
        }
      }

      // Feed the physical-crisis watcher. Distinct from the emotional engine
      // just below — this one looks for hard thresholds (SpO2 < 90, HR too
      // high or too low) and escalates to an SMS + dialler, not a breathing
      // exercise. A zero/placeholder reading is skipped so a brief ring
      // dropout doesn't look like a flatline.
      if (s.bpm > 0) vitalsSafetyWatcher.ingestHr(s.bpm, s.receivedAt);
      if (s.spo2 > 0) vitalsSafetyWatcher.ingestSpo2(s.spo2, s.receivedAt);

      // Only real R-R intervals feed the HRV calculator. On the SR16 this
      // stream is empty, so `liveRmssd` stays null and the flush falls back
      // to the ring's own HRV channel below.
      for (const rr of s.rrMs) {
        const snap = this.rmssd.addRR(rr, s.receivedAt);
        this.liveRmssd = snap.rmssd;
        engine?.updateRmssd(snap.rmssd);
      }

      // Feed real-time emotional detectors
      void engine?.ingest(s);
    }, 'ambient');

    this.running = true;

    // Flush one row per minute
    this.flushTimer = setInterval(() => { void this.flush(); }, 60_000);
    } finally {
      this.starting = false;
    }
  }

  /**
   * Write one ambient snapshot. No-ops until a real heart rate has arrived —
   * an empty row would poison every baseline that reads this table.
   */
  private async flush(): Promise<void> {
    if (this.paused || this.lastBpm === null) return;

    const rmssd = this.liveRmssd ?? (await this.freshStored('hrv'));
    const spo2 = this.lastSpo2 ?? (await this.freshStored('spo2'));
    const skinTemp = this.lastSkinTempC ?? (await this.freshStored('temp'));

    await ambientBaselineRepo.insert({
      timestamp: new Date().toISOString(),
      ambient_bpm: Math.round(this.lastBpm),
      // 0 is this table's "not measured" sentinel — consumers guard with `> 0`.
      ambient_rmssd: rmssd ?? 0,
      activity_state: this.currentActivity,
      spo2: spo2 ?? undefined,
      skin_temp_c: skinTemp ?? undefined,
    });
  }

  /** Latest stored reading for a metric, or null if absent or too old. */
  private async freshStored(metric: 'hrv' | 'spo2' | 'temp'): Promise<number | null> {
    try {
      const row = await vitalsRepo.latest(metric);
      if (!row) return null;
      return Date.now() - row.ts <= FRESHNESS_MS ? row.value : null;
    } catch {
      return null;
    }
  }

  /** Pause writes while a Japa session owns the ring stream. */
  pause(): void { this.paused = true; }
  resume(): void { this.paused = false; }

  /**
   * Subscribe to every live ring sample while ambient capture is running.
   *
   * Returns an unsubscribe function. If ambient capture is currently paused
   * (because a session owns the ring stream), subscribers simply wait quietly
   * until it resumes — nothing is buffered.
   */
  subscribeLive(fn: AmbientLiveListener): () => void {
    this.liveListeners.add(fn);
    return () => { this.liveListeners.delete(fn); };
  }

  /**
   * The latest snapshot the ambient stream has captured, for subscribers that
   * want to seed their first render without waiting for the next ring frame.
   * Any field may be null when nothing has been measured yet.
   */
  snapshot(): AmbientLiveSample {
    return {
      bpm: this.lastBpm,
      spo2: this.lastSpo2,
      hrv: this.liveRmssd,
      skinTempC: this.lastSkinTempC,
      at: Date.now(),
    };
  }

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
