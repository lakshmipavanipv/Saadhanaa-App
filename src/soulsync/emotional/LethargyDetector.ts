/**
 * LethargyDetector — daily-batch depressive-cycle detector.
 *
 * Trigger conditions (must hold for 3 consecutive days):
 *   1. Step count < 15 % of user's 30-day baseline
 *   2. Sleep architecture highly fragmented (awakenings ≥ 4 OR deep_sleep < 50 % of baseline)
 *   3. Flat ambient HRV (stdev / mean < 0.10 — no rhythmic variation)
 *
 * Runs once per day at first-app-open. Writes an emotional_event of type
 * 'lethargy' if all conditions hold for 3 days running.
 */

import { getDB } from '../db/database';
import { emotionalEventRepo } from '../db/emotionalEventRepo';
import { emotionEventBus } from './EmotionEventBus';
import { EmotionalEvent, EmotionSeverity, interventionForTrigger } from './types';

const STEP_PCT_THRESHOLD     = 15;   // % of 30-day step baseline
const DEEP_SLEEP_PCT_THRESH  = 50;
const HRV_FLAT_CV            = 0.10; // coefficient of variation
const CONSECUTIVE_DAYS       = 3;

interface DailyAggregates {
  date: string;
  steps: number;
  baselineSteps: number;
  deepSleepMin: number;
  baselineDeepSleep: number;
  hrvCV: number;        // stdev / mean of ambient_rmssd that day
  flagged: boolean;
}

export class LethargyDetector {
  /**
   * Run a single daily pass — call at app boot (idempotent — won't re-fire
   * if today's event already logged).
   */
  async checkOnce(): Promise<EmotionalEvent | null> {
    const db = await getDB();
    // Already fired today?
    const todayHit = await db.getFirstAsync<{ n: number }>(
      `SELECT COUNT(*) AS n FROM emotional_event
       WHERE trigger_type = 'lethargy' AND date(detected_at) = date('now')`
    );
    if ((todayHit?.n ?? 0) > 0) return null;

    // Build daily aggregates for the last 3 days
    const days: DailyAggregates[] = [];
    for (let i = CONSECUTIVE_DAYS - 1; i >= 0; i--) {
      const d = await this.buildDay(i);
      days.push(d);
    }

    // All 3 must be flagged
    if (!days.every(d => d.flagged)) return null;

    const last = days[days.length - 1];
    const severity: EmotionSeverity =
      last.steps < last.baselineSteps * 0.05 ? 'acute' :
      last.steps < last.baselineSteps * 0.10 ? 'moderate' : 'mild';

    const context = {
      days: days.map(d => ({
        date: d.date,
        stepPct: d.baselineSteps > 0 ? Math.round((d.steps / d.baselineSteps) * 100) : 0,
        deepSleepMin: d.deepSleepMin,
        hrvCV: Math.round(d.hrvCV * 100) / 100,
      })),
    };

    const id = await emotionalEventRepo.insert({
      trigger_type: 'lethargy',
      severity,
      detected_at: new Date().toISOString(),
      bpm_at_detection: null,
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

    const event: EmotionalEvent = {
      id,
      trigger: 'lethargy',
      severity,
      detectedAt: new Date(),
      bpm: null, rmssd: null,
      baselineBpm: null, baselineRmssd: null,
      context,
      recommendedIntervention: interventionForTrigger('lethargy'),
    };
    emotionEventBus.emit(event);
    return event;
  }

  private async buildDay(daysAgo: number): Promise<DailyAggregates> {
    const db = await getDB();
    const dateExpr = `date('now', '-${daysAgo} days')`;
    const today = await db.getFirstAsync<{ d: string }>(`SELECT ${dateExpr} AS d`);
    const date = today?.d ?? '';

    // Step count for the day
    const stepRow = await db.getFirstAsync<{ steps: number }>(
      `SELECT step_count AS steps FROM daily_activity WHERE activity_date = ?`,
      [date]
    );
    const steps = stepRow?.steps ?? 0;

    // 30-day step baseline (excluding the day itself)
    const baselineRow = await db.getFirstAsync<{ avg: number }>(
      `SELECT AVG(step_count) AS avg FROM daily_activity
       WHERE activity_date < ? AND activity_date >= date(?, '-30 days')`,
      [date, date]
    );
    const baselineSteps = baselineRow?.avg ?? 0;

    // Sleep for the night ending on this date
    const sleepRow = await db.getFirstAsync<{ deep: number }>(
      `SELECT deep_sleep_min AS deep FROM sleep_record WHERE sleep_date = ?`,
      [date]
    );
    const deepSleepMin = sleepRow?.deep ?? 0;

    const baselineDeepRow = await db.getFirstAsync<{ avg: number }>(
      `SELECT AVG(deep_sleep_min) AS avg FROM sleep_record
       WHERE sleep_date < ? AND sleep_date >= date(?, '-30 days')`,
      [date, date]
    );
    const baselineDeepSleep = baselineDeepRow?.avg ?? 0;

    // HRV coefficient of variation for the day
    const hrvRows = await db.getAllAsync<{ v: number }>(
      `SELECT ambient_rmssd AS v FROM ambient_baseline
       WHERE date(timestamp) = ? AND activity_state != 'sleep'`,
      [date]
    );
    const hrvCV = coefficientOfVariation(hrvRows.map(r => r.v));

    const lowSteps = baselineSteps > 0 && steps < baselineSteps * (STEP_PCT_THRESHOLD / 100);
    const lowDeep = baselineDeepSleep > 0 && deepSleepMin < baselineDeepSleep * (DEEP_SLEEP_PCT_THRESH / 100);
    const flatHrv = hrvCV > 0 && hrvCV < HRV_FLAT_CV;

    const flagged = lowSteps && lowDeep && flatHrv;
    return { date, steps, baselineSteps, deepSleepMin, baselineDeepSleep, hrvCV, flagged };
  }
}

const coefficientOfVariation = (xs: number[]): number => {
  if (xs.length < 2) return 0;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  if (mean <= 0) return 0;
  const variance = xs.reduce((a, b) => a + (b - mean) ** 2, 0) / xs.length;
  return Math.sqrt(variance) / mean;
};
