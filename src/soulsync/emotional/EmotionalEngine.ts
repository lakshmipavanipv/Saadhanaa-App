/**
 * EmotionalEngine — single orchestrator that owns the three detectors and
 * runs each new ring sample through them in order.
 *
 * Wiring:
 *   AmbientIngestion           ─┐
 *                                ├──► EmotionalEngine.ingest()
 *   useSoulsyncSession (active) ─┘
 *
 *   On boot:                   EmotionalEngine.dailyCheck()  → LethargyDetector
 *   On every ring sample:      EmotionalEngine.ingest(s)     → Anxiety + Aggression
 *   On RMSSD recompute (1Hz):  EmotionalEngine.updateRmssd(v)
 */

import { RingSample, RingService } from '../services/RingTelemetryService';
import { AnxietyDetector } from './AnxietyDetector';
import { AggressionDetector } from './AggressionDetector';
import { LethargyDetector } from './LethargyDetector';
import { emotionalEventRepo } from '../db/emotionalEventRepo';
import { InterventionId } from './types';

export class EmotionalEngine {
  private anxiety: AnxietyDetector;
  private aggression: AggressionDetector;
  private lethargy: LethargyDetector;
  private suppressed = false;  // pause while user is *in* an intervention

  constructor(ring: RingService) {
    this.anxiety = new AnxietyDetector();
    this.aggression = new AggressionDetector(ring);
    this.lethargy = new LethargyDetector();
  }

  async ingest(sample: RingSample): Promise<void> {
    if (this.suppressed) return;
    await this.anxiety.ingest(sample);
    this.aggression.ingest(sample);
  }

  updateRmssd(rmssd: number | null): void {
    this.anxiety.updateLatestRmssd(rmssd);
  }

  async dailyCheck(): Promise<void> {
    await this.lethargy.checkOnce();
  }

  /** Called when the user enters an intervention overlay. */
  suppress(): void { this.suppressed = true; }

  /** Called when the user dismisses/finishes the overlay. */
  resume(): void {
    this.suppressed = false;
    this.anxiety.reset();
    this.aggression.reset();
  }

  // ── Intervention lifecycle (used by overlay components) ──────────

  async markInterventionStart(eventId: number, intervention: InterventionId, preRmssd: number | null): Promise<void> {
    await emotionalEventRepo.patch(eventId, {
      intervention_id: intervention,
      intervention_started_at: new Date().toISOString(),
      pre_intervention_rmssd: preRmssd,
    });
  }

  async markInterventionComplete(eventId: number, postRmssd: number | null, preRmssd: number | null): Promise<void> {
    const improvementPct =
      preRmssd != null && postRmssd != null && preRmssd > 0
        ? ((postRmssd - preRmssd) / preRmssd) * 100
        : null;
    await emotionalEventRepo.patch(eventId, {
      intervention_completed_at: new Date().toISOString(),
      post_intervention_rmssd: postRmssd,
      hrv_improvement_pct: improvementPct,
    });
  }

  async markResolved(eventId: number): Promise<void> {
    await emotionalEventRepo.patch(eventId, { resolved: 1 });
  }
}

// Singleton — set up at boot when ring is initialised
let _instance: EmotionalEngine | null = null;
export const setEmotionalEngine = (e: EmotionalEngine) => { _instance = e; };
export const getEmotionalEngine = (): EmotionalEngine | null => _instance;
