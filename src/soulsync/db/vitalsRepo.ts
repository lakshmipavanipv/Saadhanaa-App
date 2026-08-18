/**
 * vitalsRepo — the historic store for every scalar the ring reports.
 *
 * The ring keeps a rolling on-board window and re-reports all of it on each
 * sync, so writes here are idempotent by construction: (metric, ts) is the
 * primary key and `insertMany` upserts. Sync the same day twice and the row
 * count does not move.
 *
 * Everything the app used to recompute from a live BLE pull now reads from
 * this table instead, which is what makes the KPIs survive a screen unmount.
 */

import { getDB } from './database';

export type VitalMetric = 'hr' | 'hrv' | 'spo2' | 'temp' | 'stress' | 'bp' | 'sugar';
export type VitalSource = 'sync' | 'live';

export interface VitalSample {
  metric: VitalMetric;
  ts: number;          // epoch ms
  value: number;
  value2?: number | null;
  source?: VitalSource;
}

export interface VitalRow {
  metric: VitalMetric;
  ts: number;
  day: string;
  value: number;
  value2: number | null;
  source: VitalSource;
}

export interface DailyStat {
  day: string;
  avg: number;
  min: number;
  max: number;
  samples: number;
}

export interface MetricStats {
  samples: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  latest: number | null;
  latestTs: number | null;
}

/** Local YYYY-MM-DD for an epoch-ms instant (NOT toISOString — that's UTC). */
export const dayOf = (ts: number): string => {
  const d = new Date(ts);
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/** Physiologically implausible readings are dropped rather than stored. */
const RANGES: Record<VitalMetric, [number, number]> = {
  hr:     [25, 240],
  hrv:    [1, 400],
  spo2:   [50, 100],
  temp:   [20, 45],
  stress: [0, 100],
  bp:     [40, 260],
  sugar:  [1, 40],
};

export const isPlausible = (metric: VitalMetric, value: number): boolean => {
  if (!Number.isFinite(value)) return false;
  const [lo, hi] = RANGES[metric];
  return value >= lo && value <= hi;
};

export const vitalsRepo = {
  /**
   * Upsert a batch. Implausible values and non-finite timestamps are skipped.
   * Returns how many rows were actually written.
   */
  async insertMany(samples: VitalSample[]): Promise<number> {
    const clean = samples.filter(
      (s) => Number.isFinite(s.ts) && s.ts > 0 && isPlausible(s.metric, s.value)
    );
    if (clean.length === 0) return 0;

    const db = await getDB();
    await db.withTransactionAsync(async () => {
      for (const s of clean) {
        await db.runAsync(
          `INSERT INTO vitals_sample (metric, ts, day, value, value2, source)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(metric, ts) DO UPDATE SET
             value  = excluded.value,
             value2 = excluded.value2,
             source = excluded.source`,
          [s.metric, Math.round(s.ts), dayOf(s.ts), s.value, s.value2 ?? null, s.source ?? 'sync']
        );
      }
    });
    return clean.length;
  },

  /** Samples for a metric within [fromTs, toTs], oldest first. */
  async range(metric: VitalMetric, fromTs: number, toTs: number): Promise<VitalRow[]> {
    const db = await getDB();
    return db.getAllAsync<VitalRow>(
      `SELECT * FROM vitals_sample
       WHERE metric = ? AND ts BETWEEN ? AND ?
       ORDER BY ts ASC`,
      [metric, Math.round(fromTs), Math.round(toTs)]
    );
  },

  /** All samples for one local day, oldest first. */
  async forDay(metric: VitalMetric, day: string): Promise<VitalRow[]> {
    const db = await getDB();
    return db.getAllAsync<VitalRow>(
      `SELECT * FROM vitals_sample WHERE metric = ? AND day = ? ORDER BY ts ASC`,
      [metric, day]
    );
  },

  /** Most recent N samples, newest first. */
  async recent(metric: VitalMetric, limit = 100): Promise<VitalRow[]> {
    const db = await getDB();
    return db.getAllAsync<VitalRow>(
      `SELECT * FROM vitals_sample WHERE metric = ? ORDER BY ts DESC LIMIT ?`,
      [metric, limit]
    );
  },

  /** Per-day avg/min/max over the trailing `days` window, oldest day first. */
  async dailyStats(metric: VitalMetric, days = 30): Promise<DailyStat[]> {
    const db = await getDB();
    const cutoff = dayOf(Date.now() - (days - 1) * 86_400_000);
    return db.getAllAsync<DailyStat>(
      `SELECT day,
              AVG(value)   AS avg,
              MIN(value)   AS min,
              MAX(value)   AS max,
              COUNT(*)     AS samples
       FROM vitals_sample
       WHERE metric = ? AND day >= ?
       GROUP BY day
       ORDER BY day ASC`,
      [metric, cutoff]
    );
  },

  /** Aggregate stats over the trailing `days` window (default: today only). */
  async stats(metric: VitalMetric, days = 1): Promise<MetricStats> {
    const db = await getDB();
    const cutoff = dayOf(Date.now() - (days - 1) * 86_400_000);
    const agg = await db.getFirstAsync<{
      samples: number; avg: number | null; min: number | null; max: number | null;
    }>(
      `SELECT COUNT(*) AS samples, AVG(value) AS avg, MIN(value) AS min, MAX(value) AS max
       FROM vitals_sample WHERE metric = ? AND day >= ?`,
      [metric, cutoff]
    );
    const last = await db.getFirstAsync<{ value: number; ts: number }>(
      `SELECT value, ts FROM vitals_sample WHERE metric = ? ORDER BY ts DESC LIMIT 1`,
      [metric]
    );
    return {
      samples: agg?.samples ?? 0,
      avg: agg?.avg ?? null,
      min: agg?.min ?? null,
      max: agg?.max ?? null,
      latest: last?.value ?? null,
      latestTs: last?.ts ?? null,
    };
  },

  /** Newest sample for a metric, or null if the table has none yet. */
  async latest(metric: VitalMetric): Promise<VitalRow | null> {
    const db = await getDB();
    const row = await db.getFirstAsync<VitalRow>(
      `SELECT * FROM vitals_sample WHERE metric = ? ORDER BY ts DESC LIMIT 1`,
      [metric]
    );
    return row ?? null;
  },

  /**
   * Newest sample per metric in one round-trip — what the dashboard tiles
   * need. Metrics with no history are simply absent from the map.
   */
  async latestAll(): Promise<Partial<Record<VitalMetric, VitalRow>>> {
    const db = await getDB();
    const rows = await db.getAllAsync<VitalRow>(
      `SELECT v.* FROM vitals_sample v
       JOIN (SELECT metric, MAX(ts) AS ts FROM vitals_sample GROUP BY metric) m
         ON v.metric = m.metric AND v.ts = m.ts`
    );
    const out: Partial<Record<VitalMetric, VitalRow>> = {};
    for (const r of rows) out[r.metric] = r;
    return out;
  },

  /** True once any ring data at all has been stored. Drives empty states. */
  async hasAnyData(): Promise<boolean> {
    const db = await getDB();
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM vitals_sample');
    return (row?.n ?? 0) > 0;
  },

  /** Total stored samples per metric — shown in Settings as a sync receipt. */
  async counts(): Promise<Record<string, number>> {
    const db = await getDB();
    const rows = await db.getAllAsync<{ metric: string; n: number }>(
      'SELECT metric, COUNT(*) AS n FROM vitals_sample GROUP BY metric'
    );
    return Object.fromEntries(rows.map((r) => [r.metric, r.n]));
  },
};
