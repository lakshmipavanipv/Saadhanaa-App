/**
 * workoutGoalsRepo — per-activity daily goals (steps for walk, minutes for
 * the rest). Stored in AsyncStorage as a single JSON object.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { BodyActivity } from '../types';

// v67: a goal can now be measured in any of these units, chosen per
// activity by the user (previously walk=steps, everything else=minutes).
export type GoalUnit = 'min' | 'steps' | 'kcal' | 'km';

export const GOAL_UNIT_META: Record<GoalUnit, { label: string; short: string; icon: string }> = {
  min:   { label: 'Time',     short: 'min',   icon: '⏱' },
  steps: { label: 'Steps',    short: 'steps', icon: '👟' },
  kcal:  { label: 'Calories', short: 'kcal',  icon: '🔥' },
  km:    { label: 'Distance', short: 'km',    icon: '📏' },
};

export interface WorkoutGoals {
  /** Daily step goal (Walk). LEGACY — superseded by goalValue/goalUnit. */
  walkSteps?: number;
  /** Daily minute goals per activity. LEGACY. */
  jogMin?: number;
  runMin?: number;
  cycleMin?: number;
  swimMin?: number;
  gymMin?: number;
  hiitMin?: number;
  /** v67: per-activity chosen goal value + unit. */
  goalValue?: Partial<Record<BodyActivity, number>>;
  goalUnit?: Partial<Record<BodyActivity, GoalUnit>>;
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

// Sensible default unit + value when the user hasn't set one yet.
const DEFAULT_FOR = (a: BodyActivity): { goal: number; unit: GoalUnit } =>
  a === 'walk' ? { goal: 6000, unit: 'steps' } : { goal: 30, unit: 'min' };

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

  /** v67: persist a chosen value + unit for one activity. */
  async setGoal(a: BodyActivity, goal: number, unit: GoalUnit): Promise<void> {
    const cur = await this.get();
    await AsyncStorage.setItem(KEY, JSON.stringify({
      ...cur,
      goalValue: { ...(cur.goalValue || {}), [a]: goal },
      goalUnit:  { ...(cur.goalUnit  || {}), [a]: unit },
    }));
  },

  /** Returns the goal value + unit for an activity (new map → legacy → default). */
  async forActivity(a: BodyActivity): Promise<{ goal: number; unit: GoalUnit }> {
    const g = await this.get();
    const v = g.goalValue?.[a];
    const u = g.goalUnit?.[a];
    if (v != null && u != null) return { goal: v, unit: u };
    // Legacy fallback
    if (a === 'walk') return { goal: g.walkSteps ?? 6000, unit: 'steps' };
    const key = `${a}Min` as keyof WorkoutGoals;
    const legacy = g[key] as number | undefined;
    if (legacy != null) return { goal: legacy, unit: 'min' };
    return DEFAULT_FOR(a);
  },
};
