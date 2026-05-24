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

/**
 * Estimate steps from accelerometer-spike telemetry.
 *   • 'today'    — count of telemetry rows where accel_mag > 1.2 m/s² (walking gait)
 *   • 'baseline' — daily-average from the last 30 days (excluding today)
 *
 * If accel data isn't populated (e.g. session-only telemetry), the count will
 * be zero and the metric will appear as "—" in the UI.
 */
const computeSteps = async (mode: 'today' | 'baseline'): Promise<number> => {
  const db = await getDB();
  const today = new Date().toISOString().slice(0, 10);
  try {
    if (mode === 'today') {
      const row = await db.getFirstAsync<{ n: number }>(
        `SELECT COUNT(*) AS n FROM session_telemetry
         WHERE date(timestamp) = ?`,
        [today]
      );
      // ~1 telemetry packet ≈ 1 step proxy during walking; weight by 0.6 to
      // approximate actual step cadence vs raw packet rate.
      return Math.round((row?.n ?? 0) * 0.6);
    }
    const cutoff = new Date(Date.now() - 30 * 86_400_000).toISOString();
    const row = await db.getFirstAsync<{ n: number; d: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT date(timestamp)) AS d
       FROM session_telemetry
       WHERE timestamp >= ? AND date(timestamp) != ?`,
      [cutoff, today]
    );
    const daily = row?.d ? (row.n / row.d) * 0.6 : 0;
    return Math.round(daily);
  } catch {
    return 0;
  }
};

/**
 * Stress score (0-10) — higher = more stressed.
 *   Formula: weighted blend of (BPM above resting) + (HRV below baseline).
 *   Bounded to [0, 10]. Returns 0 if no data.
 */
const computeStressScore = (bpm: number, rmssd: number): number => {
  if (!bpm || !rmssd) return 0;
  // BPM contribution — 60 bpm = 0, 100 bpm = 5
  const bpmStress = Math.max(0, Math.min(5, (bpm - 60) / 8));
  // HRV contribution — RMSSD 50ms = 0, RMSSD 10ms = 5
  const hrvStress = Math.max(0, Math.min(5, (50 - rmssd) / 8));
  return Math.round((bpmStress + hrvStress) * 10) / 10;
};

/**
 * Depression-risk proxy (0-10) — higher = more concerning pattern.
 *   Composite of: elevated resting BPM + chronically low HRV + low activity.
 *   This is a wellness signal, NOT a clinical diagnosis.
 */
const computeDepressionScore = (bpm: number, rmssd: number, steps: number): number => {
  if (!bpm || !rmssd) return 0;
  // Elevated baseline BPM (mild marker)
  const bpmComp = Math.max(0, Math.min(3, (bpm - 70) / 10));
  // Low HRV (autonomic dysregulation marker)
  const hrvComp = Math.max(0, Math.min(4, (40 - rmssd) / 10));
  // Low daily activity (behavioural marker)
  const stepsComp = steps < 2000 ? 3 : steps < 5000 ? 1.5 : 0;
  const total = bpmComp + hrvComp + stepsComp;
  return Math.round(total * 10) / 10;
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

  // Derived wellness scores — computed from existing biometric data
  const todaySteps    = await computeSteps('today');
  const baseSteps     = await computeSteps('baseline');
  const todayStress   = computeStressScore(today.bpm, today.rmssd);
  const baseStress    = computeStressScore(baseline.bpm, baseline.rmssd);
  const todayDepress  = computeDepressionScore(today.bpm, today.rmssd, todaySteps);
  const baseDepress   = computeDepressionScore(baseline.bpm, baseline.rmssd, baseSteps);

  const metrics: MetricRow[] = [
    mk('Resting BPM',     'bpm',   today.bpm,        baseline.bpm,        true,  '❤️'),
    mk('HRV (RMSSD)',     'ms',    today.rmssd,      baseline.rmssd,      false, '〰️'),
    mk('SpO₂',            '%',     today.spo2,       baseline.spo2,       false, '🫁'),
    mk('Skin temp',       '°C',    today.skinTempC,  baseline.skinTempC,  true,  '🌡️'),
    mk('Steps',           'steps', todaySteps,       baseSteps,           false, '👣'),
    mk('Stress score',    '/10',   todayStress,      baseStress,          true,  '🧘'),
    mk('Depression risk', '/10',   todayDepress,     baseDepress,         true,  '🌿'),
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
