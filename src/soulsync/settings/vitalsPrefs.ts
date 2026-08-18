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
export const INTERVAL_CHOICES = [5, 10, 15, 30, 60, 120] as const;
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
}

export const DEFAULT_PREFS: VitalsPrefs = {
  intervalMin: 30,
  sleepModeEnabled: true,
  sleepStartHour: 22,
  sleepEndHour: 6,
  japaLiveEnabled: true,
};

const coerce = (raw: Partial<VitalsPrefs> | null | undefined): VitalsPrefs => {
  if (!raw) return { ...DEFAULT_PREFS };
  const interval = INTERVAL_CHOICES.includes(raw.intervalMin as IntervalChoice)
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
