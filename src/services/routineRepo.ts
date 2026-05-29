/**
 * routineRepo — user's Sankalpa (daily routine / resolve).
 *
 * Each RoutineItem is a single committed practice: what · how long · when ·
 * how often. Stored locally in AsyncStorage as a single JSON array.
 *
 * Today's Plan is derived dynamically from the routine + the day of week.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type RoutineCategory =
  | 'exercise' | 'yoga' | 'japa' | 'meditate' | 'sandhya' | 'festival';

export interface RoutineItem {
  id: string;
  category: RoutineCategory;
  /** Display name — e.g. "Walk", "Gayatri Japa", custom string. */
  name: string;
  /** Minutes the user intends to spend per occurrence. */
  durationMin: number;
  /** Optional daily time slot (e.g. "06:00"). Null = no time pinned. */
  time?: string | null;
  /** Daily, or selected weekdays (0=Sun … 6=Sat). */
  frequency: 'daily' | number[];
  /** True if the user typed a custom name rather than picking from the library. */
  custom?: boolean;
  /** Created timestamp. */
  createdAt: string;
  /** If reminder is on, holds the scheduled-notification ids keyed by day-of-week. */
  notificationIds?: Record<number, string>;
  /** For festivals: built-in shopping/prep list with done flags. */
  prepList?: Array<{ item: string; done: boolean }>;
  /** Multi-step routine path — e.g. a custom yoga kriya with sequenced
   *  poses, or a japa Sadhana Path (Ganapathi → Guru → Ishta → ...). */
  steps?: Array<{
    name: string;
    /** Numeric value of the step. */
    value: number;
    /** Unit: "min" for time, "malas" for japa beads (×108), "japas" raw count, "count" for reps. */
    unit: 'min' | 'malas' | 'japas' | 'count';
    /** Optional progress flag for during-execution checkoff. */
    done?: boolean;
  }>;
}

const KEY = 'sankalpa.routine.v1';

const load = async (): Promise<RoutineItem[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RoutineItem[]) : [];
  } catch { return []; }
};
const save = async (arr: RoutineItem[]): Promise<void> =>
  AsyncStorage.setItem(KEY, JSON.stringify(arr));

export const routineRepo = {
  async list(): Promise<RoutineItem[]> { return load(); },

  async add(entry: Omit<RoutineItem, 'id' | 'createdAt'>): Promise<RoutineItem> {
    const all = await load();
    const e: RoutineItem = {
      id: `routine-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    all.push(e);
    await save(all);
    return e;
  },

  async update(id: string, patch: Partial<RoutineItem>): Promise<void> {
    const all = await load();
    const idx = all.findIndex(e => e.id === id);
    if (idx < 0) return;
    all[idx] = { ...all[idx], ...patch };
    await save(all);
  },

  async remove(id: string): Promise<void> {
    const all = await load();
    await save(all.filter(e => e.id !== id));
  },

  /** Items scheduled for today, sorted by time (no-time items at end). */
  async today(): Promise<RoutineItem[]> {
    const all = await load();
    const dow = new Date().getDay();
    return all
      .filter(e => e.frequency === 'daily' || (Array.isArray(e.frequency) && e.frequency.includes(dow)))
      .sort((a, b) => {
        if (a.time && b.time) return a.time.localeCompare(b.time);
        if (a.time) return -1;
        if (b.time) return 1;
        return 0;
      });
  },

  /** Items grouped by category for the "My Routine" cards. */
  async byCategory(): Promise<Record<RoutineCategory, RoutineItem[]>> {
    const all = await load();
    const acc: Record<RoutineCategory, RoutineItem[]> = {
      exercise: [], yoga: [], japa: [], meditate: [], sandhya: [], festival: [],
    };
    for (const e of all) acc[e.category].push(e);
    return acc;
  },

  /** Total committed minutes/day (best-effort: daily + weekday-share). */
  async totalDailyMinutes(): Promise<number> {
    const all = await load();
    let mins = 0;
    for (const e of all) {
      if (e.frequency === 'daily') mins += e.durationMin;
      else if (Array.isArray(e.frequency)) mins += e.durationMin * (e.frequency.length / 7);
    }
    return Math.round(mins);
  },
};
