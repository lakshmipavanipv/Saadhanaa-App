import { getDB } from './database';

export interface SleepRow {
  sleep_date: string;
  total_sleep_min: number;
  deep_sleep_min: number;
  rem_sleep_min: number;
  awakenings: number;
  /** Minutes since midnight when the user went to bed. Null for legacy rows.
   *  Used by the 9pm–12am quality-window scoring (1260–1439 maps to peak). */
  bedtime_minute?: number | null;
}

export const sleepRepo = {
  async upsert(row: SleepRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT OR REPLACE INTO sleep_record
        (sleep_date, total_sleep_min, deep_sleep_min, rem_sleep_min, awakenings, bedtime_minute)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        row.sleep_date, row.total_sleep_min, row.deep_sleep_min,
        row.rem_sleep_min, row.awakenings, row.bedtime_minute ?? null,
      ]
    );
  },

  async last30Days(): Promise<SleepRow[]> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    return db.getAllAsync<SleepRow>(
      `SELECT * FROM sleep_record WHERE sleep_date >= ? ORDER BY sleep_date`,
      [cutoff]
    );
  },
};
