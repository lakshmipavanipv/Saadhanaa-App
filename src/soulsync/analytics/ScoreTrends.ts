/**
 * ScoreTrends — 30-day rolling series for the three composite scores
 * (Japa Effect, Sleep, Calm) plus KPI comparisons (now vs first week,
 * monthly improvement, lifetime improvement).
 *
 * Powers the Insights tab. All computations reuse existing per-day
 * analytics (JapaEffect, SleepScore, CalmDivergence) instead of
 * duplicating scoring logic.
 */

import { getDB } from '../db/database';
import { sleepRepo } from '../db/sleepRepo';
import { computeCalmDivergence } from './CalmDivergence';

export interface TrendPoint {
  date: string;          // YYYY-MM-DD
  score: number | null;  // null = no data for that day
}

export interface ScoreKPI {
  label: string;
  baseline: number;       // first-7-days average
  now: number;            // last-7-days average
  monthlyDelta: number;   // (last 7 days) − (28 days ago, 7-day window)
  lifetimeDelta: number;  // now − baseline
}

export interface ScoreTrendsSnapshot {
  japa: TrendPoint[];
  sleep: TrendPoint[];
  calm: TrendPoint[];
  kpis: ScoreKPI[];
}

const last30Dates = (): string[] => {
  const out: string[] = [];
  for (let i = 29; i >= 0; i--) {
    out.push(new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
};

// ─── Per-day Japa Effect score (reusing the same scoring rules) ────

const dailyJapaScore = async (dateStr: string): Promise<number | null> => {
  const db = await getDB();
  const row = await db.getFirstAsync<{
    total_minutes: number | null;
    avg_bpm: number | null;
    avg_rmssd: number | null;
    min_spo2: number | null;
  }>(
    `SELECT COALESCE(SUM(
        CASE WHEN s.end_time IS NOT NULL
             THEN (julianday(s.end_time) - julianday(s.start_time)) * 1440
             ELSE 0 END
     ), 0) AS total_minutes,
     AVG(t.bpm)      AS avg_bpm,
     AVG(t.rmssd_ms) AS avg_rmssd,
     MIN(t.spo2)     AS min_spo2
     FROM session_spiritual s
     LEFT JOIN session_telemetry t ON t.session_id = s.session_id
     WHERE date(s.start_time) = ?`,
    [dateStr]
  );

  const minutes = row?.total_minutes ?? 0;
  if (minutes <= 0) return null;

  // Baseline for that day from ambient (non-session readings)
  const ambient = await db.getFirstAsync<{ avg_bpm: number | null; avg_rmssd: number | null; avg_spo2: number | null }>(
    `SELECT AVG(ambient_bpm) AS avg_bpm, AVG(ambient_rmssd) AS avg_rmssd, AVG(spo2) AS avg_spo2
     FROM ambient_baseline
     WHERE date(timestamp) = ? AND activity_state != 'sleep'`,
    [dateStr]
  );

  const baseBpm   = ambient?.avg_bpm   ?? 0;
  const baseRmssd = ambient?.avg_rmssd ?? 0;
  const baseSpo2  = ambient?.avg_spo2  ?? 0;

  const hrvDelta = (row?.avg_rmssd != null && baseRmssd > 0) ? (row.avg_rmssd - baseRmssd) : 0;
  const bpmDelta = (row?.avg_bpm   != null && baseBpm   > 0) ? (baseBpm - row.avg_bpm)     : 0;
  const spo2Dip  = (row?.min_spo2  != null && baseSpo2  > 0) ? Math.max(0, baseSpo2 - row.min_spo2) : 0;

  const hrvPts =
    hrvDelta >= 30 ? 100 :
    hrvDelta >= 20 ? 85  :
    hrvDelta >= 10 ? 70  :
    hrvDelta >= 0  ? 50  :
    hrvDelta >= -10 ? 25 : 0;
  const bpmPts =
    bpmDelta >= 15 ? 100 :
    bpmDelta >= 10 ? 85  :
    bpmDelta >= 5  ? 70  :
    bpmDelta >= 0  ? 50  :
    bpmDelta >= -5 ? 25 : 0;
  const durationPts =
    minutes >= 20 ? 100 :
    minutes >= 15 ? 85  :
    minutes >= 10 ? 70  :
    minutes >= 5  ? 40  :
    minutes >= 2  ? 20  : 0;
  const spo2Pts =
    spo2Dip <= 0.5 ? 100 :
    spo2Dip <= 1   ? 75  :
    spo2Dip <= 2   ? 40  :
    spo2Dip <= 3   ? 20  : 0;

  return Math.round(hrvPts * 0.40 + bpmPts * 0.30 + durationPts * 0.20 + spo2Pts * 0.10);
};

// ─── Per-day Sleep score (uses SleepScore's scoring) ───────────────

const dailySleepScore = async (dateStr: string): Promise<number | null> => {
  const all = await sleepRepo.last30Days();
  const r = all.find(x => x.sleep_date === dateStr);
  if (!r || r.total_sleep_min === 0) return null;

  const hours = r.total_sleep_min / 60;
  const wasoMin = r.awakenings * 5;
  const inBedMin = r.total_sleep_min + wasoMin;
  const efficiency = inBedMin > 0 ? (r.total_sleep_min / inBedMin) * 100 : 0;
  const deepPct = (r.deep_sleep_min / r.total_sleep_min) * 100;
  const remPct  = (r.rem_sleep_min  / r.total_sleep_min) * 100;

  const durationPts =
    hours >= 7 && hours <= 9 ? 100 :
    (hours >= 6 && hours < 7) || (hours > 9 && hours <= 10) ? 75 :
    (hours >= 5 && hours < 6) || (hours > 10 && hours <= 11) ? 50 :
    hours >= 4 && hours < 5 ? 25 : 0;
  const efficiencyPts =
    efficiency >= 90 ? 100 : efficiency >= 85 ? 75 :
    efficiency >= 80 ? 50  : efficiency >= 70 ? 25 : 0;
  const deepPts =
    deepPct >= 15 && deepPct <= 20 ? 100 :
    deepPct >= 10 && deepPct <= 25 ? 75 :
    deepPct >= 5  && deepPct <= 30 ? 50 :
    deepPct >= 3  && deepPct <= 35 ? 25 : 0;
  const remPts =
    remPct >= 20 && remPct <= 25 ? 100 :
    remPct >= 15 && remPct <= 30 ? 75 :
    (remPct >= 10 && remPct < 15) || (remPct > 30 && remPct <= 35) ? 50 :
    remPct >= 5 && remPct < 10 ? 25 : 0;
  const wasoPts =
    wasoMin < 15 ? 100 : wasoMin < 30 ? 75 :
    wasoMin < 60 ? 50  : wasoMin < 90 ? 25 : 0;
  // Skip HRV in this trend pass (single-row sleep, no HRV linkage available
  // without extra query per day). Allocate that 15% weight to the others.
  return Math.round(durationPts * 0.235 + efficiencyPts * 0.235 + deepPts * 0.235 + remPts * 0.18 + wasoPts * 0.115);
};

// ─── KPI builder ───────────────────────────────────────────────────

const buildKPI = (label: string, points: TrendPoint[]): ScoreKPI => {
  const scored = points.filter(p => p.score != null) as Array<{ date: string; score: number }>;
  if (scored.length === 0) return { label, baseline: 0, now: 0, monthlyDelta: 0, lifetimeDelta: 0 };
  const first7 = scored.slice(0, 7);
  const last7  = scored.slice(-7);
  const baseline = Math.round(first7.reduce((s, p) => s + p.score, 0) / first7.length);
  const now      = Math.round(last7.reduce((s, p) => s + p.score, 0) / last7.length);
  // 28-days-ago 7-day window for monthly delta
  const monthAgoStart = Math.max(0, scored.length - 35);
  const monthAgoEnd   = Math.max(0, scored.length - 28);
  const monthAgoWin   = scored.slice(monthAgoStart, monthAgoEnd);
  const monthAgo = monthAgoWin.length > 0
    ? Math.round(monthAgoWin.reduce((s, p) => s + p.score, 0) / monthAgoWin.length)
    : now;
  return {
    label,
    baseline,
    now,
    monthlyDelta: now - monthAgo,
    lifetimeDelta: now - baseline,
  };
};

// ─── Main entry ────────────────────────────────────────────────────

export const computeScoreTrends = async (): Promise<ScoreTrendsSnapshot> => {
  const dates = last30Dates();

  const japa:  TrendPoint[] = [];
  const sleep: TrendPoint[] = [];
  const calm:  TrendPoint[] = [];

  for (const d of dates) {
    japa.push({  date: d, score: await dailyJapaScore(d) });
    sleep.push({ date: d, score: await dailySleepScore(d) });
    try {
      const c = await computeCalmDivergence(d);
      calm.push({ date: d, score: c.divergencePct });
    } catch {
      calm.push({ date: d, score: null });
    }
  }

  return {
    japa, sleep, calm,
    kpis: [
      buildKPI('Japa Effect',  japa),
      buildKPI('Sleep Score',  sleep),
      buildKPI('Calm Score',   calm),
    ],
  };
};
