/**
 * HealthScoreModel — the scoring model behind the four Home tiles
 * (Stress · Sleep · Heart · Lung).
 *
 * WHY THIS REPLACES WHAT WAS HERE
 *
 * The previous scores were arithmetic with no source behind them:
 *
 *     stress = 100 - (30 - hrv) * 2 - max(0, bpm - 65) * 1.5
 *     heart  = (hrv / 60) * 100 * 0.55 + (100 - max(0, bpm - 60) * 1.5) * 0.45
 *     lung   = (spo2 - 90) * 10
 *
 * Every constant there was chosen by feel. Three consequences, all of which
 * showed on screen: a 55-year-old was marked down against a 25-year-old's HRV
 * because there was no age adjustment; `lung` called 95% SpO2 — which is the
 * bottom of the normal range — a score of 50 out of 100; and `stress` mixed
 * two signals on scales that are not comparable, so a single low HRV reading
 * could swing it 40 points.
 *
 * DESIGN RULES
 *
 *   1. Population norms are age- and sex-adjusted. HRV in particular roughly
 *      halves between 25 and 60, so a fixed target is a fixed insult to older
 *      users.
 *   2. Where a metric is strongly individual (HRV, resting HR), the personal
 *      baseline wins when there is enough history for one. Population tables
 *      are the fallback, not the goal.
 *   3. Clinical thresholds are used where they exist — SpO2 has real ones and
 *      they are not linear.
 *   4. Every score is null until the reading it needs exists. No metric is
 *      ever invented, and no score is defaulted to a pleasant-looking number.
 *   5. Higher is better on all four, so the tiles can be read at a glance.
 *      "Stress 93" therefore means composed, not distressed, and `band`
 *      carries the word so the number cannot be misread.
 *
 * SOURCES FOR THE THRESHOLDS
 *
 *   HRV (RMSSD) by age/sex — consumer-wearable cohort medians, which decline
 *     from roughly 60 ms in the twenties to about 30 ms in the sixties.
 *     Elite HRV and Welltory publish comparable age/sex tables.
 *   Resting heart rate — population mean about 65 bpm; 55-85 covers most
 *     healthy adults, rising 1-2 bpm per decade, women averaging ~4 bpm
 *     higher (92,457-adult cohort, Quer et al., and the WHOOP/NIH tables).
 *   SpO2 — >=95% normal at any age; <=94% warrants assessment; <90% is a
 *     clinical emergency (WHO pulse-oximetry training manual).
 *   Sleep — National Sleep Foundation: 7-9 h for adults 18-64, 7-8 h for 65+.
 *     Sleep efficiency 85-89% normal, >=90% very healthy.
 *
 * These are population references for a wellness score, NOT a diagnosis. The
 * bands are deliberately coarse for that reason.
 */

export type Band = 'excellent' | 'good' | 'fair' | 'low';

export interface Score {
  /** 0-100, higher is better. Null when the inputs are missing. */
  value: number | null;
  band: Band | null;
  /** One plain sentence naming what the number was computed from. */
  basis: string;
}

export interface Sex { sex?: 'male' | 'female' }

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));
const round = (n: number): number => Math.round(n);

const bandOf = (v: number): Band =>
  v >= 80 ? 'excellent' : v >= 60 ? 'good' : v >= 40 ? 'fair' : 'low';

const mk = (value: number | null, basis: string): Score =>
  value == null ? { value: null, band: null, basis }
                : { value: round(clamp(value)), band: bandOf(clamp(value)), basis };

/**
 * Map a measurement onto 0-100 through explicit anchor points.
 *
 * Piecewise-linear rather than a formula, because the reference data is a
 * table of thresholds and inventing a curve through them would add precision
 * the sources do not support. Anchors must be sorted by `x` ascending.
 */
export function piecewise(x: number, anchors: readonly [number, number][]): number {
  if (x <= anchors[0][0]) return anchors[0][1];
  const last = anchors[anchors.length - 1];
  if (x >= last[0]) return last[1];
  for (let i = 1; i < anchors.length; i++) {
    const [x0, y0] = anchors[i - 1];
    const [x1, y1] = anchors[i];
    if (x <= x1) return y0 + ((x - x0) / (x1 - x0)) * (y1 - y0);
  }
  return last[1];
}

// ── Reference tables ───────────────────────────────────────────────────────

/**
 * Median RMSSD in ms by decade. Consumer-wearable cohorts put the twenties
 * near 60 ms and the sixties near 30 ms, with men slightly above women until
 * about 50, after which the gap closes.
 */
const RMSSD_MEDIAN: Record<number, { male: number; female: number }> = {
  20: { male: 60, female: 55 },
  30: { male: 56, female: 53 },
  40: { male: 43, female: 42 },
  50: { male: 34, female: 34 },
  60: { male: 31, female: 31 },
  70: { male: 27, female: 27 },
};

