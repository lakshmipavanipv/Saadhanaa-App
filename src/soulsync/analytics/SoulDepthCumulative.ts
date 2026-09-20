/**
 * SoulDepthCumulative — what japa has done to the body, across every sitting.
 *
 * WHY THIS IS SEPARATE FROM SadhanaDepth
 *
 * `SadhanaDepth` scores ONE sitting against the hour before it. That is the
 * right question for "how did this morning go", and the wrong one for "is the
 * practice doing anything". A single sitting is a small sample of a noisy
 * signal: heart-rate variability swings with sleep, caffeine, hydration and
 * the weather, and one good or bad morning says very little.
 *
 * This pools every japa sitting's telemetry and compares it against the
 * practitioner's ordinary waking body over the last seven days. More readings
 * on both sides, so the comparison survives a bad night.
 *
 * WHY SEVEN DAYS
 *
 * Long enough to average out a single poor night's sleep, short enough to
 * still describe the body the practitioner currently has. A thirty-day
 * baseline would compare this week's japa against a month that includes it.
 * Today is excluded from the baseline for the same reason: a baseline that
 * contains the thing being measured drags toward it and understates the
 * difference.
 *
 * WHAT IS SCORED, AND WHAT IS ONLY SHOWN
 *
 *   SCORED   HRV (RMSSD) rise      0.60
 *            Resting heart-rate fall 0.40
 *
 * These are the two the relaxation-response literature actually moves, and
 * the two this ring measures well enough to average.
 *
 *   SHOWN, NOT SCORED   SpO2, skin temperature
 *
 * The SR16 spot-measures both at roughly ±2% and ±0.3 °C. Differences that
 * size are inside the instrument's own error, so they are reported as context
 * and given no weight. Scoring them would dress up noise.
 *
 * WHEN THERE IS NO SCORE
 *
 * Null, with a sentence saying which side is missing. A practitioner with no
 * Soul Sync sittings has not failed to settle; nothing was measured.
 */

import { getDB } from '../db/database';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { scoreVagal, scoreSettle } from './SadhanaDepth';

/** Readings needed on each side before an average is worth stating. */
const MIN_JAPA_SAMPLES = 20;
const MIN_BASELINE_SAMPLES = 20;

export interface VitalRow {
  key: 'hrv' | 'hr' | 'spo2' | 'temp';
  label: string;
  unit: string;
  baseline: number | null;
  duringJapa: number | null;
  /** duringJapa − baseline, in the metric's own unit. */
  delta: number | null;
  /** True when a fall is the healthier direction. */
  lowerIsBetter: boolean;
  /** Weight in the score. Zero for the context rows. */
  weight: number;
  /** 0-100 for the scored rows, null otherwise or when a side is missing. */
  points: number | null;
}

export interface SoulDepthSummary {
  /** 0-100 across every japa sitting, or null when too little was measured. */
  score: number | null;
  /** Fraction of the model's weight that had data behind it, 0-1. */
  confidence: number;
  rows: VitalRow[];

  sessions: number;
  totalMinutes: number;
  japaSamples: number;
  baselineSamples: number;
  /** Plain sentence. Says what the score means, or why there isn't one. */
  note: string;
}

const round1 = (n: number | null): number | null =>
  n == null ? null : Math.round(n * 10) / 10;

const EMPTY = (note: string): SoulDepthSummary => ({
  score: null, confidence: 0, rows: [],
  sessions: 0, totalMinutes: 0, japaSamples: 0, baselineSamples: 0, note,
});

/**
 * The cumulative picture.
 *
 * Reads every japa sitting ever recorded, not a window: this is the "so far"
 * figure, and its whole value is that it keeps accumulating evidence.
 */
