import { getDB } from './database';
import { EmotionalEventRow, EmotionTrigger } from '../emotional/types';

export const emotionalEventRepo = {
  /** Insert a fresh trigger event and return the new id. */
  async insert(row: Omit<EmotionalEventRow, 'id'>): Promise<number> {
    const db = await getDB();
    const r = await db.runAsync(
      `INSERT INTO emotional_event
        (trigger_type, severity, detected_at,
         bpm_at_detection, rmssd_at_detection, baseline_bpm, baseline_rmssd,
         context_json, intervention_id, intervention_started_at,
         intervention_completed_at, pre_intervention_rmssd, post_intervention_rmssd,
         hrv_improvement_pct, resolved)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        row.trigger_type, row.severity, row.detected_at,
        row.bpm_at_detection, row.rmssd_at_detection, row.baseline_bpm, row.baseline_rmssd,
        row.context_json, row.intervention_id, row.intervention_started_at,
        row.intervention_completed_at, row.pre_intervention_rmssd, row.post_intervention_rmssd,
        row.hrv_improvement_pct, row.resolved,
      ]
    );
    // expo-sqlite returns lastInsertRowId on RunResult
    return (r as any).lastInsertRowId ?? 0;
  },

  async patch(id: number, patch: Partial<EmotionalEventRow>): Promise<void> {
    const db = await getDB();
    const entries = Object.entries(patch);
    if (!entries.length) return;
    const setClause = entries.map(([k]) => `${k} = ?`).join(', ');
    await db.runAsync(
      `UPDATE emotional_event SET ${setClause} WHERE id = ?`,
      [...entries.map(([, v]) => v as any), id]
    );
  },

  /** Latest unresolved event of a given trigger type, if any. */
  async latestUnresolved(trigger: EmotionTrigger): Promise<EmotionalEventRow | null> {
    const db = await getDB();
    const row = await db.getFirstAsync<EmotionalEventRow>(
      `SELECT * FROM emotional_event
       WHERE trigger_type = ? AND resolved = 0
       ORDER BY detected_at DESC LIMIT 1`,
      [trigger]
    );
    return row ?? null;
  },

  async forDateRange(fromISO: string, toISO: string): Promise<EmotionalEventRow[]> {
    const db = await getDB();
    return db.getAllAsync<EmotionalEventRow>(
      `SELECT * FROM emotional_event
       WHERE detected_at BETWEEN ? AND ?
       ORDER BY detected_at DESC`,
      [fromISO, toISO]
    );
  },

  async todaysEvents(): Promise<EmotionalEventRow[]> {
    const db = await getDB();
    const today = new Date().toISOString().slice(0, 10);
    return db.getAllAsync<EmotionalEventRow>(
      `SELECT * FROM emotional_event
       WHERE date(detected_at) = ?
       ORDER BY detected_at DESC`,
      [today]
    );
  },

  /** Convergence rate: % of events with an intervention completed within X minutes. */
  async convergenceRate(days: number): Promise<{ resolved: number; total: number; rate: number }> {
    const db = await getDB();
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const total = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM emotional_event WHERE detected_at >= ?`,
      [cutoff]
    );
    const resolved = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM emotional_event
       WHERE detected_at >= ? AND intervention_completed_at IS NOT NULL`,
      [cutoff]
    );
    const t = total?.n ?? 0;
    const r = resolved?.n ?? 0;
    return { resolved: r, total: t, rate: t === 0 ? 0 : r / t };
  },
};
