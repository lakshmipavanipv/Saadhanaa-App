/**
 * SleepScore — Samsung-Health-style 0–100 sleep score with full breakdown.
 *
 *   sleep_score = 0.20 × duration_pts       (NSF: 7-9 h adults)
 *               + 0.20 × efficiency_pts     (asleep / time-in-bed, ≥ 85% good)
 *               + 0.20 × deep_sleep_pts     (13-23% of total, Hirshkowitz 2015)
 *               + 0.15 × rem_sleep_pts      (20-25% of total)
 *               + 0.15 × hrv_sleep_pts      (RMSSD during sleep — recovery marker)
 *               + 0.10 × waso_pts           (wake after sleep onset, <30 min good)
 *
 * Trend display: compares current 7-day rolling avg vs the user's *first 7
 * days* on the app, so they can see meditation's compounding effect over
 * weeks.
 */

import { getDB } from '../db/database';
import { sleepRepo, SleepRow } from '../db/sleepRepo';

export interface SleepSubScore {
  label: string;
  /** Today's value with unit formatting (e.g. "7.5 h"). */
  current: number | string | null;
  /** First-7-days-of-use baseline value, same formatting as current. */
  baseline: number | string | null;
  /** Raw numeric current (for delta computation). */
  rawCurrent: number | null;
  /** Raw numeric baseline. */
  rawBaseline: number | null;
  points: number;
  weight: number;
  /** Whether higher is better for this metric (used for color of delta). */
  higherIsBetter: boolean;
}

export interface SleepScoreSnapshot {
  /** Today's 0–100 composite. */
  score: number;
  /** Per-component breakdown with baseline comparison. */
  components: SleepSubScore[];
  /** Rolling 7-day average. */
  weeklyAvg: number;
  /** First-7-days-of-use baseline. */
  firstWeekBaseline: number;
  /** weeklyAvg − firstWeekBaseline (positive = improving). */
  delta: number;
  /** "Excellent" / "Good" / "Fair" / "Poor" label. */
  label: string;
  /** Has any sleep data been recorded yet. */
  hasData: boolean;
  /** 30-day series of total composite score. */
  trend: { date: string; score: number | null }[];
  /** 30-day series of deep-sleep HOURS (separate trend line). */
  deepSleepTrend: { date: string; hours: number | null }[];
  /** First-7-days average of deep sleep hours, for the baseline reference. */
  deepSleepBaseline: number;
}

// ─── Per-metric scoring ────────────────────────────────────────────

const scoreDuration = (hours: number): number => {
  if (hours >= 7 && hours <= 9)                 return 100;
  if ((hours >= 6 && hours < 7) || (hours > 9 && hours <= 10)) return 75;
  if ((hours >= 5 && hours < 6) || (hours > 10 && hours <= 11)) return 50;
  if (hours >= 4 && hours < 5)                  return 25;
  return 0;
};

const scoreEfficiency = (pct: number): number => {
  if (pct >= 90) return 100;
  if (pct >= 85) return 75;
  if (pct >= 80) return 50;
  if (pct >= 70) return 25;
  return 0;
};

const scoreDeepSleep = (pctOfTotal: number): number => {
  if (pctOfTotal >= 15 && pctOfTotal <= 20) return 100;
  if (pctOfTotal >= 10 && pctOfTotal <= 25) return 75;
  if (pctOfTotal >= 5  && pctOfTotal <= 30) return 50;
  if (pctOfTotal >= 3  && pctOfTotal <= 35) return 25;
  return 0;
};

const scoreREM = (pctOfTotal: number): number => {
  if (pctOfTotal >= 20 && pctOfTotal <= 25) return 100;
  if (pctOfTotal >= 15 && pctOfTotal <= 30) return 75;
  if ((pctOfTotal >= 10 && pctOfTotal < 15) || (pctOfTotal > 30 && pctOfTotal <= 35)) return 50;
  if (pctOfTotal >= 5  && pctOfTotal < 10)  return 25;
  return 0;
};

const scoreHRVSleep = (rmssdMs: number): number => {
  if (rmssdMs >= 50) return 100;
  if (rmssdMs >= 35) return 80;
  if (rmssdMs >= 25) return 60;
  if (rmssdMs >= 15) return 40;
  return 20;
};

const scoreWASO = (wasoMin: number): number => {
  if (wasoMin < 15)  return 100;
  if (wasoMin < 30)  return 75;
  if (wasoMin < 60)  return 50;
  if (wasoMin < 90)  return 25;
  return 0;
};