export async function cumulativeSoulDepth(): Promise<SoulDepthSummary> {
  const db = await getDB();

  let japa: {
    bpm: number | null; rmssd: number | null; spo2: number | null;
    temp: number | null; n: number; sessions: number;
  } | null | undefined;
  let totals: { sessions: number; minutes: number | null } | null | undefined;
  try {
    japa = await db.getFirstAsync(
      `SELECT AVG(t.bpm)         AS bpm,
              AVG(t.rmssd_ms)    AS rmssd,
              AVG(t.spo2)        AS spo2,
              AVG(t.skin_temp_c) AS temp,
              COUNT(*)           AS n,
              COUNT(DISTINCT s.session_id) AS sessions
         FROM session_telemetry t
         JOIN session_spiritual s ON s.session_id = t.session_id
        WHERE s.practice = 'japa'`
    );
    /*
     * Minutes come from their own query, NOT from the joined one above.
     *
     * Summing `duration_min` across a join to telemetry counts each sitting
     * once per reading it produced — a twenty-minute sitting with forty
     * readings would contribute eight hundred minutes. One row per session is
     * the only way to add durations.
     */
    totals = await db.getFirstAsync(
      `SELECT COUNT(*) AS sessions, SUM(duration_min) AS minutes
         FROM session_spiritual WHERE practice = 'japa' AND end_time IS NOT NULL`
    );
  } catch {
    return EMPTY('No japa sittings have been recorded yet.');
  }

  if (!japa || japa.n < MIN_JAPA_SAMPLES) {
    return EMPTY(
      japa && japa.sessions > 0
        ? `Only ${japa.n} readings across ${japa.sessions} japa sitting${japa.sessions === 1 ? '' : 's'} so far. ` +
          'A few more sittings with Soul Sync running and this fills in.'
        : 'Start Soul Sync before japa and this builds up over your sittings — it compares your body during japa with your ordinary week.'
    );
  }

  // The ordinary waking body over the last seven days, today excluded.
  const base = await ambientBaselineRepo.normalcyBaseline(7).catch(() => null);
  if (!base || base.n < MIN_BASELINE_SAMPLES) {
    return EMPTY(
      'There is not enough of an ordinary week to compare against yet. ' +
      'Wear the ring through a few normal days and the comparison appears.'
    );
  }

  const b = {
    rmssd: base.rmssd > 0 ? base.rmssd : null,
    bpm: base.bpm > 0 ? base.bpm : null,
    spo2: base.spo2 > 0 ? base.spo2 : null,
    temp: base.skinTempC > 0 ? base.skinTempC : null,
  };

  const mk = (
    key: VitalRow['key'], label: string, unit: string,
    baseline: number | null, during: number | null,
    lowerIsBetter: boolean, weight: number, points: number | null,
  ): VitalRow => ({
    key, label, unit,
    baseline: round1(baseline),
    duringJapa: round1(during),
    delta: baseline != null && during != null ? round1(during - baseline) : null,
    lowerIsBetter, weight, points,
  });

  const hrvDelta = japa.rmssd != null && b.rmssd != null ? japa.rmssd - b.rmssd : null;
  // Settling is a FALL, so the sign flips before it reaches the curve.
  const hrDrop = japa.bpm != null && b.bpm != null ? b.bpm - japa.bpm : null;

  const rows: VitalRow[] = [
    mk('hrv', 'Heart-rate variability', 'ms', b.rmssd, japa.rmssd, false, 0.6,
       hrvDelta != null ? scoreVagal(hrvDelta) : null),
    mk('hr', 'Resting heart rate', 'bpm', b.bpm, japa.bpm, true, 0.4,
       hrDrop != null ? scoreSettle(hrDrop) : null),
    mk('spo2', 'Blood oxygen', '%', b.spo2, japa.spo2, false, 0, null),
    mk('temp', 'Skin temperature', '°C', b.temp, japa.temp, true, 0, null),
  ];

  const scored = rows.filter((r) => r.weight > 0 && r.points != null);
  const weightHad = scored.reduce((a, r) => a + r.weight, 0);

  if (weightHad === 0) {
    return {
      ...EMPTY('The ring has not sent the readings this needs — heart rate and variability — during japa.'),
      rows, sessions: japa.sessions, japaSamples: japa.n,
      baselineSamples: base.n,
    };
  }

  const score = Math.round(
    scored.reduce((a, r) => a + (r.points as number) * r.weight, 0) / weightHad
  );

  const note =
    score >= 80 ? 'Japa reliably settles your body — a clear, repeated shift away from your ordinary week.'
    : score >= 65 ? 'Japa settles your body more often than not.'
    : score >= 50 ? 'A mild settling effect so far. It usually grows as sittings get longer.'
    : score >= 35 ? 'Your body during japa looks much like your ordinary week. Slowing the out-breath is the fastest thing that changes this.'
    : 'Your body has not settled during japa so far. Sitting still for a minute before starting gives it somewhere to come down from.';

  return {
    score,
    confidence: Math.round(weightHad * 100) / 100,
    rows,
    sessions: japa.sessions,
    totalMinutes: Math.round(totals?.minutes ?? 0),
    japaSamples: japa.n,
    baselineSamples: base.n,
    note,
  };
}
