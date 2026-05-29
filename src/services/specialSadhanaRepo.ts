/**
 * specialSadhanaRepo — user-defined Special Sadhanas observed on
 * particular tithis (Ekadashi, Pradosh, Purnima, etc.), specific
 * weekdays (e.g. Monday for Shiva), or specific calendar dates.
 *
 * Persisted to AsyncStorage as a single JSON array.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export type SpecialTrigger =
  | { kind: 'tithi'; tithi: string }                 // e.g. "Ekadashi"
  | { kind: 'weekdays'; days: number[] }             // 0=Sun .. 6=Sat
  | { kind: 'dates';    dates: string[] };           // YYYY-MM-DD list

export interface SpecialSadhana {
  id: string;
  name: string;
  /** Optional explanatory note. */
  note?: string;
  /** What deity / mantra / practice (free text or catalog id). */
  practice?: string;
  /** Duration in minutes (or mala count if it's japa). */
  durationMin?: number;
  malas?: number;
  trigger: SpecialTrigger;
  /** Optional fixed time of day. */
  time?: string;
  createdAt: string;
}

const KEY = 'panchang.special.v1';

const load = async (): Promise<SpecialSadhana[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SpecialSadhana[]) : [];
  } catch { return []; }
};
const save = async (arr: SpecialSadhana[]): Promise<void> =>
  AsyncStorage.setItem(KEY, JSON.stringify(arr));

export const specialSadhanaRepo = {
  async list(): Promise<SpecialSadhana[]> { return load(); },

  async add(entry: Omit<SpecialSadhana, 'id' | 'createdAt'>): Promise<SpecialSadhana> {
    const all = await load();
    const e: SpecialSadhana = {
      id: `special-${Date.now()}-${Math.floor(Math.random() * 999)}`,
      createdAt: new Date().toISOString(),
      ...entry,
    };
    all.push(e);
    await save(all);
    return e;
  },

  async remove(id: string): Promise<void> {
    const all = await load();
    await save(all.filter(e => e.id !== id));
  },
};
