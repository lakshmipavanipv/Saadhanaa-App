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

/*
 * nightBucket() removed. It assigned a sample to a night by asking whether
 * its local hour was past noon, then formatted the date with toISOString(),
 * which is UTC — so nights split at midday and, east of UTC, were filed a day
 * early. Three copies of that rule existed (here, the sleep screen, the health
 * hub) and they disagreed with each other, which is how the hub came to show
 * about an hour of sleep while the sleep dashboard showed the real total.
 *
 * groupSleepSessions() below replaces all three: it uses the ring's own
 * session markers and dates a night by when it ended.
 */

/**
 * Group raw sleep stages into sessions, keyed by the local date the session
 * ENDED — the morning the user woke, whatever hour that was.
 *
 * Exported because the sleep screen and the health hub need the identical
 * grouping. Each used to carry its own copy of a "is the hour past noon" rule
 * and they disagreed the moment a night crossed midday.
 *
 * Boundaries come from the ring's own markers — sleepModel 17 is onset, 34 is
 * end, which is what RWfit keys on (s1.java:417-421) — with a gap longer than
 * SESSION_GAP_MIN as an implicit boundary for firmware that omits a marker.
 */
export function groupSleepSessions(samples: SleepSample[]): Map<string, SleepSample[]> {
  const SESSION_GAP_MIN = 90;
  const sorted = [...samples].sort((a, b) => a.ringTs - b.ringTs);
  const sessions: SleepSample[][] = [];
  let current: SleepSample[] = [];

  for (const sample of sorted) {
    const stage = sleepModelToStage(sample.sleepModel);
    const prev = current[current.length - 1];
    const gapMin = prev ? (sample.ringTs - prev.ringTs) / 60 : 0;

    if (stage === 'onset' || (prev && gapMin > SESSION_GAP_MIN)) {
      if (current.length) sessions.push(current);
      current = [];
    }
    current.push(sample);
    if (stage === 'end') {
      sessions.push(current);
      current = [];
    }
  }
  if (current.length) sessions.push(current);

  const nights = new Map<string, SleepSample[]>();
  for (const session of sessions) {
    const last = session[session.length - 1];
    const key = dayOf(last.timestamp.getTime());
    const existing = nights.get(key);
    if (existing) existing.push(...session);
    else nights.set(key, session);
  }
  return nights;
}

