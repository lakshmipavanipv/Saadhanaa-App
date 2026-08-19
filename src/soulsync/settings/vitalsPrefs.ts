/**
 * vitalsPrefs — how often the app asks the ring for a measurement.
 *
 * Three cadences, chosen automatically by `vitalsScheduler`:
 *
 *   • Japa   — the BLE link is held open for the whole session, so readings
 *              arrive continuously rather than on a timer.
 *   • Sleep  — inside the user's sleep window, every 30 minutes. Frequent
 *              enough to resolve sleep stages, sparse enough to survive the
 *              night on the ring's battery.
 *   • Normal — the rest of the day, on the interval the user picks.
 *
 * Persisted with AsyncStorage so the choice survives a restart.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'soulsync.vitalsPrefs';

/** Selectable day-time cadences, in minutes. */
/**
 * Poll intervals in minutes.
 *
 * 2 minutes is the default because that is roughly what RWfit does. In its
 * capture the gaps between consecutive {5,10,16} requests were 89, 87, 99,
 * 89, 41, 46 and 53 seconds — call it ~90 s while the app is in use.
 *
 * The cadence matters far more than it looks. The ring's history buffer is
 * empty almost all the time; it fills occasionally, and reading it is
 * destructive — once a page is ACKed the ring drops it. Across 49 minutes
 * RWfit polled HRV 13 times and got data exactly once. Polling every 30
 * minutes, as this used to, samples that rare window ~20x less often, which
 * is why HRV and sleep stayed blank while the ring itself showed values.
 */
export const INTERVAL_CHOICES = [2, 5, 10, 15, 30, 60, 120] as const;
export type IntervalChoice = (typeof INTERVAL_CHOICES)[number];

/** Sleep-window cadence is fixed at 30 minutes by product requirement. */
export const SLEEP_INTERVAL_MIN = 30;

export interface VitalsPrefs {
  /** Daytime measurement interval in minutes. */
  intervalMin: IntervalChoice;
  /** Measure every 30 min while asleep. */
  sleepModeEnabled: boolean;
  /** Sleep window start hour, local 0-23 (inclusive). */
  sleepStartHour: number;
  /** Sleep window end hour, local 0-23 (exclusive). May wrap past midnight. */
  sleepEndHour: number;
  /** Hold the BLE link open for the whole japa session. */
  japaLiveEnabled: boolean;

  // ── On-ring sampling schedule (see soulsync/ring/monitoring.ts) ─────────
  // These do NOT control how often the phone polls; they tell the RING how
  // often to take a reading. Without them the ring stores almost nothing and
  // the history channels come back empty however often we ask.
  /** Master switch for the ring's own timed monitoring. */
  ringMonitorEnabled: boolean;
  /** Minutes between on-ring samples. RWfit's HrMonitorBean defaults to 10. */
  ringMonitorIntervalMin: RingMonitorInterval;
  /** Start of the daily window the ring samples in, local hour 0-23. */
  ringMonitorStartHour: number;
  /** End of that window, local hour 0-23. */
  ringMonitorEndHour: number;
}

/** Sampling intervals offered for the ring's own schedule. */
export const RING_MONITOR_INTERVALS = [5, 10, 15, 30, 60] as const;
export type RingMonitorInterval = (typeof RING_MONITOR_INTERVALS)[number];

export const DEFAULT_PREFS: VitalsPrefs = {
  intervalMin: 2,
  sleepModeEnabled: true,
  sleepStartHour: 22,
  sleepEndHour: 6,
  japaLiveEnabled: true,
  // On by default and across the whole day. RWfit ships this OFF with a
  // 09:00-18:00 window, which is exactly why its own capture shows an almost
  // empty HRV history — the ring was never recording. A full-day window is
  // the deviation that makes overnight HRV and sleep actually exist.
  ringMonitorEnabled: true,
  ringMonitorIntervalMin: 10,
  ringMonitorStartHour: 0,
  ringMonitorEndHour: 23,
};

