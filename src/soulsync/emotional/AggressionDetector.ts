/**
 * AggressionDetector — real-time acute-rage / agitation detector.
 *
 * Trigger conditions (must hold simultaneously for SUSTAINED_MS):
 *   1. Sudden surge in Blood Volume Pulse velocity (BVP velocity > baseline ×2)
 *   2. Erratic high-frequency hand movement (gyro magnitude > GYRO_SPIKE)
 *
 * Hardware action: low-latency BLE write to the ring's micro-buzzer — a
 * single soft chime as a physical mindfulness anchor on the user's finger.
 */

import { RingSample, RingService } from '../services/RingTelemetryService';
import { emotionalEventRepo } from '../db/emotionalEventRepo';
import { emotionEventBus } from './EmotionEventBus';
import { EmotionSeverity, interventionForTrigger, EmotionalEvent } from './types';

const SUSTAINED_MS = 5_000;     // 5s of agitation = signal
const SUPPRESSION_MS = 5 * 60_000;
const GYRO_SPIKE = 2.5;         // rad/s — vigorous hand movement
const BVP_SPIKE_RATIO = 2.0;    // current vs rolling mean

export class AggressionDetector {
  private bvpWindow: number[] = []; // last ~60s of BVP velocities
  private conditionMetSince: number | null = null;
  private lastFiredAt = 0;

  constructor(private ring: RingService) {}

  ingest(s: RingSample): void {
    const now = s.receivedAt;

    // Maintain a 60-sample rolling window of BVP velocity
    this.bvpWindow.push(s.bvpVelocity);
    if (this.bvpWindow.length > 60) this.bvpWindow.shift();

    if (now - this.lastFiredAt < SUPPRESSION_MS) {
      this.conditionMetSince = null;
      return;
    }

    const bvpMean = this.bvpWindow.reduce((a, b) => a + b, 0) / this.bvpWindow.length;
    const bvpSpike = bvpMean > 0 && s.bvpVelocity > bvpMean * BVP_SPIKE_RATIO;
    const erraticMovement = s.gyroMag > GYRO_SPIKE;

    if (!(bvpSpike && erraticMovement)) {
      this.conditionMetSince = null;
      return;
    }

    if (this.conditionMetSince === null) {
      this.conditionMetSince = now;
      return;
    }

    if (now - this.conditionMetSince >= SUSTAINED_MS) {
      void this.fire(s, bvpMean);
      this.lastFiredAt = now;
      this.conditionMetSince = null;
    }
  }

  private async fire(s: RingSample, bvpMean: number): Promise<void> {
    const severity: EmotionSeverity = s.gyroMag > 4 ? 'acute' : 'moderate';
    const context = {
      gyroMag: Math.round(s.gyroMag * 100) / 100,
      bvpVelocity: Math.round(s.bvpVelocity * 100) / 100,
      bvpMean: Math.round(bvpMean * 100) / 100,
      bvpRatio: bvpMean > 0 ? Math.round((s.bvpVelocity / bvpMean) * 10) / 10 : 0,
    };

    const id = await emotionalEventRepo.insert({
      trigger_type: 'aggression',
      severity,
      detected_at: new Date(s.receivedAt).toISOString(),
      bpm_at_detection: s.bpm,
      rmssd_at_detection: null,
      baseline_bpm: null,
      baseline_rmssd: null,
      context_json: JSON.stringify(context),
      intervention_id: null,
      intervention_started_at: null,
      intervention_completed_at: null,
      pre_intervention_rmssd: null,
      post_intervention_rmssd: null,
      hrv_improvement_pct: null,
      resolved: 0,
    });

    // HARDWARE ACTION — distinctive cooling pattern (long-short-long) at
    // medium intensity. Different from the anxiety buzz (5-pulse) so the
    // user can tell the two apart by feel.
    void this.ring.buzz({ pattern: [400, 150, 400], intensity: 'medium' });

    const event: EmotionalEvent = {
      id,
      trigger: 'aggression',
      severity,
      detectedAt: new Date(s.receivedAt),
      bpm: s.bpm,
      rmssd: null,
      baselineBpm: null,
      baselineRmssd: null,
      context,
      recommendedIntervention: interventionForTrigger('aggression'),
    };
    emotionEventBus.emit(event);
  }

  reset(): void {
    this.bvpWindow = [];
    this.conditionMetSince = null;
    this.lastFiredAt = 0;
  }
}
