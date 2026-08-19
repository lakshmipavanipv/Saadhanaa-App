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
  BpSample, SugarSample,
  StepSample, TasbihSample, TsSample,
} from './sync';
import { sleepRepo } from '../db/sleepRepo';
import { getDB } from '../db/database';
import { vitalsRepo, dayOf, type VitalSample } from '../db/vitalsRepo';
import { vitalsPrefs } from '../settings/vitalsPrefs';

export interface RingVitalsSyncResult {
  sleep: { nightsUpserted: number; sampleCount: number };
  hr:    { samples: number; avg: number | null; min: number | null; max: number | null };
  hrv:   { samples: number; avg: number | null };
  spo2:  { samples: number; avg: number | null };
  temp:  { samples: number; avgC: number | null };
  stress:{ samples: number; avg: number | null };
  bp:    { samples: number; avgSystolic: number | null; avgDiastolic: number | null };
  sugar: { samples: number; avg: number | null };
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
    bp:     BpSample[];
    sugar:  SugarSample[];
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
  bp:    { samples: 0, avgSystolic: null, avgDiastolic: null },
  sugar: { samples: 0, avg: null },
  steps: { total: 0, sampleCount: 0 },
  errors: [],
  raw: {
    sleep: [], hr: [], hrv: [], spo2: [], temp: [], stress: [],
    bp: [], sugar: [], steps: [], japa: [],
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
  // Local date, not UTC. toISOString() buckets by UTC, which put steps on a
  // different day than the vitals recorded at the same moment (vitalsRepo
  // keys on local `dayOf`). Near midnight the two stores disagreed.
  const byDay = new Map<string, number>();
  for (const s of samples) {
    const d = dayOf(s.timestamp.getTime());
    byDay.set(d, (byDay.get(d) ?? 0) + s.steps);
  }
  for (const [date, steps] of byDay) {
    await db.runAsync(
      `INSERT INTO daily_activity (activity_date, step_count) VALUES (?, ?)
       ON CONFLICT(activity_date) DO UPDATE SET step_count = MAX(step_count, excluded.step_count)`,
      [date, steps]
    );
  }
  const today = dayOf(Date.now());
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
  if (samples.length === 0) { logPersist(metric, 0, 0); return; }
  const rows: VitalSample[] = samples.map((s) => ({
    metric,
    ts: s.timestamp.getTime(),
    value: read(s),
    source: 'sync' as const,
  }));
  const written = await vitalsRepo.insertMany(rows);
  logPersist(metric, rows.length, written);
  logSamples(metric, rows);
}

/**
 * Print the actual decoded values, not just how many there were.
 *
 * A row count proves a record was parsed; it does not prove the record was
 * parsed *correctly*. Three things have to be right and each fails silently:
 *
 *   value      — record stride wrong => we read the wrong byte and store a
 *                plausible-looking number that is not the reading
 *   timestamp  — byte order wrong => samples land decades away and never
 *                appear on a chart, while the row count still looks healthy
 *   units      — e.g. tenths-of-degree stored as degrees
 *
 * So log value + resolved date together: the value is checkable against the
 * ring's own display, and the date should be today.
 */
function logSamples(metric: string, rows: VitalSample[]): void {
  for (const r of rows.slice(0, 5)) {
    // eslint-disable-next-line no-console
    console.log(
      `[ringVitalsSync] ${metric} sample: value=${r.value}` +
      `${r.value2 != null ? `/${r.value2}` : ''} at ${new Date(r.ts).toISOString()}`
    );
  }
}

/**
 * Blood pressure needs both numbers, so it can't go through persistScalar:
 * systolic lands in `value` and diastolic in `value2` (the column the schema
 * reserves for exactly this).
 */
async function persistBp(samples: BpSample[]): Promise<void> {
  if (samples.length === 0) return;
  const rows: VitalSample[] = samples.map((s) => ({
    metric: 'bp' as const,
    ts: s.timestamp.getTime(),
    value: s.systolic,
    value2: s.diastolic,
    source: 'sync' as const,
  }));
  const written = await vitalsRepo.insertMany(rows);
  logPersist('bp', rows.length, written);
  logSamples('bp', rows);
}

/**
 * One line per channel per sync, in release builds too. `decoded` is what the
 * ring sent; `written` is what survived insertMany's plausibility filter — a
 * gap between them means frames are being decoded wrong, which is otherwise
 * invisible because the screens just show fewer points.
 */
function logPersist(metric: string, decoded: number, written: number): void {
  // eslint-disable-next-line no-console
  console.log(`[ringVitalsSync] ${metric}: decoded=${decoded} persisted=${written}`);
}

/**
 * How much stored history the detail screens chart when the ring is away.
 * 30 days, matching what MetricDetailScreen reads directly — a 7-day window
 * left the weekly and monthly views half-empty for no reason.
 */
const HISTORY_WINDOW_DAYS = 30;

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
  if (result.raw.sleep.length === 0) {
    const sleep = await load<SleepSample>('sleep', (r) => ({
      ...base(r.ts),
      sleepModel: Math.round(r.value),
    }));
    if (sleep.length) {
      result.raw.sleep = sleep;
      // Re-derive the summary from stored stages so the sleep screens show a
      // night even when the ring has nothing left to hand over.
      const agg = await aggregateSleep(sleep);
      result.sleep = { nightsUpserted: agg.nights, sampleCount: agg.total };
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

export interface SyncOptions {
  /**
   * Ask the ring to take fresh readings for any channel it has nothing
   * stored for. OFF by default, and deliberately so.
   *
   * Measuring is a real physical action: the ring wakes its sensors and runs
   * for 8-12 s per channel. Doing that automatically on screen mount made the
   * ring light up and act on its own while the user was just browsing, and
   * seven screens call this function — so it could fire repeatedly.
   *
   * On this hardware it also returned nothing: hr/hrv/spo2/stress each
   * measured for their full dwell and still reported samples=0, so the
   * ~41 s cost bought no data at all. Until that is understood, this belongs
   * behind an explicit user action ("measure now"), not a screen mount.
   */
  measure?: boolean;
}

export async function syncAllRingVitals(opts: SyncOptions = {}): Promise<RingVitalsSyncResult> {
  const { measure = false } = opts;
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
    ring = await SadhanaRing.connect(deviceId);
  } catch (e) {
    result.errors.push(`connect: ${(e as Error).message}`);
    return hydrateFromHistory(result);
  }

  // Make sure the ring is actually recording before we ask it for history.
  // This is idempotent and cheap, and it is the difference between the
  // history channels having something in them and being permanently empty —
  // the ring only samples on a timer once it has been told to.
  try {
    const prefs = await vitalsPrefs.get();

    // Sleep-time vitals only exist if the ring is recording while you sleep.
    // The recording window is user-editable, and a daytime window (RWfit
    // ships 09:00-18:00) would silently exclude every overnight reading —
    // no sleeping HR, no nocturnal HRV, which are the readings that make a
    // sleep report worth anything. When sleep tracking is on, widen the
    // window to the whole day so the night is always covered.
    const coverNight = prefs.sleepModeEnabled;
    await ring.monitoring.setAll({
      enabled: prefs.ringMonitorEnabled,
      startHour: coverNight ? 0 : prefs.ringMonitorStartHour,
      startMin: 0,
      endHour: coverNight ? 23 : prefs.ringMonitorEndHour,
      endMin: 59,
      intervalMin: prefs.ringMonitorIntervalMin,
    });
  } catch (e) {
    result.errors.push(`monitoring: ${(e as Error).message}`);
  }

  // Log every channel's outcome, including the empty and failed ones. A
  // channel that returns nothing is indistinguishable from one that never ran
  // unless we say so explicitly — which is exactly what made a missing HRV
  // impossible to diagnose from logs alone.
  const safe = async <T>(label: string, fn: () => Promise<T>): Promise<T | null> => {
    const startedAt = Date.now();
    try {
      const out = await fn();
      const n = (out as unknown as { samples?: unknown[] })?.samples?.length;
      // eslint-disable-next-line no-console
      console.log(`[ringVitalsSync] ${label}: ok samples=${n ?? 'n/a'} in ${Date.now() - startedAt}ms`);
      return out;
    } catch (e) {
      const msg = (e as Error).message;
      result.errors.push(`${label}: ${msg}`);
      // eslint-disable-next-line no-console
      console.log(`[ringVitalsSync] ${label}: FAILED after ${Date.now() - startedAt}ms — ${msg}`);
      return null;
    }
  };

  /**
   * Pull a channel, and if the ring has nothing stored, tell it to take a
   * reading first and pull again.
   *
   * The ring does not continuously log HR/HRV/SpO2/stress. It measures when
   * asked, writes the result into its own history buffer, and the app reads
   * it back from there — which is the exact sequence RWfit uses (capture at
   * t=2533s):
   *
   *     TX {6,9,0} 09 05 01     start live SpO2
   *     TX {6,9,0} 09 05 00     stop, 2.8 s later
   *     TX {5,9,16}             now pull the history channel
   *
   * Reading without ever measuring is why HRV came back blank while the ring
   * itself displayed a value: that reading was taken for the ring's own
   * screen, and nothing was ever written on our behalf.
   *
   * Dwell times are the observed ones, rounded up: HR 7.1 s, HRV 9.4 s,
   * SpO2 2.8 s in the capture. We only pay them when the channel is empty,
   * so a ring with stored history syncs at the old speed.
   */
  const syncMeasured = async <T extends TsSample>(
    metric: 'hr' | 'hrv' | 'spo2' | 'stress',
    dwellMs: number,
  ): Promise<{ samples: T[] } | null> => {
    const first = await safe(metric, () => ring!.sync.sync<T>(metric));
    if (first && first.samples.length > 0) return first;
    if (!measure) return first;

    const measured = await safe(`${metric}:measure`, async () => {
      await ring!.withLiveMetric(metric, () => new Promise<void>((r) => setTimeout(r, dwellMs)));
      return ring!.sync.sync<T>(metric);
    });
    return measured ?? first;
  };

  const sleep = await safe('sleep', () => ring!.sync.sync<SleepSample>('sleep'));
  if (sleep) {
    result.raw.sleep = sleep.samples;
    // Store the raw stages BEFORE aggregating. The ACK we already sent means
    // the ring has dropped these; aggregateSleep() then throws away any night
    // with under two samples or under 30 minutes total, so a short or partial
    // night used to vanish permanently between those two steps.
    await safe('sleep:persist', () =>
      persistScalar('sleep', sleep.samples, (s: SleepSample) => s.sleepModel));
    const agg = await aggregateSleep(sleep.samples);
    result.sleep = { nightsUpserted: agg.nights, sampleCount: agg.total };
  }

  const hr = await syncMeasured<HrSample>('hr', 8_000);
  if (hr) {
    result.raw.hr = hr.samples;
    result.hr = scalarStats(hr.samples, 'hr');
    await safe('hr:persist', () => persistScalar('hr', hr.samples, (s: HrSample) => s.hr));
  }

  const hrv = await syncMeasured<HrvSample>('hrv', 12_000);
  if (hrv) {
    result.raw.hrv = hrv.samples;
    result.hrv = { samples: hrv.samples.length, avg: scalarStats(hrv.samples, 'hrv').avg };
    await safe('hrv:persist', () => persistScalar('hrv', hrv.samples, (s: HrvSample) => s.hrv));
  }

  const spo2 = await syncMeasured<Spo2Sample>('spo2', 6_000);
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

  const stress = await syncMeasured<StressSample>('stress', 10_000);
  if (stress) {
    result.raw.stress = stress.samples;
    result.stress = { samples: stress.samples.length, avg: scalarStats(stress.samples, 'stress').avg };
    await safe('stress:persist', () => persistScalar('stress', stress.samples, (s: StressSample) => s.stress));
  }

  const bp = await safe('bp', () => ring!.sync.sync<BpSample>('bp'));
  if (bp) {
    result.raw.bp = bp.samples;
    result.bp = {
      samples: bp.samples.length,
      avgSystolic: scalarStats(bp.samples, 'systolic').avg,
      avgDiastolic: scalarStats(bp.samples, 'diastolic').avg,
    };
    await safe('bp:persist', () => persistBp(bp.samples));
  }

  const sugar = await safe('sugar', () => ring!.sync.sync<SugarSample>('sugar'));
  if (sugar) {
    result.raw.sugar = sugar.samples;
    result.sugar = { samples: sugar.samples.length, avg: scalarStats(sugar.samples, 'sugar').avg };
    await safe('sugar:persist', () => persistScalar('sugar', sugar.samples, (s: SugarSample) => s.sugar));
  }

  // Two steps channels. {5,2,16} is the generic one; {5,26,16} is the Jieli
  // platform's own ("步数杰里2" in the SDK) and on this hardware it is the one
  // that actually carries data — 24 of 36 replies in the RWfit capture, versus
  // 3 of 15 for the generic channel. Pull both and merge; upsertRingSteps
  // keys on the day and keeps the larger total, so overlap is harmless.
  const steps = await safe('steps', () => ring!.sync.sync<StepSample>('steps'));
  const steps2 = await safe('steps2', () => ring!.sync.sync<StepSample>('steps2'));
  const allSteps = [...(steps?.samples ?? []), ...(steps2?.samples ?? [])];
  if (allSteps.length || steps || steps2) {
    result.raw.steps = allSteps;
    result.steps = await upsertRingSteps(allSteps);
  }

  // Japa/tasbih — for HealthScreen's "Daily Prayer Count" tile AND for the
  // JapaScreen background-tap reconcile flow (see japaHistorySync.ts).
  const japa = await safe('japa', () => ring!.sync.sync<TasbihSample>('japa'));
  if (japa) result.raw.japa = japa.samples;

  await ring.disconnect().catch(() => {});
  return hydrateFromHistory(result);
}
