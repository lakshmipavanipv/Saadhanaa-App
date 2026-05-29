/**
 * dummyData — realistic placeholder values used as a fallback when no
 * real ring/SDK data has flowed in yet.
 *
 * Design principles:
 *   1. The original code paths (DB queries, repos) are NEVER modified.
 *      Consumers ask the DB first; if null/empty, they pick up these
 *      fallbacks via the `withFallback()` helper below.
 *   2. The moment any real datum arrives — a single step count, an
 *      ambient_baseline row, a session_telemetry row — the consumer
 *      uses the REAL value and these dummies vanish for that metric.
 *   3. Values are realistic for a moderately practicing 50-year-old
 *      sadhaka: resting BPM ~68, HRV ~35ms, ~5 k steps, ~7 h sleep,
 *      ~7/10 depth score after a few weeks of japa.
 *   4. Series (7-day / 14-day) are gently varied so sparklines look
 *      "alive" instead of perfectly flat.
 *
 * Once the BLE ring is paired and SDK syncing starts:
 *   • ambient_baseline / session_telemetry / sleep_record / daily_activity
 *     tables fill with real rows
 *   • The "has real data?" check in withFallback() flips to true per metric
 *   • The dashboard "talks based on the ring data, not the dummy data"
 */

import { todayStr } from '../utils';

// ─── Health composite scores (0-100 unless noted) ────────────────

export const DUMMY = {
  // Vitals — what the ring's ambient baseline averages would look like
  ambientToday: {
    bpm: 68,
    rmssd: 35,           // HRV ms
    spo2: 97.2,
    skinTempC: 36.4,
  },

  // What vitals look like DURING a soulsync session (the calming dip)
  sessionAverages: {
    bpm: 58,             // dropped ~10 bpm from baseline
    rmssd: 52,           // HRV widened
    spo2: 98.1,
  },

  // Daily activity from the ring's step counter
  stepsToday: 4523,
  weeklySteps: [3210, 4108, 5512, 4823, 6210, 5104, 4523],   // M..S today=last

  // Sleep — Samsung-Ring-like breakdown of last night
  sleepLastNight: {
    totalMin: 423,
    deepMin: 78,
    remMin: 95,
    awakenings: 3,
    score: 78,
    bedtimeMinute: 22 * 60 + 30,  // 22:30 = 10:30 PM
    efficiencyPct: 88,
  },

  // Sadhana depth — composite per-session score (0-10)
  depthToday: 7.2,
  depthSeries14d: [6.5, 7.1, 6.8, 7.3, 7.5, 7.0, 7.2, 7.6, 7.4, 7.8, 7.5, 7.9, 8.0, 7.2],

  // Body & Soul composite scores
  bodyHealthScore: 72,
  soulDepthScore:  85,
  bodySoulHealth:  80,         // overall hero number
  commitmentScore: 65,

  // 4-box health KPIs (0-100; lower better for stress)
  healthBoxes: {
    stress: 38,   // ↓ better
    sleep:  78,
    heart:  72,
    lung:   92,
  },

  // Time-in-zones today
  workoutMinutesToday: 18,
  sadhanaMinutesToday: 12,
  hrActiveMinutesToday: 27,
  caloriesToday: 312,

  // 7-day series for sparklines
  workoutWeek:  [25, 15, 30, 18, 22, 12, 18],
  sadhanaWeek:  [10, 12, 15,  8, 14, 10, 12],

  // Sessions today (yoga / meditation / japa together)
  sessionsToday: 2,
  avgSessionDepthToday: 7.2,

  // HRV lift (during − baseline) over 7 days — proves practice's effect
  hrvLift7d: [4, 7, 6, 9, 11, 8, 10],

  // Today's planned activities mock — only used if the user has not
  // added any in the Plan tab yet (so the Home preview feels alive).
  todayPlannedSample: [
    { id: 'demo-1', category: 'yoga',     name: 'Surya Namaskar',  durationMin: 5,  time: '06:00', notificationIds: { 1: 'd' }, done: true },
    { id: 'demo-2', category: 'japa',     name: 'Gayatri Japa',    durationMin: 10, time: '06:15', notificationIds: { 1: 'd' }, done: false },
    { id: 'demo-3', category: 'meditate', name: 'Box Breathing',   durationMin: 5,  time: '21:00', done: false },
    { id: 'demo-4', category: 'exercise', name: 'Evening Walk',    durationMin: 20, time: '17:30', done: false },
  ],

  // Vitals baseline trend — what the body looks like after weeks of practice
  baselineTrend: [
    { icon: '❤️', label: 'Resting BPM', before: 78, after: 64, unit: 'bpm',  betterLower: true },
    { icon: '〰️', label: 'HRV (RMSSD)', before: 22, after: 38, unit: 'ms',   betterLower: false },
    { icon: '🫁', label: 'SpO₂',        before: 95.2, after: 97.8, unit: '%', betterLower: false },
    { icon: '🌡', label: 'Stress index', before: 62, after: 38, unit: '/100', betterLower: true },
  ],
};

// ─── Helper: prefer-real-fallback-to-dummy ────────────────────────

/**
 * Returns `real` if it is "valid" (non-null, non-undefined, non-zero
 * for numbers). Otherwise returns the dummy fallback.
 *
 * Special-cases for arrays: returns dummy if real is undefined OR all
 * values are zero.
 */
export function withFallback<T>(real: T | null | undefined, dummy: T): T {
  if (real == null) return dummy;
  if (typeof real === 'number') {
    return real !== 0 ? real : dummy;
  }
  if (Array.isArray(real)) {
    if (real.length === 0) return dummy;
    if (real.every(v => v === 0 || v == null)) return dummy;
    return real;
  }
  return real;
}

/** True if ANY ring data has flowed in (used to show/hide the demo banner). */
export const isUsingDummyData = (signals: {
  hasAmbient?: boolean;
  hasSession?: boolean;
  hasSteps?: boolean;
  hasSleep?: boolean;
}): boolean => !signals.hasAmbient && !signals.hasSession && !signals.hasSteps && !signals.hasSleep;
