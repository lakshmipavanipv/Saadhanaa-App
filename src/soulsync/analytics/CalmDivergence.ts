import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';

export interface DivergenceSnapshot {
  baselineSeries: Array<{ hour: number; bpm: number }>;   // Line A
  spiritualSeries: Array<{ hour: number; bpm: number }>;  // Line B
  divergencePct: number;                                  // positive = japa more relaxed
  message: string;
  hasData: boolean;
}

export const computeCalmDivergence = async (yyyyMmDd: string): Promise<DivergenceSnapshot> => {
  const baselineSeries = await ambientBaselineRepo.hourlySeriesForDate(yyyyMmDd);
  const sessions = await sessionSpiritualRepo.sessionsOnDate(yyyyMmDd);

  const byHour = new Map<number, { sum: number; n: number }>();
  for (const s of sessions) {
    if (s.session_avg_bpm == null) continue;
    const h = new Date(s.start_time).getHours();
    const e = byHour.get(h) ?? { sum: 0, n: 0 };
    e.sum += s.session_avg_bpm;
    e.n += 1;
    byHour.set(h, e);
  }
  const spiritualSeries = Array.from(byHour.entries())
    .map(([hour, { sum, n }]) => ({ hour, bpm: Math.round(sum / n) }))
    .sort((a, b) => a.hour - b.hour);

  const avg = (arr: Array<{ bpm: number }>) =>
    arr.length ? arr.reduce((a, b) => a + b.bpm, 0) / arr.length : 0;
  const baselineAvg = avg(baselineSeries);
  const spiritualAvg = avg(spiritualSeries);
  const divergencePct =
    baselineAvg > 0 && spiritualAvg > 0
      ? Math.round(((baselineAvg - spiritualAvg) / baselineAvg) * 100)
      : 0;

  const hasData = baselineSeries.length > 0 && spiritualSeries.length > 0;

  let message: string;
  if (!hasData) {
    message = 'Start a Japa session — Soulsync will compare your meditative heart-rate against your daily baseline.';
  } else if (divergencePct > 0) {
    message = `During Japa, your nervous system was ${divergencePct}% more relaxed than your daily baseline.`;
  } else {
    message = 'Today’s Japa BPM matched your baseline — try a longer session for deeper relaxation.';
  }

  return { baselineSeries, spiritualSeries, divergencePct, message, hasData };
};
