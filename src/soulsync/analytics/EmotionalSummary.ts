/**
 * EmotionalSummary — aggregates over the emotional_event table for the
 * History tab "anxiety / lethargy / aggression at a glance" card.
 */

import { getDB } from '../db/database';
import { EmotionTrigger } from '../emotional/types';

export interface TriggerStats {
  trigger: EmotionTrigger;
  total: number;
  withIntervention: number;
  resolved: number;
  avgImprovementPct: number | null;   // avg HRV improvement when intervention done
  successRate: number;                // resolved / total
}

export interface EmotionalSummarySnapshot {
  days: number;
  byTrigger: TriggerStats[];
  totalEvents: number;
  totalResolved: number;
  overallSuccessRate: number;
  /** Dominant trigger across the window (for the chip / headline). */
  dominantTrigger: EmotionTrigger | null;
}

export const buildEmotionalSummary = async (days: number): Promise<EmotionalSummarySnapshot> => {
  const db = await getDB();
  const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();

  const rows = await db.getAllAsync<{
    trigger_type: EmotionTrigger;
    total: number;
    with_intervention: number;
    resolved: number;
    avg_improvement: number | null;
  }>(
    `SELECT trigger_type,
            COUNT(*)                                                      AS total,
            SUM(CASE WHEN intervention_id IS NOT NULL THEN 1 ELSE 0 END)  AS with_intervention,
            SUM(resolved)                                                 AS resolved,
            AVG(hrv_improvement_pct)                                      AS avg_improvement
     FROM emotional_event
     WHERE detected_at >= ?
     GROUP BY trigger_type`,
    [cutoff]
  );

  const byTrigger: TriggerStats[] = (['anxiety', 'lethargy', 'aggression'] as EmotionTrigger[]).map(t => {
    const row = rows.find(r => r.trigger_type === t);
    return {
      trigger: t,
      total: row?.total ?? 0,
      withIntervention: row?.with_intervention ?? 0,
      resolved: row?.resolved ?? 0,
      avgImprovementPct: row?.avg_improvement ?? null,
      successRate: row && row.total > 0 ? (row.resolved ?? 0) / row.total : 0,
    };
  });

  const totalEvents = byTrigger.reduce((a, b) => a + b.total, 0);
  const totalResolved = byTrigger.reduce((a, b) => a + b.resolved, 0);
  const dominant = byTrigger.length === 0 || totalEvents === 0
    ? null
    : byTrigger.reduce((a, b) => (b.total > a.total ? b : a)).trigger;

  return {
    days,
    byTrigger,
    totalEvents,
    totalResolved,
    overallSuccessRate: totalEvents === 0 ? 0 : totalResolved / totalEvents,
    dominantTrigger: dominant,
  };
};
