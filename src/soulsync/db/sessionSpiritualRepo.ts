import { getDB } from './database';

export interface SessionSpiritualRow {
  session_id: string;
  start_time: string;
  end_time: string | null;
  mala_count: number;
  session_avg_bpm: number | null;
  hrv_peaks_registered: number;
  avg_spo2?: number | null;
  avg_skin_temp_c?: number | null;
  depth_score?: number | null;
}

export const sessionSpiritualRepo = {
  async create(row: SessionSpiritualRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO session_spiritual
        (session_id, start_time, end_time, mala_count, session_avg_bpm, hrv_peaks_registered)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.session_id, row.start_time, row.end_time, row.mala_count, row.session_avg_bpm, row.hrv_peaks_registered]
    );
  },

  async patch(sessionId: string, patch: Partial<SessionSpiritualRow>): Promise<void> {
    const db = await getDB();
    const entries = Object.entries(patch);
    if (!entries.length) return;
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    await db.runAsync(
      `UPDATE session_spiritual SET ${setClause} WHERE session_id = ?`,
      [...entries.map(([, v]) => v as any), sessionId]
    );
  },

  async incrementPeaks(sessionId: string): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `UPDATE session_spiritual
       SET hrv_peaks_registered = hrv_peaks_registered + 1
       WHERE session_id = ?`,
      [sessionId]
    );
  },

  async incrementMalas(sessionId: string): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `UPDATE session_spiritual SET mala_count = mala_count + 1 WHERE session_id = ?`,
      [sessionId]
    );
  },

  async sessionsOnDate(yyyyMmDd: string): Promise<SessionSpiritualRow[]> {
    const db = await getDB();
    return db.getAllAsync<SessionSpiritualRow>(
      `SELECT * FROM session_spiritual WHERE date(start_time) = ? ORDER BY start_time`,
      [yyyyMmDd]
    );
  },

  /** Average BPM during the session — used at session end to backfill summary. */
  async computeAvgBpm(sessionId: string): Promise<number | null> {
    const db = await getDB();
    const row = await db.getFirstAsync<{ avg_bpm: number | null }>(
      `SELECT AVG(bpm) AS avg_bpm FROM session_telemetry WHERE session_id = ?`,
      [sessionId]
    );
    return row?.avg_bpm == null ? null : Math.round(row.avg_bpm);
  },
};
