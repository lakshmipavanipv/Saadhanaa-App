/**
 * Soulsync — Emotional Remediation types.
 *
 * Mental-health intervention pipeline:
 *   Detector (anxiety / lethargy / aggression)
 *     → EmotionalEvent (written to emotional_event table)
 *     → emotionEventBus (in-memory PubSub)
 *     → React UI overlay (GroundingOverlay / MicroSadhana / Cooling)
 *     → User completes intervention
 *     → post-intervention HRV measured → improvement % logged
 *     → resolved flag set when biometrics return to baseline
 */

export type EmotionTrigger = 'anxiety' | 'lethargy' | 'aggression';
export type EmotionSeverity = 'mild' | 'moderate' | 'acute';
export type InterventionId =
  | 'grounding_japa'
  | 'micro_sadhana'
  | 'cooling_workspace';

export interface EmotionalEventRow {
  id?: number;
  trigger_type: EmotionTrigger;
  severity: EmotionSeverity;
  detected_at: string;                      // ISO
  bpm_at_detection: number | null;
  rmssd_at_detection: number | null;
  baseline_bpm: number | null;
  baseline_rmssd: number | null;
  context_json: string | null;
  intervention_id: InterventionId | null;
  intervention_started_at: string | null;
  intervention_completed_at: string | null;
  pre_intervention_rmssd: number | null;
  post_intervention_rmssd: number | null;
  hrv_improvement_pct: number | null;
  resolved: 0 | 1;
}

/** Snapshot of conditions at trigger time — sent to UI overlays. */
export interface EmotionalEvent {
  id: number;
  trigger: EmotionTrigger;
  severity: EmotionSeverity;
  detectedAt: Date;
  bpm: number | null;
  rmssd: number | null;
  baselineBpm: number | null;
  baselineRmssd: number | null;
  context: Record<string, any>;
  recommendedIntervention: InterventionId;
}

export const interventionForTrigger = (t: EmotionTrigger): InterventionId => ({
  anxiety:    'grounding_japa' as InterventionId,
  lethargy:   'micro_sadhana'  as InterventionId,
  aggression: 'cooling_workspace' as InterventionId,
}[t]);
