import { getDB } from './database';
import { dayOf } from './vitalsRepo';
import { vitalsPrefs, type VitalsPrefs } from '../settings/vitalsPrefs';

/**
 * The vitals the ring reports live (ambient_baseline) and the vitals it stores
 * on-board and hands over on sync (vitals_sample) describe the same body. The
 * aggregates below therefore average over BOTH sources so a KPI is computed
 * from every reading that exists, not just the ones captured while a screen
 * happened to be open.
 *
 * `metric` is the vitals_sample channel; `column` its ambient_baseline
 * counterpart. Zero is the ambient table's "not measured" sentinel, so it is
 * excluded — averaging it in would drag every baseline toward nothing.
 *
 * Both sides also exclude sleep. These aggregates describe a waking body, and
 * a sleeping heart rate is materially lower — folding nights in would quietly
 * drag every "your normal" baseline down and make each day look elevated by
 * comparison. The ambient table records an activity_state; the ring's stored
 * samples do not, so they are filtered by the user's sleep window instead.
 */
const UNION_AVG = (column: string, metric: string) => `
  SELECT AVG(v) AS avg, COUNT(*) AS n FROM (
    SELECT ${column} AS v FROM ambient_baseline
      WHERE ${column} > 0 AND activity_state != 'sleep' AND __AMBIENT_WHERE__
    UNION ALL
    SELECT value AS v FROM vitals_sample
      WHERE metric = '${metric}' AND __VITALS_WHERE____SLEEP_FILTER__
  )`;

/**
 * SQL fragment excluding the sleep window from vitals_sample rows.
 * Hours come from `vitalsPrefs`, which validates them as integers 0-23, so
 * interpolating them here cannot inject.
 */
const sleepHourFilter = (p: VitalsPrefs): string => {
  if (!p.sleepModeEnabled) return '';
  const { sleepStartHour: start, sleepEndHour: end } = p;
  if (start === end) return '';
  const h = "CAST(strftime('%H', ts / 1000, 'unixepoch', 'localtime') AS INTEGER)";
  return start < end
    ? ` AND NOT (${h} >= ${start} AND ${h} < ${end})`
    : ` AND NOT (${h} >= ${start} OR ${h} < ${end})`;
};

/** Local calendar day — vitals_sample.day is local, so comparisons must be too. */
const localToday = (): string => dayOf(Date.now());

export type ActivityState = 'idle' | 'walking' | 'working' | 'sleep';

export interface AmbientBaselineRow {
  timestamp: string;
  ambient_bpm: number;
  ambient_rmssd: number;
  activity_state: ActivityState;
  spo2?: number | null;
  skin_temp_c?: number | null;
}

