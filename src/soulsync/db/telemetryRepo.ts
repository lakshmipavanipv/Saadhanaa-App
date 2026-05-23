import { getDB } from './database';

export interface TelemetryRow {
  session_id: string;
  timestamp: string;
  bpm: number;
  rmssd_ms: number | null;
  spo2?: number | null;
  skin_temp_c?: number | null;
}

export const telemetryRepo = {
  async insert(row: TelemetryRow): Promise<void> {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO session_telemetry (session_id, timestamp, bpm, rmssd_ms, spo2, skin_temp_c)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [row.session_id, row.timestamp, row.bpm, row.rmssd_ms,
       row.spo2 ?? null, row.skin_temp_c ?? null]
    );
  },

  async forSession(sessionId: string): Promise<TelemetryRow[]> {
    const db = await getDB();
    return db.getAllAsync<TelemetryRow>(
      `SELECT * FROM session_telemetry WHERE session_id = ? ORDER BY timestamp`,
      [sessionId]
    );
  },

  /** Aggregates for the session summary card. */
  async aggregates(sessionId: string):
    Promise<{ avgBpm: number; avgRmssd: number; avgSpo2: number; avgSkinTempC: number; n: number }> {
    const db = await getDB();
    const row = await db.getFirstAsync<any>(
      `SELECT AVG(bpm) AS bpm, AVG(rmssd_ms) AS rmssd,
              AVG(spo2) AS spo2, AVG(skin_temp_c) AS skin_temp_c,
              COUNT(*) AS n
       FROM session_telemetry
       WHERE session_id = ?`,
      [sessionId]
    );
    return {
      avgBpm: row?.bpm ?? 0,
      avgRmssd: row?.rmssd ?? 0,
      avgSpo2: row?.spo2 ?? 0,
      avgSkinTempC: row?.skin_temp_c ?? 0,
      n: row?.n ?? 0,
    };
  },
};
