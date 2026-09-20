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

/**
 * Marker for the one-time repair below. Bumping it re-runs the repair.
 */
const REPAIR_KEY = 'soulsync.steps.repair.v1';

/**
 * Clear today's pedometer total once, on first run after the baseline fix.
 *
 * Every launch before this fix added a whole extra reading to the stored
 * total, and nothing ever subtracts — so a day that was inflated stays
 * inflated until midnight, showing a number the user knows is wrong. This
 * drops it once so counting restarts from something true.
 *
 * Deliberately one-shot and dated: it must never run twice, or it would erase
 * real steps every launch, which is the opposite mistake.
 */
export const repairInflatedSteps = async (): Promise<void> => {
  try {
    const done = await AsyncStorage.getItem(REPAIR_KEY);
    if (done) return;
    await AsyncStorage.setItem(REPAIR_KEY, new Date().toISOString());
    await saveDay({ date: todayStr(), steps: 0, notified: [] });
     
    console.log('[STEPFIX] cleared the accumulated pedometer total once');
  } catch { /* best-effort */ }
};

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

/**
 * Discard today's accumulated pedometer total and start again from zero.
 *
 * Needed because the accumulator was additive and, until the baseline fix
 * above, gained a whole extra reading on every app launch. A day inflated that
 * way cannot correct itself: nothing ever subtracts, so the wrong figure
 * simply persists until midnight. This gives the count a way back.
 *
 * It does not touch the ring's own counts in daily_activity, which come from
 * the ring's records and are recomputed on each sync.
 */
export const resetTodaySteps = async (): Promise<void> => {
  await saveDay({ date: todayStr(), steps: 0, notified: [] });
};

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

  /*
   * Accumulate only the DIFFERENCE between consecutive readings, and never
   * count the first reading as one.
   *
   * `last` used to start at 0, so the first callback after every attach
   * contributed `cur - 0` — the whole reading — to a persisted daily total.
   * Re-attaching happens on every app launch, so each launch added another
   * full reading to the day. A day with a dozen launches reported several
   * times the steps actually taken, and the total only ever grew, because
   * addSteps only adds.
   *
   * The first reading now establishes the baseline and contributes nothing.
   * Only movement observed while this listener is alive is counted, which is
   * what the accumulated total is supposed to mean.
   */
  // Clear a total inflated by the old baseline bug, once, before counting.
  await repairInflatedSteps();

  let last: number | null = null;
  const sub = Pedometer.watchStepCount(async (result) => {
    const cur = result.steps || 0;

    if (last === null) {
      last = cur;                 // baseline, not a delta
      onUpdate?.((await loadDay()).steps);
      return;
    }

    // A decrease means the sensor restarted (reboot, or the OS dropped the
    // subscription). Re-baseline rather than treating it as negative movement.
    if (cur < last) { last = cur; return; }

    const delta = cur - last;
    last = cur;
    if (delta <= 0) return;
    const total = await addSteps(delta);
    onUpdate?.(total);
  });

  return () => { try { sub.remove(); } catch { /* */ } };
};
