import { getDB } from '../db/database';

export interface CorrelationPoint {
  date: string;        // YYYY-MM-DD (the mala day)
  malas: number;
  deepSleepMin: number; // following-night deep sleep minutes
}

export interface CorrelationMatrix {
  points: CorrelationPoint[];
  pearsonR: number;
  slopeMinPerMala: number;
  insightMessage: string;
  hasEnoughData: boolean;
}

/**
 * 30-day rolling correlation pairing total daily completed malas
 * against that night's Deep Sleep duration.
 */
export const buildSleepCorrelationMatrix = async (days = 30): Promise<CorrelationMatrix> => {
  const db = await getDB();

  const rows = await db.getAllAsync<{ mala_day: string; malas: number; deep_sleep_min: number }>(
    `WITH RECURSIVE day(d) AS (
       SELECT date('now', '-${days - 1} days')
       UNION ALL SELECT date(d, '+1 day') FROM day WHERE d < date('now')
     )
     SELECT day.d AS mala_day,
       COALESCE((SELECT SUM(mala_count) FROM session_spiritual
                 WHERE date(start_time) = day.d), 0) AS malas,
       COALESCE((SELECT deep_sleep_min FROM sleep_record
                 WHERE sleep_date = date(day.d, '+1 day')), 0) AS deep_sleep_min
     FROM day;`
  );

  const points: CorrelationPoint[] = rows.map(r => ({
    date: r.mala_day,
    malas: r.malas,
    deepSleepMin: r.deep_sleep_min,
  }));

  const nonZero = points.filter(p => p.malas > 0 && p.deepSleepMin > 0).length;
  const hasEnoughData = nonZero >= 7;

  const pearsonR = pearson(
    points.map(p => p.malas),
    points.map(p => p.deepSleepMin)
  );
  const slopeMinPerMala = olsSlope(
    points.map(p => p.malas),
    points.map(p => p.deepSleepMin)
  );

  let insightMessage: string;
  if (!hasEnoughData) {
    insightMessage = 'Practice for a few more days to unlock your sleep correlation.';
  } else if (pearsonR >= 0.5) {
    insightMessage = `Strong link — every extra mala adds ~${Math.max(0, Math.round(slopeMinPerMala))} min of deep sleep.`;
  } else if (pearsonR >= 0.2) {
    insightMessage = 'Mild positive trend — consistent practice nudges deep sleep upward.';
  } else if (pearsonR <= -0.2) {
    insightMessage = 'Heads-up — late-night sessions may be reducing deep sleep. Try shifting earlier.';
  } else {
    insightMessage = 'No strong correlation yet — keep building consistency.';
  }

  return { points, pearsonR, slopeMinPerMala, insightMessage, hasEnoughData };
};

const pearson = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n === 0 || n !== y.length) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx, b = y[i] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
};

const olsSlope = (x: number[], y: number[]): number => {
  const n = x.length;
  if (n < 2) return 0;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0, dx = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - mx) * (y[i] - my);
    dx  += (x[i] - mx) ** 2;
  }
  return dx === 0 ? 0 : num / dx;
};
