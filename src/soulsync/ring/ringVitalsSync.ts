/**
 * One-shot vitals sync — pulls sleep, HR, HRV, SpO2, temp, stress from the
 * paired SR16, aggregates them into daily rows the app already understands,
 * and upserts to the sleep_record + daily_activity tables.
 *
 * Runs off a single BLE session (connect → sync all → disconnect), so calling
 * it once from a screen effect is cheap enough (~15 s for all six metrics).
 *
 * Sleep segmentation logic mirrors RWfit's Path B parser (see
 * RWFit_App_Study.md §7.1):
 *   sleepModel  1 = deep     2 = light   4 = REM
 *   sleepModel  0 or 3       = awake
 *   sleepModel 17            = sleep onset (counted as light)
 *   sleepModel 34            = wake / session end marker
 * A "night" runs 18:00 → 12:00 next day and is stamped with the wake date.
 */

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import { sleepModelToStage, RING_EPOCH_UNIX } from './sync';
import type {
  SleepSample, HrSample, HrvSample, Spo2Sample, TempSample, StressSample,
  StepSample, TasbihSample, TsSample,
} from './sync';
import { sleepRepo } from '../db/sleepRepo';
import { getDB } from '../db/database';
import { vitalsRepo, type VitalSample } from '../db/vitalsRepo';

export interface RingVitalsSyncResult {
  sleep: { nightsUpserted: number; sampleCount: number };
  hr:    { samples: number; avg: number | null; min: number | null; max: number | null };
  hrv:   { samples: number; avg: number | null };
  spo2:  { samples: number; avg: number | null };
  temp:  { samples: number; avgC: number | null };
  stress:{ samples: number; avg: number | null };
  steps: { total: number; sampleCount: number };
  errors: string[];
  /**
   * Raw samples in one place so callers (HealthScreen) can render mini-charts
   * without a second BLE connection. Empty arrays if that metric errored.
   */
  raw: {
    sleep:  SleepSample[];
    hr:     HrSample[];
    hrv:    HrvSample[];
    spo2:   Spo2Sample[];
    temp:   TempSample[];
    stress: StressSample[];
    steps:  StepSample[];
    japa:   TasbihSample[];
  };
}

const emptyResult = (): RingVitalsSyncResult => ({
  sleep: { nightsUpserted: 0, sampleCount: 0 },
  hr:    { samples: 0, avg: null, min: null, max: null },
  hrv:   { samples: 0, avg: null },
  spo2:  { samples: 0, avg: null },
  temp:  { samples: 0, avgC: null },
  stress:{ samples: 0, avg: null },
  steps: { total: 0, sampleCount: 0 },
  errors: [],
  raw: {
    sleep: [], hr: [], hrv: [], spo2: [], temp: [], stress: [], steps: [], japa: [],
  },
});

/** Bucket a sample's Date into its "sleep night" — the calendar date the
 * user WAKES on. Samples between 18:00 and 06:00 belong to the following
 * morning's date; between 06:00 and 12:00 to the same day (early-riser).
 */
function nightBucket(ts: Date): string {
  const d = new Date(ts);
  if (d.getHours() >= 12) {
    // Evening samples (12:00–23:59) → tomorrow's wake date.
    d.setDate(d.getDate() + 1);
  }
  return d.toISOString().slice(0, 10);
}

async function aggregateSleep(samples: SleepSample[]): Promise<{ nights: number; total: number }> {
  if (samples.length < 2) return { nights: 0, total: samples.length };

  // Sort by time and group by night bucket
  const sorted = [...samples].sort((a, b) => a.ringTs - b.ringTs);
  const nights = new Map<string, SleepSample[]>();
  for (const s of sorted) {
    const key = nightBucket(s.timestamp);
    if (!nights.has(key)) nights.set(key, []);
    nights.get(key)!.push(s);
  }

  let upserted = 0;
  for (const [date, nightSamples] of nights) {
    if (nightSamples.length < 2) continue;

    let deepMin = 0, lightMin = 0, remMin = 0, awakeMin = 0, awakenings = 0;
    let bedtimeMinute: number | null = null;

    for (let i = 0; i < nightSamples.length - 1; i++) {
      const cur = nightSamples[i];
      const next = nightSamples[i + 1];
      const durSec = next.ringTs - cur.ringTs;
      if (durSec <= 0 || durSec > 6 * 3600) continue;   // skip gaps > 6h
      const durMin = durSec / 60;
      const stage = sleepModelToStage(cur.sleepModel);
      switch (stage) {
        case 'deep':  deepMin += durMin; break;
        case 'light': lightMin += durMin; break;
        case 'rem':   remMin += durMin; break;
        case 'awake': awakeMin += durMin; awakenings += 1; break;
        case 'onset':
          if (bedtimeMinute === null) {
            bedtimeMinute = cur.timestamp.getHours() * 60 + cur.timestamp.getMinutes();
          }
          lightMin += durMin;
          break;
        case 'end':   /* terminator — no duration */ break;
      }
    }

    const total = Math.round(deepMin + lightMin + remMin);
    if (total < 30) continue; // < 30 min isn't a real night; skip noise

    await sleepRepo.upsert({
      sleep_date: date,
      total_sleep_min: total,
      deep_sleep_min: Math.round(deepMin),
      rem_sleep_min: Math.round(remMin),
      awakenings,
      bedtime_minute: bedtimeMinute,
    });
    upserted++;
  }
  return { nights: upserted, total: samples.length };
}

