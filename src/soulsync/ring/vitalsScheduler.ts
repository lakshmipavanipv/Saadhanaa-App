/**
 * vitalsScheduler — decides WHEN the app pulls vitals off the ring.
 *
 * Three modes, evaluated on every tick so the schedule follows the clock
 * without needing to be restarted:
 *
 *   japa   — a session is active. The BLE link is held open by JapaScreen's
 *            counter and heart-rate frames are stored as they arrive, so the
 *            scheduler does NOT poll: issuing a multi-channel sync over the
 *            same link competes with the bead-tap frames and has been observed
 *            to drop the connection. It runs one catch-up sync the moment the
 *            session ends instead.
 *   sleep  — inside the user's sleep window: every 30 minutes.
 *   normal — the interval chosen in Settings.
 *
 * Each run calls `syncAllRingVitals()`, which pulls every channel the ring
 * retains and upserts it into `vitals_sample`. Because that write is keyed on
 * (metric, timestamp), running more often costs a little battery but can never
 * corrupt or duplicate history.
 *
 * This is a foreground scheduler: it runs while the app process is alive. The
 * ring keeps measuring on its own regardless, so anything missed while the app
 * is closed is recovered by the next sync — the cadence controls how quickly
 * readings reach the phone, not whether they are captured.
 */

import { AppState, type AppStateStatus } from 'react-native';
import { syncAllRingVitals } from './ringVitalsSync';
import {
  vitalsPrefs,
  isWithinSleepWindow,
  SLEEP_INTERVAL_MIN,
  type VitalsPrefs,
} from '../settings/vitalsPrefs';

export type VitalsMode = 'japa' | 'sleep' | 'normal';

export interface SchedulerStatus {
  running: boolean;
  mode: VitalsMode;
  intervalMin: number;
  lastRunAt: number | null;
  lastError: string | null;
  nextRunAt: number | null;
}

/** The scheduler re-evaluates its cadence this often (cheap, no BLE). */
const TICK_MS = 30_000;

type StatusListener = (s: SchedulerStatus) => void;

class VitalsScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private unsubscribePrefs: (() => void) | null = null;
  private appStateSub: { remove(): void } | null = null;
  private running = false;
  private japaActive = false;
  private inFlight = false;
  private lastRunAt: number | null = null;
  private lastError: string | null = null;
  private prefs: VitalsPrefs | null = null;
  private listeners = new Set<StatusListener>();

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.prefs = await vitalsPrefs.get();

    // A pref change may shorten the cadence — re-evaluate immediately.
    this.unsubscribePrefs = vitalsPrefs.subscribe((p) => {
      this.prefs = p;
      this.emit();
      void this.maybeRun();
    });

    // Returning to the foreground is a good moment to catch up.
    this.appStateSub = AppState.addEventListener('change', (st: AppStateStatus) => {
      if (st === 'active') void this.maybeRun();
    });

    this.timer = setInterval(() => { void this.maybeRun(); }, TICK_MS);

    // Prime the history as soon as the app opens.
    void this.maybeRun();
    this.emit();
  }

  stop(): void {
    this.running = false;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.unsubscribePrefs?.(); this.unsubscribePrefs = null;
    this.appStateSub?.remove(); this.appStateSub = null;
    this.emit();
  }

  /**
   * JapaScreen calls this when the live ring link comes up or goes away.
   * While it is up the scheduler stays quiet; on release it syncs once.
   */
  setJapaActive(active: boolean): void {
    if (this.japaActive === active) return;
    this.japaActive = active;
    this.emit();
    // Leaving japa: pull everything the ring buffered during the session.
    if (!active) void this.run();
  }

  /** Force a sync now, regardless of cadence. Used by pull-to-refresh. */
  async syncNow(): Promise<void> {
    await this.run();
  }

  get mode(): VitalsMode {
    const p = this.prefs ?? vitalsPrefs.peek();
    if (this.japaActive && p.japaLiveEnabled) return 'japa';
    if (isWithinSleepWindow(p)) return 'sleep';
    return 'normal';
  }

  /**
   * Minutes between polled runs in the current mode. Japa reports 0 because it
   * does not poll at all — vitals stream over the held link.
   */
  get intervalMin(): number {
    const p = this.prefs ?? vitalsPrefs.peek();
    switch (this.mode) {
      case 'japa':  return 0;
      case 'sleep': return SLEEP_INTERVAL_MIN;
      default:      return p.intervalMin;
    }
  }

  status(): SchedulerStatus {
    const intervalMin = this.intervalMin;
    return {
      running: this.running,
      mode: this.mode,
      intervalMin,
      lastRunAt: this.lastRunAt,
      lastError: this.lastError,
      nextRunAt: this.lastRunAt && intervalMin > 0
        ? this.lastRunAt + intervalMin * 60_000
        : null,
    };
  }

  subscribe(l: StatusListener): () => void {
    this.listeners.add(l);
    l(this.status());
    return () => this.listeners.delete(l);
  }

  /** Run only if the current cadence says we are due. */
  private async maybeRun(): Promise<void> {
    if (!this.running || this.inFlight) return;
    // Never poll while the japa link is live — it would contend with taps.
    if (this.mode === 'japa') return;
    const dueAt = (this.lastRunAt ?? 0) + this.intervalMin * 60_000;
    if (this.lastRunAt !== null && Date.now() < dueAt) return;
    await this.run();
  }

  private async run(): Promise<void> {
    if (this.inFlight) return;
    this.inFlight = true;
    try {
      const result = await syncAllRingVitals();
      // "no SR16 paired" is an expected state, not a failure to surface loudly.
      this.lastError = result.errors.length > 0 ? result.errors[0] : null;
      this.lastRunAt = Date.now();
    } catch (e) {
      this.lastError = (e as Error).message;
      // Still stamp the attempt so a hard failure cannot spin the timer.
      this.lastRunAt = Date.now();
    } finally {
      this.inFlight = false;
      this.emit();
    }
  }

  private emit(): void {
    const s = this.status();
    this.listeners.forEach((l) => {
      try { l(s); } catch { /* isolate */ }
    });
  }
}

/** One scheduler per app lifecycle. */
export const vitalsScheduler = new VitalsScheduler();
