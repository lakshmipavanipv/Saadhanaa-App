import { getDB } from './database';

export interface PeakMarkerRow {
  peak_id?: number;
  session_id: string;
  timestamp: string;
  rmssd_ms: number;
  improvement_pct: number;
}

export const peakRepo = {
  async insert(row: Omit<PeakMarkerRow, 'peak_id'>): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO spiritual_peak_marker (session_id, timestamp, rmssd_ms, improvement_pct)
       VALUES (?, ?, ?, ?)`,
      [row.session_id, row.timestamp, row.rmssd_ms, row.improvement_pct]
    );
  },

  async forSession(sessionId: string): Promise<PeakMarkerRow[]> {
    const db = await getDB();
    return db.getAllAsync<PeakMarkerRow>(
      `SELECT * FROM spiritual_peak_marker WHERE session_id = ? ORDER BY timestamp`,
      [sessionId]
    );
  },
};
