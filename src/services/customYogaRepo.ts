/**
 * customYogaRepo — CRUD for user-defined yoga routines (CustomYoga).
 * Stored in AsyncStorage as JSON array.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomYoga } from '../types';

const KEY = 'soulsync.customYoga.v1';

const load = async (): Promise<CustomYoga[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomYoga[]) : [];
  } catch { return []; }
};
const save = async (arr: CustomYoga[]) =>
  AsyncStorage.setItem(KEY, JSON.stringify(arr));

export const customYogaRepo = {
  async list(): Promise<CustomYoga[]> { return load(); },

  async upsert(y: CustomYoga): Promise<CustomYoga> {
    const all = await load();
    const idx = all.findIndex(x => x.id === y.id);
    if (idx >= 0) all[idx] = y;
    else           all.push(y);
    await save(all);
    return y;
  },

  async remove(id: string): Promise<void> {
    const all = await load();
    await save(all.filter(x => x.id !== id));
  },
};
