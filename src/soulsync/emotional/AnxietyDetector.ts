/**
 * AnxietyDetector — real-time acute-anxiety / panic-attack detector.
 *
 * Trigger conditions (must hold simultaneously for SUSTAINED_MS):
 *   1. BPM ≥ +20% over rolling 14-day resting baseline
 *   2. RMSSD < personalized 2-week 25th-percentile threshold
 *   3. Accelerometer magnitude ≈ 0 (user is sedentary — not exercising)
 *
 * Hysteresis: once fired, suppress further events for SUPPRESSION_MS so the
 * same episode doesn't re-fire repeatedly while the user is in the overlay.
 */

import { RingSample } from '../services/RingTelemetryService';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { emotionalEventRepo } from '../db/emotionalEventRepo';
import { emotionEventBus } from './EmotionEventBus';
import { EmotionalEvent, EmotionSeverity, interventionForTrigger } from './types';
import { getDB } from '../db/database';

const SUSTAINED_MS    = 60_000;             // condition must hold ≥60s before firing
const SUPPRESSION_MS  = 10 * 60_000;        // no re-fire within 10 min
const SEDENTARY_ACCEL = 0.15;               // m/s² — below this counts as "still"
const BPM_SPIKE_PCT   = 20;                 // ≥+20% over baseline

export interface AnxietyConfig {
  sustainedMs?: number;
  suppressionMs?: number;
  sedentaryAccelThreshold?: number;
  bpmSpikePct?: number;
}

export class AnxietyDetector {
  private cfg: Required<AnxietyConfig>;
  private conditionMetSince: number | null = null;
  private lastFiredAt = 0;
  // Cached personalized baselines — refreshed every 5 min
  private baselineBpm = 72;
  private baselineRmssd = 30;
  private personalRmssdThreshold = 20;
  private lastBaselineRefresh = 0;
  // Last RMSSD value seen — captured at trigger time
  private lastRmssd: number | null = null;

  constructor(cfg: AnxietyConfig = {}) {
    this.cfg = {
      sustainedMs: cfg.sustainedMs ?? SUSTAINED_MS,
      suppressionMs: cfg.suppressionMs ?? SUPPRESSION_MS,
      sedentaryAccelThreshold: cfg.sedentaryAccelThreshold ?? SEDENTARY_ACCEL,
      bpmSpikePct: cfg.bpmSpikePct ?? BPM_SPIKE_PCT,
    };
  }

  /** Externally updated by the EmotionalEngine whenever a new RMSSD is computed. */
  updateLatestRmssd(rmssd: number | null): void {
    this.lastRmssd = rmssd;
  }

  async ingest(s: RingSample): Promise<void> {
    const now = s.receivedAt;

    // 1) Refresh personalized baselines every 5 min
    if (now - this.lastBaselineRefresh > 5 * 60_000) {
      await this.refreshBaselines();
      this.lastBaselineRefresh = now;
    }

    // 2) Suppression window — silence re-fires
    if (now - this.lastFiredAt < this.cfg.suppressionMs) {
      this.conditionMetSince = null;
      return;
    }

    // 3) Evaluate conditions
    const bpmSpike = this.baselineBpm > 0
      && s.bpm >= this.baselineBpm * (1 + this.cfg.bpmSpikePct / 100);
    const rmssdCollapsed = this.lastRmssd !== null
      && this.lastRmssd < this.personalRmssdThreshold;
    const sedentary = s.accelMag < this.cfg.sedentaryAccelThreshold;

    const allConditionsMet = bpmSpike && rmssdCollapsed && sedentary;

    if (!allConditionsMet) {
      this.conditionMetSince = null;
      return;
    }

    // 4) Mark start of sustained window
    if (this.conditionMetSince === null) {
      this.conditionMetSince = now;
      return;
    }

    // 5) Once SUSTAINED_MS elapses, fire the event
    if (now - this.conditionMetSince >= this.cfg.sustainedMs) {
      await this.fire(s);
      this.lastFiredAt = now;
      this.conditionMetSince = null;
    }
  }

  private async refreshBaselines(): Promise<void> {
    // 14-day rolling baseline for personalization
    const { avgBpm, avgRmssd } = await ambientBaselineRepo.rollingAvg(14);
    if (avgBpm > 0) this.baselineBpm = avgBpm;
    if (avgRmssd > 0) this.baselineRmssd = avgRmssd;

    // 25th-percentile RMSSD over 14 days — the "personalized collapse" threshold
    const db = await getDB();
    const row = await db.getFirstAsync<{ p25: number }>(
      `SELECT ambient_rmssd AS p25 FROM ambient_baseline
       WHERE timestamp >= datetime('now', '-14 days') AND activity_state != 'sleep'
       ORDER BY ambient_rmssd ASC
       LIMIT 1
       OFFSET (SELECT MAX(0, CAST(COUNT(*) * 0.25 AS INTEGER) - 1)
               FROM ambient_baseline
               WHERE timestamp >= datetime('now', '-14 days') AND activity_state != 'sleep')`
    );
    if (row?.p25 != null && row.p25 > 0) {
      this.personalRmssdThreshold = row.p25;
    } else {
      // Default to 75% of mean as the collapse threshold
      this.personalRmssdThreshold = this.baselineRmssd * 0.75;
    }
  }

  private async fire(s: RingSample): Promise<void> {
    const severity = this.computeSeverity(s);
    const context = {
      bpmDeltaPct: this.baselineBpm > 0
        ? Math.round(((s.bpm - this.baselineBpm) / this.baselineBpm) * 100)
        : 0,
      rmssdAtTrigger: this.lastRmssd,
      personalThreshold: Math.round(this.personalRmssdThreshold * 10) / 10,
      accelMag: Math.round(s.accelMag * 100) / 100,
    };

    const id = await emotionalEventRepo.insert({
      trigger_type: 'anxiety',
      severity,
      detected_at: new Date(s.receivedAt).toISOString(),
      bpm_at_detection: s.bpm,
      rmssd_at_detection: this.lastRmssd,
      baseline_bpm: Math.round(this.baselineBpm),
      baseline_rmssd: Math.round(this.baselineRmssd * 10) / 10,
      context_json: JSON.stringify(context),
      intervention_id: null,
      intervention_started_at: null,
      intervention_completed_at: null,
      pre_intervention_rmssd: this.lastRmssd,
      post_intervention_rmssd: null,
      hrv_improvement_pct: null,
      resolved: 0,
    });

    const event: EmotionalEvent = {
      id,
      trigger: 'anxiety',
      severity,
      detectedAt: new Date(s.receivedAt),
      bpm: s.bpm,
      rmssd: this.lastRmssd,
      baselineBpm: Math.round(this.baselineBpm),
      baselineRmssd: Math.round(this.baselineRmssd * 10) / 10,
      context,
      recommendedIntervention: interventionForTrigger('anxiety'),
    };
    emotionEventBus.emit(event);
  }

  private computeSeverity(s: RingSample): EmotionSeverity {
    const pct = this.baselineBpm > 0
      ? ((s.bpm - this.baselineBpm) / this.baselineBpm) * 100
      : 0;
    if (pct >= 40) return 'acute';
    if (pct >= 30) return 'moderate';
    return 'mild';
  }

  reset(): void {
    this.conditionMetSince = null;
    this.lastFiredAt = 0;
  }
}
