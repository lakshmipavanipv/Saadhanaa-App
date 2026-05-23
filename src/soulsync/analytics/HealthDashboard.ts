/**
 * HealthDashboard — Samsung-Ring-style multi-metric comparison.
 *
 *   Today's averages (excluding sleep) vs. the user's rolling 30-day
 *   "normalcy" baseline (excluding today + sleep). For each metric we
 *   compute direction + magnitude, plus a 0-10 "meditation depth" score
 *   from the latest completed session.
 */

import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { telemetryRepo } from '../db/telemetryRepo';
import { getDB } from '../db/database';

export type MetricDirection = 'up' | 'down' | 'flat';
export interface MetricRow {
  label: string;
  unit: string;
  baseline: number;     // 30-day normalcy
  today: number;        // today's average
  deltaPct: number;     // ((today - baseline) / baseline) * 100
  direction: MetricDirection;
  /** Whether a "down" reading is healthier (true for resting BPM, false for SpO2 etc.). */
  lowerIsBetter: boolean;
  good: boolean;        // is today's reading "better than" baseline?
  emoji: string;
}

export interface HealthDashboardSnapshot {
  metrics: MetricRow[];
  depthScore: number | null;       // 0-10, latest session
  depthScoreSamples: number;       // # of sessions used for depth
  hasNormalcyData: boolean;        // ≥ 1 day of ambient samples outside today
  message: string;
}

const fmtDelta = (today: number, baseline: number): { pct: number; direction: MetricDirection } => {
  if (!baseline || !Number.isFinite(baseline)) return { pct: 0, direction: 'flat' };
  const pct = ((today - baseline) / baseline) * 100;
  const direction: MetricDirection = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  return { pct, direction };
};

/**
 * Composite 0-10 score for the most recent completed session.
 *   • HRV gain vs baseline (peaks_registered + improvement_pct)         [0-4]
 *   • BPM drop vs daily baseline                                         [0-3]
 *   • Session duration up to 30 min                                      [0-2]
 *   • SpO2 stability (within 1.5pp of baseline)                          [0-1]
 */
const computeDepthScore = async (): Promise<{ score: number | null; samples: number }> => {
  const db = await getDB();
  const session = await db.getFirstAsync<{
    session_id: string;
    start_time: string;
    end_time: string | null;
    session_avg_bpm: number | null;
    hrv_peaks_registered: number;
    avg_spo2: number | null;
  }>(
    `SELECT session_id, start_time, end_time, session_avg_bpm,
            hrv_peaks_registered, avg_spo2
     FROM session_spiritual
     WHERE end_time IS NOT NULL
     ORDER BY start_time DESC
     LIMIT 1`
  );
  if (!session) return { score: null, samples: 0 };

  const { avgBpm: baselineBpm, avgSpo2: baselineSpo2 } =
    await ambientBaselineRepo.normalcyBaseline(30).then(r => ({ avgBpm: r.bpm, avgSpo2: r.spo2 }));

  // HRV component — 0..4
  const peaks = session.hrv_peaks_registered;
  const hrvComp = Math.min(4, peaks * 0.7);

  // BPM-drop component — 0..3 (3 = 12+ bpm drop)
  const bpmDrop = baselineBpm > 0 && session.session_avg_bpm != null
    ? Math.max(0, baselineBpm - session.session_avg_bpm)
    : 0;
  const bpmComp = Math.min(3, bpmDrop / 4);

  // Duration component — 0..2 (2 = 30+ min)
  const start = new Date(session.start_time).getTime();
  const end = session.end_time ? new Date(session.end_time).getTime() : start;
  const minutes = (end - start) / 60_000;
  const durComp = Math.min(2, minutes / 15);

  // SpO2 stability — 0..1
  const spo2Diff = baselineSpo2 > 0 && session.avg_spo2 != null
    ? Math.abs(session.avg_spo2 - baselineSpo2)
    : 99;
  const spo2Comp = spo2Diff < 1.5 ? 1 : spo2Diff < 3 ? 0.5 : 0;

  const score = Math.round((hrvComp + bpmComp + durComp + spo2Comp) * 10) / 10;
  return { score: Math.min(10, score), samples: 1 };
};

export const computeHealthDashboard = async (): Promise<HealthDashboardSnapshot> => {
  const today = await ambientBaselineRepo.todaysAvg();
  const baseline = await ambientBaselineRepo.normalcyBaseline(30);

  const hasNormalcyData = baseline.n > 0;

  const mk = (
    label: string, unit: string, todayVal: number, baseVal: number,
    lowerIsBetter: boolean, emoji: string
  ): MetricRow => {
    const { pct, direction } = fmtDelta(todayVal, baseVal);
    const good = lowerIsBetter ? pct < 0 : pct > 0;
    return {
      label, unit, baseline: baseVal, today: todayVal,
      deltaPct: pct, direction, lowerIsBetter, good, emoji,
    };
  };

  const metrics: MetricRow[] = [
    mk('Resting BPM',  'bpm', today.bpm,        baseline.bpm,        true,  '❤️'),
    mk('HRV (RMSSD)',  'ms',  today.rmssd,      baseline.rmssd,      false, '〰️'),
    mk('SpO₂',         '%',   today.spo2,       baseline.spo2,       false, '🫁'),
    mk('Skin temp',    '°C',  today.skinTempC,  baseline.skinTempC,  true,  '🌡️'),
  ];

  const depth = await computeDepthScore();

  let message: string;
  if (!hasNormalcyData) {
    message = 'Soulsync is learning your normal. Keep the ring on for a few days to unlock the "vs normalcy" comparison.';
  } else {
    const bpm = metrics[0];
    if (bpm.good && Math.abs(bpm.deltaPct) > 3) {
      message = `Your resting BPM is ${Math.abs(bpm.deltaPct).toFixed(0)}% lower than your 30-day baseline — your nervous system is in a calmer state today.`;
    } else if (!bpm.good && Math.abs(bpm.deltaPct) > 3) {
      message = `Resting BPM is ${Math.abs(bpm.deltaPct).toFixed(0)}% above baseline — consider a longer Japa session today.`;
    } else {
      message = 'Today is tracking close to your normal baseline.';
    }
  }

  return {
    metrics,
    depthScore: depth.score,
    depthScoreSamples: depth.samples,
    hasNormalcyData,
    message,
  };
};
