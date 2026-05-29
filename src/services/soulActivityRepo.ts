/**
 * soulActivityRepo — log soul-side activities (meditation, breath work, japa,
 * tratak, etc.) so Dashboard's "soul time today" can include practices that
 * weren't tracked via the japa counter.
 *
 * Stored in AsyncStorage under a single key. Each entry is a plain object;
 * no DB migration needed.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { SoulActivity } from '../types';

export interface SoulEntry {
  id: string;
  activity: SoulActivity;
  durationMin: number;
  date: string;   // YYYY-MM-DD
  note?: string;
}

const KEY = 'soulsync.soul.v1';

const load = async (): Promise<SoulEntry[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SoulEntry[]) : [];
  } catch { return []; }
};
const save = async (arr: SoulEntry[]): Promise<void> =>
  AsyncStorage.setItem(KEY, JSON.stringify(arr));

export const soulActivityRepo = {
  async list(): Promise<SoulEntry[]> { return load(); },

  async add(entry: Omit<SoulEntry, 'id'>): Promise<SoulEntry> {
    const all = await load();
    const e: SoulEntry = { id: `soul-${Date.now()}`, ...entry };
    all.push(e);
    await save(all);
    return e;
  },

  async remove(id: string): Promise<void> {
    const all = await load();
    await save(all.filter(e => e.id !== id));
  },

  /** Sum of today's soul-activity minutes (across all activities). */
  async todayMinutes(): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const all = await load();
    return all
      .filter(e => e.date === today)
      .reduce((s, e) => s + e.durationMin, 0);
  },

  /** Breakdown by activity for the given window (default 7 days). */
  async breakdown(days: number = 7): Promise<{ activity: SoulActivity; minutes: number; count: number }[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const all = await load();
    const acc = new Map<SoulActivity, { minutes: number; count: number }>();
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