async function aggregateSleep(samples: SleepSample[]): Promise<{ nights: number; total: number }> {
  if (samples.length < 2) return { nights: 0, total: samples.length };

  const nights = groupSleepSessions(samples);

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
 * Fold the ring's step records into one row per local day.
 *
 * PURE, AND EXPORTED, SO IT CAN BE TESTED
 *
 * The step total is the figure this app has got wrong most often, and every
 * time it was the aggregation rather than the decode. Keeping it a pure
 * function of the samples means it can be fed real captured records and
 * checked against the ring's own display without a database, a ring, or a
 * screen — see scratchpad/steps for that test.
 *
 * TWO KINDS OF RECORD, NEVER ADDED TOGETHER
 *
 * The ring sends hourly buckets AND a running daily total stamped at the
 * moment of the sync. The daily total already contains every hourly bucket in
 * the same page, so adding both reports roughly double. That is exactly the
 * bug that had the app showing 8000 steps for a 2600-step day.
 *
 * So the hourly buckets are summed, and the running total is then taken as a
 * FLOOR rather than an addend: whichever is larger wins. The daily total
 * usually is, because it includes the part of the current hour that has no
 * bucket yet — but a stale one can be smaller, and then the hourly sum stands.
 *
 * Distance and calories come from the same records and follow the same rule.
 * They were previously decoded and discarded while the Exercise tab multiplied
 * steps by a generic stride length and a generic cost per step.
 */
export interface DayActivityTotals {
  steps: number;
  km: number;
  kcal: number;
  /** Hourly buckets in which the ring counted any walking at all. */
  hours: number;
}

export function foldStepSamples(
  samples: StepSample[],
  dayKey: (ms: number) => string = dayOf,
): Map<string, DayActivityTotals> {
  const byDay = new Map<string, DayActivityTotals>();
  const at = (d: string): DayActivityTotals => {
    let e = byDay.get(d);
    if (!e) { e = { steps: 0, km: 0, kcal: 0, hours: 0 }; byDay.set(d, e); }
    return e;
  };

  // Hourly buckets: summed.
  for (const s of samples) {
    if (s.isDailyTotal) continue;
    const e = at(dayKey(s.timestamp.getTime()));
    e.steps += s.steps;
    e.km += s.distanceKm;
    e.kcal += s.calorieKcal;
    // One bucket with any walking in it is one hour the body moved. A measured
    // count, replacing the `steps / 100` that used to stand for "minutes".
    if (s.steps > 0) e.hours += 1;
  }

  // Running daily totals: a floor, never an addend.
  for (const s of samples) {
    if (!s.isDailyTotal) continue;
    const e = at(dayKey(s.timestamp.getTime()));
    e.steps = Math.max(e.steps, s.steps);
    e.km = Math.max(e.km, s.distanceKm);
    e.kcal = Math.max(e.kcal, s.calorieKcal);
  }

  return byDay;
}

/**
 * The ring's hourly records, kept as hours rather than folded into a day.
 *
 * This is most of what the step channel actually says. A daily total answers
 * "how much"; the hours answer "when", which is what lets the Exercise box
 * draw a day the same way the Japa box draws one from its bead log.
 *
 * The running daily total is excluded — it is stamped at the moment of the
 * sync, not on an hour, so filing it under that hour would invent a burst of
 * walking that did not happen then.
 */
export function hourlyStepRows(
  samples: StepSample[],
  dayKey: (ms: number) => string = dayOf,
): { day: string; hour: number; steps: number; km: number; kcal: number }[] {
  const by = new Map<string, { day: string; hour: number; steps: number; km: number; kcal: number }>();
  for (const s of samples) {
    if (s.isDailyTotal) continue;
    const day = dayKey(s.timestamp.getTime());
    const hour = s.timestamp.getHours();
    const k = `${day}#${hour}`;
    const e = by.get(k) ?? { day, hour, steps: 0, km: 0, kcal: 0 };
    e.steps += s.steps;
    e.km += s.distanceKm;
    e.kcal += s.calorieKcal;
    by.set(k, e);
  }
  return [...by.values()];
}

/**
 * Upsert steps into `daily_activity` and `activity_hour`.
 *
 * EXPORTED because the Exercise tab reads the step channel itself, through
 * `getRingStepsToday()`, and was throwing the records away after showing the
 * total. That is why the day chart said "no hour-by-hour steps for this day
 * yet" while the same screen displayed 3,495 steps: the hours had been read
 * and discarded in the same breath. Both readers now land here.
 */
export async function upsertRingSteps(samples: StepSample[]): Promise<{ total: number; sampleCount: number }> {
  if (!samples.length) return { total: 0, sampleCount: 0 };
  const db = await getDB();
  // Local date, not UTC. toISOString() buckets by UTC, which put steps on a
  // different day than the vitals recorded at the same moment (vitalsRepo keys
  // on local `dayOf`). Near midnight the two stores disagreed.
  const byDay = foldStepSamples(samples);

  for (const [date, t] of byDay) {
    await db.runAsync(
      /*
       * Overwrite, rather than MAX.
       *
       * MAX was protection against a partial read lowering a good total. It
       * became the reason a wrong total was permanent: while the running daily
       * record was being added to the hourly ones, this table took the
       * inflated figure and then refused every corrected value that followed,
       * because the correct number is smaller. Steps only ever climbed.
       *
       * Overwriting is safe here because the steps channel returns the whole
       * day on every sync — the sweep read hours 00:00 to 08:00 in one page,
       * long after those hours had been ACKed — so each sync recomputes a
       * complete day rather than contributing a fragment of one.
       */
      `INSERT INTO daily_activity
         (activity_date, step_count, distance_km, calorie_kcal, active_hours)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(activity_date) DO UPDATE SET
         step_count   = excluded.step_count,
         distance_km  = excluded.distance_km,
         calorie_kcal = excluded.calorie_kcal,
         active_hours = excluded.active_hours`,
      [date, t.steps, Math.round(t.km * 100) / 100, Math.round(t.kcal), t.hours]
    );
  }
  // The hours, kept alongside the days. Overwritten rather than added to:
  // the steps channel returns the whole day on every sync, so a later read
  // corrects an earlier one.
  for (const h of hourlyStepRows(samples)) {
    await db.runAsync(
      `INSERT INTO activity_hour (day, hour, steps, km, kcal) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(day, hour) DO UPDATE SET
         steps = excluded.steps, km = excluded.km, kcal = excluded.kcal`,
      [h.day, h.hour, h.steps, Math.round(h.km * 1000) / 1000, Math.round(h.kcal)]
    );
  }

  const today = dayOf(Date.now());
  return { total: byDay.get(today)?.steps ?? 0, sampleCount: byDay.size };
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
     
    console.log(
      `[SLEEPDIAG] stored=${sleep.length}` +
      (sleep.length
        ? ` span=${sleep[0].timestamp.toLocaleString()} → ${sleep[sleep.length - 1].timestamp.toLocaleString()}`
        : '')
    );
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

/**
 * Everything already stored, with no BLE at all.
 *
 * Screens used to open by awaiting syncAllRingVitals(), which connects to the
 * ring, configures monitoring and pulls ten channels before anything could be
 * drawn — seconds of blank UI holding data the phone already had. Paint from
 * this first, then let the sync refresh in the background.
 */
export async function loadStoredVitals(): Promise<RingVitalsSyncResult> {
  return hydrateFromHistory(emptyResult());
}

/**
 * A sync already in flight. Callers that arrive while one is running join it
 * instead of starting a second.
 *
 * Seven screens call syncAllRingVitals() on mount, so navigating produced
 * overlapping runs — logcat showed every monitoring command and every channel
 * pull happening twice. That doubled the BLE work behind each screen open,
 * which is most of the delay before numbers appear.
 *
 * It is also a correctness problem, not just a slow one. Reads are
 * destructive: the ring drops a page once it is ACKed. Two syncs racing the
 * same channel can both pull and both ACK, so data gets acknowledged away
 * while only one run holds it — and if that run is the one whose result gets
 * discarded, the samples are gone from both the ring and the phone.
 */
let inFlight: Promise<RingVitalsSyncResult> | null = null;

export function syncAllRingVitals(opts: SyncOptions = {}): Promise<RingVitalsSyncResult> {
  if (inFlight) return inFlight;
  inFlight = runSync(opts).finally(() => { inFlight = null; });
  return inFlight;
}

async function runSync(opts: SyncOptions = {}): Promise<RingVitalsSyncResult> {
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

      console.log(`[ringVitalsSync] ${label}: ok samples=${n ?? 'n/a'} in ${Date.now() - startedAt}ms`);
      return out;
    } catch (e) {
      const msg = (e as Error).message;
      result.errors.push(`${label}: ${msg}`);

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
    // Every one of these channels is destructive on ACK, so each page is
    // stored before it is acknowledged. The value field is the metric's own
    // name on the sample, which is how persistScalar is called for them below.
    const onPage = (page: T[]) =>
      persistScalar(metric, page, (x: T) => (x as unknown as Record<string, number>)[metric]);

    const first = await safe(metric, () => ring!.sync.sync<T>(metric, { onPage }));
    if (first && first.samples.length > 0) return first;
    if (!measure) return first;

    const measured = await safe(`${metric}:measure`, async () => {
      await ring!.withLiveMetric(metric, () => new Promise<void>((r) => setTimeout(r, dwellMs)));
      return ring!.sync.sync<T>(metric, { onPage });
    });
    return measured ?? first;
  };

  /*
   * Sleep is read page by page and each page is written to storage before it
   * is acknowledged, because acknowledging is what makes the ring forget it.
   *
   * The previous order stored everything only after the whole channel had
   * been drained and ACKed. That window is small but it is not zero, and it
   * is exactly where a night goes missing: the ring has dropped the pages, the
   * app has not yet written them, and nothing anywhere can reconstruct them.
   */
  const sleep = await safe('sleep', () => ring!.sync.sync<SleepSample>('sleep', {
    onPage: (page) => persistScalar('sleep', page, (x: SleepSample) => x.sleepModel),
  }));
  if (sleep) {
    /*
     * Sleep diagnostics.
     *
     * A session the user knows happened is not reaching the app, and the
     * reads that would carry it are destructive — the ring drops a page once
     * it is ACKed — so the evidence is gone by the time anyone notices. This
     * records what the ring actually handed over, before anything is derived
     * from it: the raw first page, how many stage records decoded, and the
     * span they cover. Without it every explanation is a guess.
     *   adb logcat -s ReactNativeJS:V | grep SLEEPDIAG
     */
    const span = sleep.samples.length
      ? `${sleep.samples[0].timestamp.toLocaleString()} → ${sleep.samples[sleep.samples.length - 1].timestamp.toLocaleString()}`
      : 'none';
    const models = [...new Set(sleep.samples.map((x) => x.sleepModel))].sort((a, b) => a - b);
     
    console.log(
      `[SLEEPDIAG] decoded=${sleep.samples.length} span=${span} ` +
      `models=[${models.join(',')}] rawFirstPage=${[...sleep.rawPayload.slice(0, 32)].map((b) => b.toString(16).padStart(2, '0')).join('')}`
    );
    result.raw.sleep = sleep.samples;
    // Already stored page by page above, before each ACK — see the onPage
    // hook. aggregateSleep() discards any night under two samples or under
    // thirty minutes, so the raw stages must survive it regardless of what it
    // decides to keep.
    const agg = await aggregateSleep(sleep.samples);
    result.sleep = { nightsUpserted: agg.nights, sampleCount: agg.total };
  }

  const hr = await syncMeasured<HrSample>('hr', 8_000);
  if (hr) {
    result.raw.hr = hr.samples;
    result.hr = scalarStats(hr.samples, 'hr');
    /*
     * A second write of the same samples, kept on purpose.
     *
     * Each page is already stored by the onPage hook before it is ACKed. This
     * repeats it for the whole set, which is NOT duplication: vitalsRepo
     * upserts on (metric, ts), so re-writing a row leaves the count unmoved.
     * It costs one cheap statement and it covers any path that reaches here
     * without having gone through the hook.
     */
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
