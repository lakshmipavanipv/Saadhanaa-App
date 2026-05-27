/**
 * exerciseRepo — CRUD for ExerciseEntry rows.
 * Stored in AsyncStorage as a single JSON array under one key.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExerciseEntry, BodyActivity } from '../types';

const KEY = 'soulsync.exercise.v1';

const load = async (): Promise<ExerciseEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as ExerciseEntry[]) : [];
  } catch { return []; }
};
const save = async (arr: ExerciseEntry[]): Promise<void> =>
  AsyncStorage.setItem(KEY, JSON.stringify(arr));

export const exerciseRepo = {
  async list(): Promise<ExerciseEntry[]> { return load(); },

  async add(entry: Omit<ExerciseEntry, 'id'>): Promise<ExerciseEntry> {
    const all = await load();
    const e: ExerciseEntry = { id: `ex-${Date.now()}`, ...entry };
    all.push(e);
    await save(all);
    return e;
  },

  async remove(id: string): Promise<void> {
    const all = await load();
    await save(all.filter(e => e.id !== id));
  },

  /** Aggregate today's minutes across all body activities. */
  async todayMinutes(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const all = await load();
    return all
      .filter(e => e.date === today)
      .reduce((s, e) => s + e.durationMin, 0);
  },

  /** Breakdown by activity for the given window (default last 7 days). */
  async breakdown(days: number = 7): Promise<{ activity: BodyActivity; minutes: number; count: number }[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const all = await load();
    const acc = new Map<BodyActivity, { minutes: number; count: number }>();
    for (const e of all) {
      if (e.date < cutoff) continue;
      const cur = acc.get(e.activity) || { minutes: 0, count: 0 };
      cur.minutes += e.durationMin;
      cur.count += 1;
      acc.set(e.activity, cur);
    }
    return [...acc.entries()].map(([activity, v]) => ({ activity, ...v }))
      .sort((a, b) => b.minutes - a.minutes);
  },
};