const rmssdMedianFor = (age: number | null, sex: Sex['sex']): number => {
  const a = age == null ? 40 : age;              // 40 is the cohort midpoint
  const decade = Math.max(20, Math.min(70, Math.floor(a / 10) * 10));
  const row = RMSSD_MEDIAN[decade] ?? RMSSD_MEDIAN[40];
  return sex === 'female' ? row.female : sex === 'male' ? row.male : (row.male + row.female) / 2;
};

/**
 * Expected resting heart rate. Population mean is about 65 bpm; it rises
 * 1-2 bpm per decade and women sit roughly 4 bpm higher.
 */
const restingHrExpected = (age: number | null, sex: Sex['sex']): number => {
  const a = age == null ? 40 : age;
  const base = 63 + ((a - 40) / 10) * 1.5;
  return sex === 'female' ? base + 4 : sex === 'male' ? base : base + 2;
};

// ── The four scores ────────────────────────────────────────────────────────

export interface HeartInput {
  restingBpm: number | null;
  rmssd: number | null;
  age: number | null;
  sex?: Sex['sex'];
}

/**
 * Heart — cardiovascular standing, from resting rate and HRV.
 *
 * Both are scored against what is expected for this age and sex rather than
 * against a fixed number, and combined 50/50: resting HR is the more robust
 * daily signal, HRV the more sensitive one, and neither deserves to dominate.
 */
export function heartScore(i: HeartInput): Score {
  const haveHr = i.restingBpm != null && i.restingBpm > 30 && i.restingBpm < 140;
  const haveHrv = i.rmssd != null && i.rmssd > 0;
  if (!haveHr && !haveHrv) return mk(null, 'Needs a resting heart rate or HRV reading.');

  const parts: number[] = [];

  if (haveHr) {
    // Relative to expected: 12 bpm below is athletic, 20 above is strained.
    const delta = (i.restingBpm as number) - restingHrExpected(i.age, i.sex);
    parts.push(piecewise(delta, [[-15, 100], [-8, 90], [0, 75], [8, 55], [18, 30], [30, 5]]));
  }
  if (haveHrv) {
    // Relative to the age/sex median: at the median you are doing fine, which
    // is 70 — not 50, because the median adult is not mediocre.
    const ratio = (i.rmssd as number) / rmssdMedianFor(i.age, i.sex);
    parts.push(piecewise(ratio, [[0.35, 10], [0.6, 40], [0.85, 62], [1.0, 72], [1.3, 88], [1.8, 100]]));
  }

  const value = parts.reduce((a, b) => a + b, 0) / parts.length;
  const basis = haveHr && haveHrv
    ? `Resting ${round(i.restingBpm as number)} bpm and HRV ${round(i.rmssd as number)} ms, against the typical range for your age.`
    : haveHr
      ? `Resting ${round(i.restingBpm as number)} bpm against the typical range for your age. HRV not measured yet.`
      : `HRV ${round(i.rmssd as number)} ms against the typical range for your age. Resting rate not measured yet.`;
  return mk(value, basis);
}

/**
 * Lung — blood oxygen saturation.
 *
 * Anchored on clinical thresholds, and deliberately not linear: the range
 * that matters is narrow and the consequences below it are steep. 98% is
 * unremarkable, 95% is the bottom of normal, and 90% is an emergency — the
 * old `(spo2 - 90) * 10` scored that last case 0 and the bottom of normal 50,
 * which reads as "half marks" for a perfectly ordinary reading.
 */
export function lungScore(spo2: number | null): Score {
  if (spo2 == null || spo2 <= 0) return mk(null, 'Needs an SpO₂ reading from the ring.');
  const v = piecewise(spo2, [[88, 0], [90, 20], [93, 50], [95, 75], [97, 92], [99, 100]]);
  const note =
    spo2 >= 95 ? 'Within the normal range of 95% and above.'
      : spo2 >= 90 ? 'Below 95%, which is worth watching — a single low reading is often just a poor sensor contact.'
        : 'Below 90%. If this repeats on a good contact, treat it as a reason to see a clinician.';
  return mk(v, `SpO₂ ${round(spo2)}%. ${note}`);
}

export interface SleepInput {
  /** Minutes actually asleep. */
  asleepMin: number | null;
  /** Minutes between falling asleep and waking, including time awake. */
  inBedMin?: number | null;
  age: number | null;
}

/**
 * Sleep — duration against the NSF recommendation, adjusted by efficiency.
 *
 * Duration carries 75% and efficiency 25%. Both ends of duration are scored:
 * ten hours is not better than eight, and a model that rewards "more" would
 * keep congratulating a user who is sleeping badly for longer.
 */
