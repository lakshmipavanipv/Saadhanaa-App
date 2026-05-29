/**
 * workoutGoalsRepo — per-activity daily goals (steps for walk, minutes for
 * the rest). Stored in AsyncStorage as a single JSON object.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BodyActivity } from '../types';

export interface WorkoutGoals {
  /** Daily step goal (Walk). */
  walkSteps?: number;
  /** Daily minute goals per activity (jog/run/cycle/swim/gym/hiit). */
  jogMin?: number;
  runMin?: number;
  cycleMin?: number;
  swimMin?: number;
  gymMin?: number;
  hiitMin?: number;
}

const DEFAULTS: WorkoutGoals = {
  walkSteps: 6000,
  jogMin: 20,
  runMin: 20,
  cycleMin: 30,
  swimMin: 30,
  gymMin: 45,
  hiitMin: 15,
};

const KEY = 'soulsync.workoutGoals.v1';

export const workoutGoalsRepo = {
  async get(): Promise<WorkoutGoals> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return { ...DEFAULTS, ...(raw ? JSON.parse(raw) : {}) };
    } catch { return { ...DEFAULTS }; }
  },

  async set(patch: Partial<WorkoutGoals>): Promise<void> {
    const cur = await this.get();
    await AsyncStorage.setItem(KEY, JSON.stringify({ ...cur, ...patch }));
  },

  /** Returns the relevant goal value + unit for a given activity. */
  async forActivity(a: BodyActivity): Promise<{ goal: number; unit: 'steps' | 'min' }> {
    const g = await this.get();
    if (a === 'walk') return { goal: g.walkSteps ?? 6000, unit: 'steps' };
    const key = `${a}Min` as keyof WorkoutGoals;
    return { goal: (g[key] as number) ?? 30, unit: 'min' };
  },
};