/**
 * Score the bedtime onset against the Ayurvedic "Kapha quality window"
 * 9 pm – 12 am (1260 – 1439 minutes since midnight). Going to bed inside
 * this window scores highest; sleeping past midnight loses points
 * progressively because melatonin & deep-sleep cycles shift later.
 *
 *   21:00 – 22:30   → 100  (ideal — peak deep sleep band)
 *   22:30 – 23:30   →  85
 *   23:30 – 00:00   →  70
 *   00:00 – 01:00   →  50
 *   01:00 – 02:00   →  25
 *    > 02:00        →   0
 *   before 21:00    →  90  (early but acceptable)
 */
const scoreBedtime = (bedtimeMinute: number | null | undefined): number | null => {
  if (bedtimeMinute == null) return null;
  // Normalize: anything before 9 pm we treat as same-day evening
  const m = bedtimeMinute;
  if (m < 21 * 60)             return 90;                 // before 21:00
  if (m >= 21*60 && m < 22*60+30) return 100;             // 21:00 – 22:30
  if (m >= 22*60+30 && m < 23*60+30) return 85;           // 22:30 – 23:30
  if (m >= 23*60+30 && m < 24*60)    return 70;           // 23:30 – 00:00
  // After midnight — bedtime_minute may be 0–120 (00:00 – 02:00)
  if (m < 60)                  return 50;                 // 00:00 – 01:00
  if (m < 120)                 return 25;                 // 01:00 – 02:00
  return 0;                                               // worse
};

// ─── Convert a SleepRow into a 0–100 score + components ────────────

interface NightStats {
  score: number;
  hours: number;
  efficiency: number;
  deepPct: number;
  remPct: number;
  hrvSleep: number;
  wasoMin: number;
  deepHours: number;
  bedtimeMinute: number | null;
  rawComponents: { duration: number; efficiency: number; deepPct: number; remPct: number; hrv: number; waso: number; bedtimeMin: number | null };
  pts: { duration: number; efficiency: number; deep: number; rem: number; hrv: number; waso: number; bedtime: number };
}

const computeNightStats = async (row: SleepRow): Promise<NightStats> => {
  const totalMin = row.total_sleep_min;
  const hours = totalMin / 60;
  const wasoMin = row.awakenings * 5;
  const inBedMin = totalMin + wasoMin;
  const efficiency = inBedMin > 0 ? (totalMin / inBedMin) * 100 : 0;
  const deepPct = totalMin > 0 ? (row.deep_sleep_min / totalMin) * 100 : 0;
  const remPct  = totalMin > 0 ? (row.rem_sleep_min  / totalMin) * 100 : 0;
  const deepHours = row.deep_sleep_min / 60;

  // HRV during sleep — ambient rows tagged 'sleep' on the night around this date.
  const db = await getDB();
  const hrvRow = await db.getFirstAsync<{ avg_rmssd: number | null }>(
    `SELECT AVG(ambient_rmssd) AS avg_rmssd
     FROM ambient_baseline
     WHERE activity_state = 'sleep'
       AND date(timestamp) BETWEEN date(?, '-1 day') AND date(?)`,
    [row.sleep_date, row.sleep_date]
  );
  const hrvSleep = hrvRow?.avg_rmssd ?? 30;

  const bedtimePts = scoreBedtime(row.bedtime_minute);

  const pts = {
    duration:   scoreDuration(hours),
    efficiency: scoreEfficiency(efficiency),
    deep:       scoreDeepSleep(deepPct),
    rem:        scoreREM(remPct),
    hrv:        scoreHRVSleep(hrvSleep),
    waso:       scoreWASO(wasoMin),
    bedtime:    bedtimePts ?? 0,
  };

  // If bedtime is recorded, reweight: bedtime gets 15% (taken from duration & waso).
  // Without bedtime, fall back to the original weights.
  const score = bedtimePts != null
    ? Math.round(
        pts.duration   * 0.15 +
        pts.efficiency * 0.18 +
        pts.deep       * 0.17 +
        pts.rem        * 0.12 +
        pts.hrv        * 0.15 +
        pts.waso       * 0.08 +
        pts.bedtime    * 0.15
      )
    : Math.round(
        pts.duration   * 0.20 +
        pts.efficiency * 0.20 +
        pts.deep       * 0.20 +
        pts.rem        * 0.15 +
        pts.hrv        * 0.15 +
        pts.waso       * 0.10
      );

  return {
    score, hours, efficiency, deepPct, remPct, hrvSleep, wasoMin, deepHours,
    bedtimeMinute: row.bedtime_minute ?? null,
    rawComponents: { duration: hours, efficiency, deepPct, remPct, hrv: hrvSleep, waso: wasoMin, bedtimeMin: row.bedtime_minute ?? null },
    pts,
  };
};

// ─── Label for the score ───────────────────────────────────────────

const labelFor = (score: number): string => {
  if (score >= 90) return 'Excellent';
  if (score >= 80) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Poor';
};

// ─── Main computation ─────────────────────────────────────────────

