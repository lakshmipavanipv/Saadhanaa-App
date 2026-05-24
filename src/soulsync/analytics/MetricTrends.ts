/**
 * MetricTrends — generic, multi-metric daily trend builder.
 *
 * Used by the History tab's toggleable line chart. Each metric returns
 * one value per day for the requested window.
 */

import { getDB } from '../db/database';

export type MetricKey =
  | 'bpm'
  | 'rmssd'
  | 'spo2'
  | 'skinTempC'
  | 'steps'
  | 'malas'
  | 'sessions'
  | 'peaks';

export interface MetricPoint { date: string; value: number | null; }

const SQL_FOR: Record<MetricKey, (days: number) => { sql: string; params: any[] }> = {
  bpm: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT AVG(ambient_bpm) FROM ambient_baseline
             WHERE date(timestamp) = day.d AND activity_state != 'sleep') AS value
          FROM day`,
    params: [],
  }),
  rmssd: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT AVG(ambient_rmssd) FROM ambient_baseline
             WHERE date(timestamp) = day.d AND activity_state != 'sleep') AS value
          FROM day`,
    params: [],
  }),
  spo2: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT AVG(spo2) FROM ambient_baseline
             WHERE date(timestamp) = day.d AND spo2 IS NOT NULL) AS value
          FROM day`,
    params: [],
  }),
  skinTempC: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT AVG(skin_temp_c) FROM ambient_baseline
             WHERE date(timestamp) = day.d AND skin_temp_c IS NOT NULL) AS value
          FROM day`,
    params: [],
  }),
  steps: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT step_count FROM daily_activity WHERE activity_date = day.d) AS value
          FROM day`,
    params: [],
  }),
  malas: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT SUM(mala_count) FROM session_spiritual
             WHERE date(start_time) = day.d) AS value
          FROM day`,
    params: [],
  }),
  sessions: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT COUNT(*) FROM session_spiritual
             WHERE date(start_time) = day.d AND end_time IS NOT NULL) AS value
          FROM day`,
    params: [],
  }),
  peaks: (days) => ({
    sql: `WITH RECURSIVE day(d) AS (
            SELECT date('now', '-${days - 1} days')
            UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
          )
          SELECT day.d AS date,
            (SELECT SUM(hrv_peaks_registered) FROM session_spiritual
             WHERE date(start_time) = day.d) AS value
          FROM day`,
    params: [],
  }),
};

export const buildMetricTrend = async (metric: MetricKey, days: number): Promise<MetricPoint[]> => {
  const db = await getDB();
  const { sql, params } = SQL_FOR[metric](days);
  const rows = await db.getAllAsync<{ date: string; value: number | null }>(sql, params);
  return rows.map(r => ({ date: r.date, value: r.value }));
};

export interface MetricInfo {
  key: MetricKey;
  label: string;
  unit: string;
  emoji: string;
  color: string;
}

export const METRICS: MetricInfo[] = [
  { key: 'bpm',       label: 'Resting BPM',  unit: 'bpm', emoji: '❤️', color: '#ef4444' },
  { key: 'rmssd',     label: 'HRV (RMSSD)',  unit: 'ms',  emoji: '〰️', color: '#d6e040' },
  { key: 'spo2',      label: 'SpO₂',         unit: '%',   emoji: '🫁', color: '#7EA1D8' },
  { key: 'skinTempC', label: 'Skin Temp',    unit: '°C',  emoji: '🌡️', color: '#f59e0b' },
  { key: 'steps',     label: 'Steps',        unit: '',    emoji: '👣', color: '#4ade80' },
  { key: 'malas',     label: 'Malas',        unit: '',    emoji: '📿', color: '#d4a017' },
  { key: 'sessions',  label: 'Sessions',     unit: '',    emoji: '🪷', color: '#9466c8' },
  { key: 'peaks',     label: 'HRV Peaks',    unit: '',    emoji: '✨', color: '#fbff7a' },
];

// Pearson correlation for the steps×japa card
export const pearson = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
};