function scalarStats(samples: readonly unknown[], field: string): {
  samples: number; avg: number | null; min: number | null; max: number | null;
} {
  if (!samples.length) return { samples: 0, avg: null, min: null, max: null };
  let sum = 0, min = Infinity, max = -Infinity, valid = 0;
  for (const s of samples) {
    const v = Number((s as Record<string, unknown>)[field]);
    if (!Number.isFinite(v) || v <= 0) continue;
    sum += v; valid++;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (valid === 0) return { samples: samples.length, avg: null, min: null, max: null };
  return { samples: samples.length, avg: Math.round(sum / valid), min, max };
}

/**
 * Upsert steps into the `daily_activity` table so ExerciseScreen picks
 * them up on its next read.
 */
async function upsertRingSteps(samples: StepSample[]): Promise<{ total: number; sampleCount: number }> {
  if (!samples.length) return { total: 0, sampleCount: 0 };
  const db = await getDB();
  // Group by day
  const byDay = new Map<string, number>();
  for (const s of samples) {
    const d = s.timestamp.toISOString().slice(0, 10);
    byDay.set(d, (byDay.get(d) ?? 0) + s.steps);
  }
  for (const [date, steps] of byDay) {
    await db.runAsync(
      `INSERT INTO daily_activity (activity_date, step_count) VALUES (?, ?)
       ON CONFLICT(activity_date) DO UPDATE SET step_count = MAX(step_count, excluded.step_count)`,
      [date, steps]
    );
  }
  const today = new Date().toISOString().slice(0, 10);
  return { total: byDay.get(today) ?? 0, sampleCount: byDay.size };
}

/**
 * Full one-shot sync. Non-blocking — call from a screen effect; caller
 * can await for a result summary or fire-and-forget.
 */
/**
 * Persist a decoded scalar channel into the historic store.
 *
 * The ring re-reports its full retained window on every sync, so this is
 * deliberately an upsert keyed on (metric, ts) — calling it repeatedly is
 * idempotent and never inflates the history.
 */
async function persistScalar<T extends TsSample>(
  metric: VitalSample['metric'],
  samples: T[],
  read: (s: T) => number,
): Promise<void> {
  if (samples.length === 0) return;
  const rows: VitalSample[] = samples.map((s) => ({
    metric,
    ts: s.timestamp.getTime(),
    value: read(s),
    source: 'sync' as const,
  }));
  await vitalsRepo.insertMany(rows);
}

/** How much stored history the detail screens chart when the ring is away. */
const HISTORY_WINDOW_DAYS = 7;

/**
 * Fill any empty scalar channel from `vitals_sample`.
 *
 * The ring only retains a short rolling window, and it is not always in
 * range — but every reading it ever handed over is on the phone. Screens ask
 * for a sync and render whatever comes back, so backfilling here means all of
 * them show real history without each one needing its own fallback path.
 *
 * Channels the ring DID return are left untouched: a live pull is always at
 * least as complete as what was stored from it.
 */
async function hydrateFromHistory(result: RingVitalsSyncResult): Promise<RingVitalsSyncResult> {
  const since = Date.now() - HISTORY_WINDOW_DAYS * 86_400_000;
  const now = Date.now();

  const load = async <T extends TsSample>(
    metric: VitalSample['metric'],
    build: (row: { ts: number; value: number }) => T,
  ): Promise<T[]> => {
    try {
      const rows = await vitalsRepo.range(metric, since, now);
      return rows.map((r) => build({ ts: r.ts, value: r.value }));
    } catch {
      return [];
    }
  };

  const base = (ts: number) => ({
    ringTs: Math.round(ts / 1000) - RING_EPOCH_UNIX,
    timestamp: new Date(ts),
  });

  if (result.raw.hr.length === 0) {
    const hr = await load<HrSample>('hr', (r) => ({ ...base(r.ts), hr: r.value }));
    if (hr.length) {
      result.raw.hr = hr;
      result.hr = scalarStats(hr, 'hr');
    }
  }
  if (result.raw.hrv.length === 0) {
    const hrv = await load<HrvSample>('hrv', (r) => ({ ...base(r.ts), hrv: r.value }));
    if (hrv.length) {
      result.raw.hrv = hrv;
      result.hrv = { samples: hrv.length, avg: scalarStats(hrv, 'hrv').avg };
    }
  }
  if (result.raw.spo2.length === 0) {
    const spo2 = await load<Spo2Sample>('spo2', (r) => ({ ...base(r.ts), spo2: r.value }));
    if (spo2.length) {
      result.raw.spo2 = spo2;
      result.spo2 = { samples: spo2.length, avg: scalarStats(spo2, 'spo2').avg };
    }
  }
  if (result.raw.temp.length === 0) {
    // Stored in °C; the sample shape carries tenths, so scale back on the way in.
    const temp = await load<TempSample>('temp', (r) => ({ ...base(r.ts), tempCx10: r.value * 10 }));
    if (temp.length) {
      result.raw.temp = temp;
      const stats = scalarStats(temp, 'tempCx10');
      result.temp = { samples: stats.samples, avgC: stats.avg !== null ? stats.avg / 10 : null };
    }
  }
  if (result.raw.stress.length === 0) {
    const stress = await load<StressSample>('stress', (r) => ({ ...base(r.ts), stress: r.value }));
    if (stress.length) {
      result.raw.stress = stress;
      result.stress = { samples: stress.length, avg: scalarStats(stress, 'stress').avg };
    }
  }

  return result;
}

export async function syncAllRingVitals(): Promise<RingVitalsSyncResult> {
  const result = emptyResult();
  const deviceId = await readSr16DeviceId();
  if (!deviceId) {
    result.errors.push('no SR16 paired');
    // No ring in reach is not the same as no data: everything previously
    // synced is still on the phone, so serve it rather than an empty screen.
    return hydrateFromHistory(result);
  }

  let ring: SadhanaRing | null = null;
  try {
    ring = await SadhanaRing.connect(deviceId, { keepAlive: false });
  } catch (e) {
    result.errors.push(`connect: ${(e as Error).message}`);
    return hydrateFromHistory(result);
  }

  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    try { return await fn(); }
    catch (e) { result.errors.push(`${label}: ${(e as Error).message}`); return null; }
  };

  const sleep = await safe('sleep', () => ring!.sync.sync<SleepSample>('sleep'));
  if (sleep) {
    result.raw.sleep = sleep.samples;
    const agg = await aggregateSleep(sleep.samples);
    result.sleep = { nightsUpserted: agg.nights, sampleCount: agg.total };
  }

  const hr = await safe('hr', () => ring!.sync.sync<HrSample>('hr'));
  if (hr) {
    result.raw.hr = hr.samples;
    result.hr = scalarStats(hr.samples, 'hr');
    await safe('hr:persist', () => persistScalar('hr', hr.samples, (s: HrSample) => s.hr));
  }

  const hrv = await safe('hrv', () => ring!.sync.sync<HrvSample>('hrv'));
  if (hrv) {
    result.raw.hrv = hrv.samples;
    result.hrv = { samples: hrv.samples.length, avg: scalarStats(hrv.samples, 'hrv').avg };
    await safe('hrv:persist', () => persistScalar('hrv', hrv.samples, (s: HrvSample) => s.hrv));
  }

  const spo2 = await safe('spo2', () => ring!.sync.sync<Spo2Sample>('spo2'));
  if (spo2) {
    result.raw.spo2 = spo2.samples;
    result.spo2 = { samples: spo2.samples.length, avg: scalarStats(spo2.samples, 'spo2').avg };
    await safe('spo2:persist', () => persistScalar('spo2', spo2.samples, (s: Spo2Sample) => s.spo2));
  }

  const temp = await safe('temp', () => ring!.sync.sync<TempSample>('temp'));
  if (temp) {
    result.raw.temp = temp.samples;
    const stats = scalarStats(temp.samples, 'tempCx10');
    result.temp = { samples: stats.samples, avgC: stats.avg !== null ? stats.avg / 10 : null };
    // Stored in °C, not the ring's tenths — consumers never re-scale.
    await safe('temp:persist', () => persistScalar('temp', temp.samples, (s: TempSample) => s.tempCx10 / 10));
  }

  const stress = await safe('stress', () => ring!.sync.sync<StressSample>('stress'));
  if (stress) {
    result.raw.stress = stress.samples;
    result.stress = { samples: stress.samples.length, avg: scalarStats(stress.samples, 'stress').avg };
    await safe('stress:persist', () => persistScalar('stress', stress.samples, (s: StressSample) => s.stress));
  }

  const steps = await safe('steps', () => ring!.sync.sync<StepSample>('steps'));
  if (steps) {
    result.raw.steps = steps.samples;
    result.steps = await upsertRingSteps(steps.samples);
  }

  // Japa/tasbih — for HealthScreen's "Daily Prayer Count" tile AND for the
  // JapaScreen background-tap reconcile flow (see japaHistorySync.ts).
  const japa = await safe('japa', () => ring!.sync.sync<TasbihSample>('japa'));
  if (japa) result.raw.japa = japa.samples;

  await ring.disconnect().catch(() => {});
  return hydrateFromHistory(result);
}
