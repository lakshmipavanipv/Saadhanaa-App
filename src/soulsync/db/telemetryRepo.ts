import { getDB } from './database';

export interface TelemetryRow {
  session_id: string;
  timestamp: string;
  bpm: number;
  rmssd_ms: number | null;
}

export const telemetryRepo = {
  async insert(row: TelemetryRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO session_telemetry (session_id, timestamp, bpm, rmssd_ms)
       VALUES (?, ?, ?, ?)`,
      [row.session_id, row.timestamp, row.bpm, row.rmssd_ms]
    );
  },

  async forSession(sessionId: string): Promise<TelemetryRow[]> {
    const db = await getDB();
    return db.getAllAsync<TelemetryRow>(
      `SELECT * FROM session_telemetry WHERE session_id = ? ORDER BY timestamp`,
      [sessionId]
    );
  },
};
