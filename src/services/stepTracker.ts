/**
 * stepTracker — foreground pedometer that accumulates today's steps, converts
 * them to calories/distance, and fires a one-time "goal achieved" notification
 * when a planned walk's goal is met.
 *
 * Scope note: expo-sensors' Pedometer counts only while the app is in the
 * foreground (Android has no free true-background step API without a foreground
 * service / Health Connect). So this counts during active use and on app open.
 * A future upgrade can swap in the ring's step data or Health Connect for 24/7.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Pedometer } from 'expo-sensors';
import { routineRepo } from './routineRepo';
import { todayStr } from '../utils';

const KEY = 'soulsync.steps.v1';

// ~0.04 kcal per step (avg adult), ~0.762 m stride.
export const stepsToKcal = (steps: number) => Math.round(steps * 0.04);
export const stepsToKm   = (steps: number) => +(steps * 0.000762).toFixed(2);

interface DayRecord {
  date: string;
  steps: number;
  /** routine-item ids already celebrated today (so we notify once each). */
  notified: string[];
}

const loadDay = async (): Promise<DayRecord> => {
  const today = todayStr();
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const rec = JSON.parse(raw) as DayRecord;
      if (rec.date === today) return rec;
    }
  } catch { /* ignore */ }
  return { date: today, steps: 0, notified: [] };
};

const saveDay = (rec: DayRecord) => AsyncStorage.setItem(KEY, JSON.stringify(rec)).catch(() => {});

/** Today's step total (persisted across app restarts within the day). */
export const getTodaySteps = async (): Promise<number> => (await loadDay()).steps;

/** Fire an immediate local notification once a goal is reached. */
const celebrate = async (name: string, detail: string) => {
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `🎉 Goal achieved — ${name}`,
        body: `${detail} Beautiful work for your body today 🙏`,
        sound: 'default',
        data: { type: 'goal-achieved' },
      },
      trigger: null,   // immediate
    });
  } catch { /* notifications may be denied */ }
};

/**
 * Add a step delta to today's total, persist it, and check whether any planned
 * walk/exercise goal (steps or calories) has just been crossed → notify once.
 */
export const addSteps = async (delta: number): Promise<number> => {
  if (delta <= 0) return (await loadDay()).steps;
  const rec = await loadDay();
  rec.steps += delta;
  await saveDay(rec);

  // Check exercise goals expressed in steps or calories.
  try {
    const items = await routineRepo.list();
    const kcal = stepsToKcal(rec.steps);
    for (const it of items) {
      if (it.category !== 'exercise' || !it.goalValue || rec.notified.includes(it.id)) continue;
      const hitSteps = it.goalUnit === 'steps' && rec.steps >= it.goalValue;
      const hitKcal  = it.goalUnit === 'kcal'  && kcal >= it.goalValue;
      if (hitSteps || hitKcal) {
        rec.notified.push(it.id);
        await saveDay(rec);
        await celebrate(
          it.name,
          hitSteps ? `You've reached ${it.goalValue.toLocaleString()} steps.`
                   : `You've burned ${it.goalValue} kcal.`
        );
      }
    }
  } catch { /* repo not ready */ }

  return rec.steps;
};

/**
 * Start watching the device pedometer. Returns an unsubscribe fn.
 * `onUpdate` receives the running today-total after each delta.
 */
export const startStepTracking = async (
  onUpdate?: (todaySteps: number) => void
): Promise<() => void> => {
  let available = false;
  try { available = await Pedometer.isAvailableAsync(); } catch { available = false; }
  if (!available) return () => {};

  try {
    const perm = await Pedometer.getPermissionsAsync();
    if (!perm.granted) {
      const req = await Pedometer.requestPermissionsAsync();
      if (!req.granted) return () => {};
    }
  } catch { /* some devices skip permission */ }

  // watchStepCount reports steps since the listener was attached — track the
  // delta from the last reading and accumulate into today's persisted total.
  let last = 0;
  const sub = Pedometer.watchStepCount(async (result) => {
    const cur = result.steps || 0;
    const delta = Math.max(0, cur - last);
    last = cur;
    const total = await addSteps(delta);
    onUpdate?.(total);
  });

  return () => { try { sub.remove(); } catch { /* */ } };
};