export const computeSleepScore = async (): Promise<SleepScoreSnapshot> => {
  const recent = await sleepRepo.last30Days();

  if (recent.length === 0) {
    return {
      score: 0,
      components: [],
      weeklyAvg: 0,
      firstWeekBaseline: 0,
      delta: 0,
      label: '—',
      hasData: false,
      trend: [],
      deepSleepTrend: [],
      deepSleepBaseline: 0,
    };
  }

  // Score every night + sort chronologically
  const dated: { date: string; stats: NightStats }[] = [];
  for (const r of recent) {
    const stats = await computeNightStats(r);
    dated.push({ date: r.sleep_date, stats });
  }
  dated.sort((a, b) => a.date.localeCompare(b.date));

  const todays = dated[dated.length - 1];
  const last7  = dated.slice(-7);
  const first7 = dated.slice(0, Math.min(7, dated.length));

  // ── Composite score baseline + weekly avg ──
  const weeklyAvg = Math.round(last7.reduce((s, x) => s + x.stats.score, 0) / last7.length);
  const firstWeekBaseline = Math.round(first7.reduce((s, x) => s + x.stats.score, 0) / first7.length);

  // ── Per-component first-week baseline ──
  const avg = (sel: (n: NightStats) => number) =>
    first7.reduce((s, x) => s + sel(x.stats), 0) / first7.length;
  const baseDuration   = avg(s => s.hours);
  const baseEfficiency = avg(s => s.efficiency);
  const baseDeepPct    = avg(s => s.deepPct);
  const baseRemPct     = avg(s => s.remPct);
  const baseHrv        = avg(s => s.hrvSleep);
  const baseWaso       = avg(s => s.wasoMin);

  // ── 30-day composite-score trend ──
  const trend: { date: string; score: number | null }[] = [];
  const byDate = new Map(dated.map(d => [d.date, d.stats.score]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    trend.push({ date: d, score: byDate.get(d) ?? null });
  }

  // ── 30-day deep-sleep-hours trend ──
  const deepSleepTrend: { date: string; hours: number | null }[] = [];
  const deepByDate = new Map(dated.map(d => [d.date, d.stats.deepHours]));
  for (let i = 29; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    deepSleepTrend.push({ date: d, hours: deepByDate.get(d) ?? null });
  }
  const deepSleepBaseline = Math.round(avg(s => s.deepHours) * 10) / 10;

  // ── Per-component breakdown with baseline ──
  const t = todays.stats;
  const components: SleepSubScore[] = [
    {
      label: 'Duration',
      current: `${t.hours.toFixed(1)} h`,
      baseline: `${baseDuration.toFixed(1)} h`,
      rawCurrent: t.hours,
      rawBaseline: baseDuration,
      points: t.pts.duration, weight: 0.20, higherIsBetter: true,
    },
    {
      label: 'Efficiency',
      current: `${Math.round(t.efficiency)}%`,
      baseline: `${Math.round(baseEfficiency)}%`,
      rawCurrent: t.efficiency, rawBaseline: baseEfficiency,
      points: t.pts.efficiency, weight: 0.20, higherIsBetter: true,
    },
    {
      label: 'Deep sleep',
      current: `${t.deepHours.toFixed(1)} h (${Math.round(t.deepPct)}%)`,
      baseline: `${(baseDuration * baseDeepPct / 100).toFixed(1)} h`,
      rawCurrent: t.deepHours,
      rawBaseline: baseDuration * baseDeepPct / 100,
      points: t.pts.deep, weight: 0.20, higherIsBetter: true,
    },
    {
      label: 'REM sleep',
      current: `${Math.round(t.remPct)}%`,
      baseline: `${Math.round(baseRemPct)}%`,
      rawCurrent: t.remPct, rawBaseline: baseRemPct,
      points: t.pts.rem, weight: 0.15, higherIsBetter: true,
    },
    {
      label: 'HRV in sleep',
      current: `${Math.round(t.hrvSleep)} ms`,
      baseline: `${Math.round(baseHrv)} ms`,
      rawCurrent: t.hrvSleep, rawBaseline: baseHrv,
      points: t.pts.hrv, weight: 0.15, higherIsBetter: true,
    },
    {
      label: 'Awake time (WASO)',
      current: `${t.wasoMin} min`,
      baseline: `${Math.round(baseWaso)} min`,
      rawCurrent: t.wasoMin, rawBaseline: baseWaso,
      points: t.pts.waso, weight: 0.10, higherIsBetter: false,
    },
  ];

  return {
    score: t.score,
    components,
    weeklyAvg,
    firstWeekBaseline,
    delta: weeklyAvg - firstWeekBaseline,
    label: labelFor(t.score),
    hasData: true,
    trend,
    deepSleepTrend,
    deepSleepBaseline,
  };
};