const coerce = (raw: Partial<VitalsPrefs> | null | undefined): VitalsPrefs => {
  if (!raw) return { ...DEFAULT_PREFS };
  // 30 was the old default and it is far too slow to catch the ring's history
  // window (see INTERVAL_CHOICES). Anyone still carrying it never chose it —
  // it was simply what shipped — so migrate them onto the new default. A
  // deliberate 30 can still be re-selected in Settings, which writes it back
  // alongside other non-default fields and so survives this.
  const stale30 = raw.intervalMin === 30 && raw.sleepStartHour === undefined;
  const interval = stale30
    ? DEFAULT_PREFS.intervalMin
    : INTERVAL_CHOICES.includes(raw.intervalMin as IntervalChoice)
      ? (raw.intervalMin as IntervalChoice)
      : DEFAULT_PREFS.intervalMin;
  const hour = (h: unknown, fallback: number): number =>
    typeof h === 'number' && Number.isInteger(h) && h >= 0 && h <= 23 ? h : fallback;
  return {
    intervalMin: interval,
    sleepModeEnabled: raw.sleepModeEnabled ?? DEFAULT_PREFS.sleepModeEnabled,
    sleepStartHour: hour(raw.sleepStartHour, DEFAULT_PREFS.sleepStartHour),
    sleepEndHour: hour(raw.sleepEndHour, DEFAULT_PREFS.sleepEndHour),
    japaLiveEnabled: raw.japaLiveEnabled ?? DEFAULT_PREFS.japaLiveEnabled,
    ringMonitorEnabled: raw.ringMonitorEnabled ?? DEFAULT_PREFS.ringMonitorEnabled,
    ringMonitorIntervalMin: RING_MONITOR_INTERVALS.includes(
      raw.ringMonitorIntervalMin as RingMonitorInterval
    )
      ? (raw.ringMonitorIntervalMin as RingMonitorInterval)
      : DEFAULT_PREFS.ringMonitorIntervalMin,
    ringMonitorStartHour: hour(raw.ringMonitorStartHour, DEFAULT_PREFS.ringMonitorStartHour),
    ringMonitorEndHour: hour(raw.ringMonitorEndHour, DEFAULT_PREFS.ringMonitorEndHour),
  };
};

/** Listeners are notified whenever prefs change, so the scheduler re-times itself. */
type Listener = (p: VitalsPrefs) => void;
const listeners = new Set<Listener>();
let cached: VitalsPrefs | null = null;

export const vitalsPrefs = {
  async get(): Promise<VitalsPrefs> {
    if (cached) return cached;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      cached = coerce(raw ? JSON.parse(raw) : null);
    } catch {
      cached = { ...DEFAULT_PREFS };
    }
    return cached;
  },

  /** Synchronous read of the last loaded value — for render paths. */
  peek(): VitalsPrefs {
    return cached ?? { ...DEFAULT_PREFS };
  },

  async set(patch: Partial<VitalsPrefs>): Promise<VitalsPrefs> {
    const next = coerce({ ...(await this.get()), ...patch });
    cached = next;
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* a failed write still applies for this session */
    }
    listeners.forEach((l) => {
      try { l(next); } catch { /* isolate */ }
    });
    return next;
  },

  subscribe(l: Listener): () => void {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};

/**
 * Is `date` inside the sleep window? Handles windows that wrap midnight
 * (22:00 → 06:00 is the default and is the wrapping case).
 */
export const isWithinSleepWindow = (p: VitalsPrefs, date = new Date()): boolean => {
  if (!p.sleepModeEnabled) return false;
  const h = date.getHours();
  const { sleepStartHour: start, sleepEndHour: end } = p;
  if (start === end) return false;
  return start < end ? h >= start && h < end : h >= start || h < end;
};

/** Human-readable cadence label, e.g. "Every 30 min". */
export const describeInterval = (min: number): string =>
  min % 60 === 0 ? `Every ${min / 60} hr` : `Every ${min} min`;
