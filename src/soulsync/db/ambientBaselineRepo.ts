import { getDB } from './database';

export type ActivityState = 'idle' | 'walking' | 'working' | 'sleep';

export interface AmbientBaselineRow {
  timestamp: string;
  ambient_bpm: number;
  ambient_rmssd: number;
  activity_state: ActivityState;
}

export const ambientBaselineRepo = {
  async insert(row: AmbientBaselineRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO ambient_baseline (timestamp, ambient_bpm, ambient_rmssd, activity_state)
       VALUES (?, ?, ?, ?)`,
      [row.timestamp, row.ambient_bpm, row.ambient_rmssd, row.activity_state]
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

  async deleteOlderThan(days: number): Promise<void> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    await db.runAsync(`DELETE FROM ambient_baseline WHERE timestamp < ?`, [cutoff]);
  },
};