export const ambientBaselineRepo = {
  async insert(row: AmbientBaselineRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO ambient_baseline
        (timestamp, ambient_bpm, ambient_rmssd, activity_state, spo2, skin_temp_c)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.timestamp, row.ambient_bpm, row.ambient_rmssd, row.activity_state,
       row.spo2 ?? null, row.skin_temp_c ?? null]
    );
  },

  /** Rolling average over the last `days`, excluding sleep periods. */
  async rollingAvg(days: number): Promise<{ avgBpm: number; avgRmssd: number; n: number }> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const cutoffDay = dayOf(Date.now() - days * 86_400_000);
    const awake = sleepHourFilter(await vitalsPrefs.get());
    const one = async (column: string, metric: string) => {
      const sql = UNION_AVG(column, metric)
        .replace('__AMBIENT_WHERE__', 'timestamp >= ?')
        .replace('__VITALS_WHERE__', 'day >= ?')
        .replace('__SLEEP_FILTER__', awake);
      const row = await db.getFirstAsync<{ avg: number | null; n: number }>(sql, [cutoff, cutoffDay]);
      return { avg: row?.avg ?? 0, n: row?.n ?? 0 };
    };
    const [bpm, rmssd] = await Promise.all([
      one('ambient_bpm', 'hr'),
      one('ambient_rmssd', 'hrv'),
    ]);
    return { avgBpm: bpm.avg, avgRmssd: rmssd.avg, n: Math.max(bpm.n, rmssd.n) };
  },

  /** Hourly BPM buckets for one calendar day — drives Line A (Ambient Baseline). */
  async hourlySeriesForDate(yyyyMmDd: string): Promise<{ hour: number; bpm: number }[]> {
    const db = await getDB();
    return db.getAllAsync<{ hour: number; bpm: number }>(
      `SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour,
              AVG(ambient_bpm) AS bpm
       FROM ambient_baseline
       WHERE date(timestamp) = ? AND activity_state != 'sleep'
       GROUP BY hour ORDER BY hour`,
      [yyyyMmDd]
    );
  },

  /**
   * Today's averages — used for "Today vs your normal day" comparison.
   * Blends live ambient rows with the ring's stored history for today.
   */
  async todaysAvg(): Promise<{ bpm: number; rmssd: number; spo2: number; skinTempC: number; n: number }> {
    const db = await getDB();
    const today = localToday();
    const awake = sleepHourFilter(await vitalsPrefs.get());
    const one = async (column: string, metric: string) => {
      const sql = UNION_AVG(column, metric)
        .replace('__AMBIENT_WHERE__', "date(timestamp, 'localtime') = ?")
        .replace('__VITALS_WHERE__', 'day = ?')
        .replace('__SLEEP_FILTER__', awake);
      const row = await db.getFirstAsync<{ avg: number | null; n: number }>(sql, [today, today]);
      return { avg: row?.avg ?? 0, n: row?.n ?? 0 };
    };
    const [bpm, rmssd, spo2, temp] = await Promise.all([
      one('ambient_bpm', 'hr'),
      one('ambient_rmssd', 'hrv'),
      one('spo2', 'spo2'),
      one('skin_temp_c', 'temp'),
    ]);
    return {
      bpm: bpm.avg,
      rmssd: rmssd.avg,
      spo2: spo2.avg,
      skinTempC: temp.avg,
      // n reflects the richest channel — callers use it only as a "do we have
      // enough to say anything?" gate.
      n: Math.max(bpm.n, rmssd.n, spo2.n, temp.n),
    };
  },

  /**
   * Multi-day baseline (default: last 30 days excluding today + sleep) —
   * "your normal". Blends live ambient rows with the ring's stored history.
   */
  async normalcyBaseline(days: number = 30):
    Promise<{ bpm: number; rmssd: number; spo2: number; skinTempC: number; n: number }> {
    const db = await getDB();
    const today = localToday();
    const cutoffIso = new Date(Date.now() - days * 86_400_000).toISOString();
    const cutoffDay = dayOf(Date.now() - days * 86_400_000);
    const awake = sleepHourFilter(await vitalsPrefs.get());
    const one = async (column: string, metric: string) => {
      const sql = UNION_AVG(column, metric)
        .replace('__AMBIENT_WHERE__', "timestamp >= ? AND date(timestamp, 'localtime') != ?")
        .replace('__VITALS_WHERE__', 'day >= ? AND day != ?')
        .replace('__SLEEP_FILTER__', awake);
      const row = await db.getFirstAsync<{ avg: number | null; n: number }>(
        sql, [cutoffIso, today, cutoffDay, today]
      );
      return { avg: row?.avg ?? 0, n: row?.n ?? 0 };
    };
    const [bpm, rmssd, spo2, temp] = await Promise.all([
      one('ambient_bpm', 'hr'),
      one('ambient_rmssd', 'hrv'),
      one('spo2', 'spo2'),
      one('skin_temp_c', 'temp'),
    ]);
    return {
      bpm: bpm.avg,
      rmssd: rmssd.avg,
      spo2: spo2.avg,
      skinTempC: temp.avg,
      n: Math.max(bpm.n, rmssd.n, spo2.n, temp.n),
    };
  },

  /** Last N minutes of BPM samples — drives the "pre-Japa" slice of the journey chart. */
  async lastMinutes(minutes: number):
    Promise<{ timestamp: string; bpm: number; rmssd: number }[]> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - minutes * 60_000).toISOString();
    return db.getAllAsync<any>(
      `SELECT timestamp, ambient_bpm AS bpm, ambient_rmssd AS rmssd
       FROM ambient_baseline
       WHERE timestamp >= ?
       ORDER BY timestamp ASC`,
      [cutoff]
    );
  },

  async deleteOlderThan(days: number): Promise<void> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    await db.runAsync(`DELETE FROM ambient_baseline WHERE timestamp < ?`, [cutoff]);
  },
};