export function sleepScore(i: SleepInput): Score {
  if (i.asleepMin == null || i.asleepMin <= 0) return mk(null, 'Needs a scored night from the ring.');
  const hours = i.asleepMin / 60;
  const senior = (i.age ?? 40) >= 65;

  // NSF: 7-9 h for 18-64, 7-8 h for 65+. Full marks across the window, and
  // falling away on both sides.
  const duration = senior
    ? piecewise(hours, [[3, 10], [5, 40], [6.5, 75], [7, 100], [8, 100], [9, 80], [11, 45]])
    : piecewise(hours, [[3, 10], [5, 40], [6.5, 75], [7, 100], [9, 100], [10, 80], [12, 45]]);

  let value = duration;
  let effNote = '';
  if (i.inBedMin != null && i.inBedMin > 0) {
    const eff = (i.asleepMin / i.inBedMin) * 100;
    // 85-89% is normal, 90%+ very healthy.
    const effScore = piecewise(eff, [[60, 20], [75, 55], [85, 80], [90, 95], [95, 100]]);
    value = duration * 0.75 + effScore * 0.25;
    effNote = ` Efficiency ${round(eff)}% (85% and above is normal).`;
  }

  const h = Math.floor(hours);
  const m = round((hours - h) * 60);
  return mk(value, `${h}h ${m}m asleep against the ${senior ? '7-8' : '7-9'} hour recommendation.${effNote}`);
}

export interface StressInput {
  rmssd: number | null;
  restingBpm: number | null;
  /** The user's own recent averages, when enough nights exist. */
  baselineRmssd?: number | null;
  baselineBpm?: number | null;
  age: number | null;
  sex?: Sex['sex'];
}

/**
 * Stress — autonomic load, scored so that HIGHER MEANS CALMER.
 *
 * Measured as departure from your own recent baseline rather than from a
 * population table, because what a stressed day looks like is personal: an
 * HRV of 35 ms is an ordinary Tuesday for one person and a warning for
 * another. The population table is used only until a baseline exists.
 *
 * A suppressed HRV is the primary signal and carries 65%; an elevated resting
 * rate corroborates it at 35%. The old model let one low HRV sample swing the
 * result by 40 points because it subtracted raw milliseconds from 100.
 */
export function stressScore(i: StressInput): Score {
  const haveHrv = i.rmssd != null && i.rmssd > 0;
  const haveHr = i.restingBpm != null && i.restingBpm > 30;
  if (!haveHrv && !haveHr) return mk(null, 'Needs HRV or a resting heart rate.');

  const parts: { v: number; w: number }[] = [];
  let personal = false;

  if (haveHrv) {
    const ref = i.baselineRmssd && i.baselineRmssd > 0
      ? (personal = true, i.baselineRmssd)
      : rmssdMedianFor(i.age, i.sex);
    const ratio = (i.rmssd as number) / ref;
    // At or above your own normal is calm; 30% down is a real dip.
    parts.push({ v: piecewise(ratio, [[0.4, 8], [0.6, 30], [0.8, 55], [1.0, 78], [1.25, 92], [1.6, 100]]), w: 0.65 });
  }
  if (haveHr) {
    const ref = i.baselineBpm && i.baselineBpm > 0
      ? (personal = true, i.baselineBpm)
      : restingHrExpected(i.age, i.sex);
    const delta = (i.restingBpm as number) - ref;
    parts.push({ v: piecewise(delta, [[-10, 100], [-3, 88], [0, 78], [6, 55], [14, 28], [25, 5]]), w: 0.35 });
  }

  const wsum = parts.reduce((a, p) => a + p.w, 0);
  const value = parts.reduce((a, p) => a + p.v * p.w, 0) / wsum;
  const src = personal ? 'your own recent baseline' : 'the typical range for your age';
  return mk(value, `Autonomic load from HRV and resting rate, against ${src}. Higher means calmer.`);
}

/**
 * Skin temperature — scored on DEVIATION from the wearer's own baseline, not
 * on the absolute reading.
 *
 * A finger's surface temperature is not core temperature: it swings with room
 * temperature, blood flow and how tightly the ring sits, so an absolute target
 * of 36.6 °C is meaningless on this sensor. What carries information is a
 * sustained departure from your own normal — consumer rings surface roughly
 * ±0.3 °C as the point worth noticing, which is the figure the Health screen
 * already quotes to the user.
 *
 * Without a baseline there is nothing to deviate from, so this returns null
 * rather than scoring an absolute number that means nothing.
 */
export function skinTempScore(todayC: number | null, baselineC: number | null): Score {
  if (todayC == null || todayC <= 0) return mk(null, 'No skin temperature reading yet.');
  if (baselineC == null || baselineC <= 0) {
    return mk(null, 'Needs a few days of readings before a change means anything.');
  }
  const dev = Math.abs(todayC - baselineC);
  const v = piecewise(dev, [[0, 100], [0.3, 82], [0.6, 60], [1.0, 35], [1.8, 10]]);
  return mk(v, `${dev.toFixed(1)}°C from your usual skin temperature.`);
}

/** Human-readable word for a band, for the tile subtitle. */
export const bandWord = (s: Score, kind: 'stress' | 'sleep' | 'heart' | 'lung'): string => {
  if (s.value == null) return 'no data';
  if (kind === 'stress') {
    return s.band === 'excellent' ? 'calm' : s.band === 'good' ? 'steady' : s.band === 'fair' ? 'tense' : 'strained';
  }
  return s.band === 'excellent' ? 'excellent' : s.band === 'good' ? 'good' : s.band === 'fair' ? 'fair' : 'low';
};
