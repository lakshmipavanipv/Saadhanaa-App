import { getDB } from './database';

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
    const row = await db.getFirstAsync<{ avg_bpm: number | null; avg_rmssd: number | null; n: number }>(
      `SELECT AVG(ambient_bpm) AS avg_bpm, AVG(ambient_rmssd) AS avg_rmssd, COUNT(*) AS n
       FROM ambient_baseline
       WHERE timestamp >= ? AND activity_state != 'sleep'`,
      [cutoff]
    );
    return { avgBpm: row?.avg_bpm ?? 0, avgRmssd: row?.avg_rmssd ?? 0, n: row?.n ?? 0 };
  },

  /** Hourly BPM buckets for one calendar day — drives Line A (Ambient Baseline). */
  async hourlySeriesForDate(yyyyMmDd: string): Promise<Array<{ hour: number; bpm: number }>> {
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

  /** Today's averages — used for "Today vs your normal day" comparison. */
  async todaysAvg(): Promise<{ bpm: number; rmssd: number; spo2: number; skinTempC: number; n: number }> {
    const db = await getDB();
    const today = new Date().toISOString().slice(0, 10);
    const row = await db.getFirstAsync<any>(
      `SELECT AVG(ambient_bpm) AS bpm, AVG(ambient_rmssd) AS rmssd,
              AVG(spo2) AS spo2, AVG(skin_temp_c) AS skin_temp_c,
              COUNT(*) AS n
       FROM ambient_baseline
       WHERE date(timestamp) = ? AND activity_state != 'sleep'`,
      [today]
    );
    return {
      bpm: row?.bpm ?? 0,
      rmssd: row?.rmssd ?? 0,
      spo2: row?.spo2 ?? 0,
      skinTempC: row?.skin_temp_c ?? 0,
      n: row?.n ?? 0,
    };
  },

  /** Multi-day baseline (default: last 30 days excluding today + sleep). */
  async normalcyBaseline(days: number = 30):
    Promise<{ bpm: number; rmssd: number; spo2: number; skinTempC: number; n: number }> {
    const db = await getDB();
    const today = new Date().toISOString().slice(0, 10);
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const row = await db.getFirstAsync<any>(
      `SELECT AVG(ambient_bpm) AS bpm, AVG(ambient_rmssd) AS rmssd,
              AVG(spo2) AS spo2, AVG(skin_temp_c) AS skin_temp_c,
              COUNT(*) AS n
       FROM ambient_baseline
       WHERE timestamp >= ? AND date(timestamp) != ? AND activity_state != 'sleep'`,
      [cutoff, today]
    );
    return {
      bpm: row?.bpm ?? 0,
      rmssd: row?.rmssd ?? 0,
      spo2: row?.spo2 ?? 0,
      skinTempC: row?.skin_temp_c ?? 0,
      n: row?.n ?? 0,
    };
  },

  /** Last N minutes of BPM samples — drives the "pre-Japa" slice of the journey chart. */
  async lastMinutes(minutes: number):
    Promise<Array<{ timestamp: string; bpm: number; rmssd: number }>> {
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
