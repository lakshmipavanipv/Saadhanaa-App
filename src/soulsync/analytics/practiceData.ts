/**
 * practiceData — fills the shared bucket rule with each practice's own source.
 *
 * `practiceSeries` decides what a bar covers. This decides what goes in it,
 * and it is separate because the four practices are measured by four
 * different instruments:
 *
 *   Walk         the ring's step records — hourly, so a day has a real shape.
 *   Japa         the bead log — every tap has an instant, so a day has one too.
 *   Yoga         logged sessions, plus any Soul Sync sitting of that practice.
 *   Meditation   the same.
 *
 * WHERE A DAY VIEW CANNOT BE DRAWN
 *
 * A yoga session logged as "30 minutes on Tuesday" carries no time of day.
 * Spreading it across Tuesday's hours would draw a shape nothing measured, so
 * it is left out of the day view and the box says how many sessions it could
 * not place. Sessions recorded through Soul Sync DO have a start time and are
 * placed normally, which is the honest half of the same day.
 */

import { getDB } from '../db/database';
import { japaTimeRepo, MAX_GAP_SEC } from '../db/japaTimeRepo';
import { exerciseRepo } from '../../services/exerciseRepo';
import { soulActivityRepo } from '../../services/soulActivityRepo';
import type { BodyActivity, SoulActivity } from '../../types';
import {
  bucketsFor, bucketEvents, bucketDays, makeSeries, windowBounds, isoOf,
  type RangeView, type Series,
} from './practiceSeries';

export interface PracticeSeriesResult {
  series: Series;
  /** Set when the source cannot fill these buckets. */
  unavailable?: string;
}

// ── Walk ───────────────────────────────────────────────────────────────────

/**
 * Steps, from the ring.
 *
 * Day view reads `activity_hour` — the ring's own hourly records, kept since
 * v12. Week and month read the daily totals, which is the same data already
 * folded and avoids pulling a month of hours to add them back up.
 */
export async function walkSeries(view: RangeView, selectedIso: string): Promise<PracticeSeriesResult> {
  const buckets = bucketsFor(view, selectedIso);
  const db = await getDB();

  if (view === 'day') {
    const rows = await db.getAllAsync<{ hour: number; steps: number }>(
      'SELECT hour, steps FROM activity_hour WHERE day = ? ORDER BY hour', [selectedIso]
    ).catch(() => []);
    if (!rows.length) {
      return {
        series: makeSeries(view, buckets, new Array(buckets.length).fill(0)),
        // Short, and says whose move it is. The daily total above is real and
        // already counted; only the shape of the day is missing.
        unavailable: 'The ring has not sent this day hour by hour yet.',
      };
    }
    const day0 = new Date(`${selectedIso}T00:00:00`).getTime();
    const events = rows.map((r) => ({ ts: day0 + r.hour * 3600_000, value: r.steps }));
    return { series: makeSeries(view, buckets, bucketEvents(buckets, events)) };
  }

  const { from, to } = windowBounds(buckets);
  const rows = await db.getAllAsync<{ activity_date: string; step_count: number }>(
    'SELECT activity_date, step_count FROM daily_activity WHERE activity_date BETWEEN ? AND ?',
    [isoOf(new Date(from)), isoOf(new Date(to - 1))]
  ).catch(() => []);
  const byDay = new Map(rows.map((r) => [r.activity_date, r.step_count ?? 0]));
  return { series: makeSeries(view, buckets, bucketDays(buckets, byDay, view)) };
}

// ── Japa ───────────────────────────────────────────────────────────────────

/**
 * Japa minutes.
 *
 * Day view walks the bead log and files each measured INTERVAL under the
 * bucket of the bead that began it — so a sitting that straddles 07:58 to
 * 08:10 contributes to both blocks in the right proportion, rather than
 * landing wholly in whichever one it started in.
 */
export async function japaSeries(view: RangeView, selectedIso: string): Promise<PracticeSeriesResult> {
  const buckets = bucketsFor(view, selectedIso);

  if (view === 'day') {
    const taps = await japaTimeRepo.taps(selectedIso).catch(() => []);
    const timed = taps.filter((t) => t.source !== 'sync');
    const events: { ts: number; value: number }[] = [];
    for (let i = 1; i < timed.length; i++) {
      const gap = timed[i].ts - timed[i - 1].ts;
      if (gap <= MAX_GAP_SEC * 1000) {
        events.push({ ts: timed[i - 1].ts, value: gap / 60_000 });
      }
    }
    const untimed = taps.length - timed.length;
    return {
      series: makeSeries(view, buckets, bucketEvents(buckets, events)),
      unavailable: events.length === 0 && untimed > 0
        ? `${untimed} beads came from the ring after the fact, so the hours they happened in are not known.`
        : undefined,
    };
  }

  const { from, to } = windowBounds(buckets);
  const rows = await japaTimeRepo
    .range(isoOf(new Date(from)), isoOf(new Date(to - 1)))
    .catch(() => []);
  const byDay = new Map(rows.map((r) => [r.japa_date, (r.active_ms ?? 0) / 60_000]));
  return { series: makeSeries(view, buckets, bucketDays(buckets, byDay, view)) };
}

// ── Yoga, Meditation, and the logged body activities ───────────────────────

interface TimedSession { ts: number; minutes: number }

/** Soul Sync sittings of a practice inside a window — these DO carry a time. */
async function soulsyncSittings(
  practice: 'japa' | 'yoga' | 'meditation', fromMs: number, toMs: number,
): Promise<TimedSession[]> {
  const db = await getDB();
  try {
    const rows = await db.getAllAsync<{ start_time: string; duration_min: number | null }>(
      `SELECT start_time, duration_min FROM session_spiritual
        WHERE practice = ? AND start_time >= ? AND start_time < ?`,
      [practice, new Date(fromMs).toISOString(), new Date(toMs).toISOString()]
    );
    return rows
      .map((r) => ({ ts: new Date(r.start_time).getTime(), minutes: r.duration_min ?? 0 }))
      .filter((r) => Number.isFinite(r.ts) && r.minutes > 0);
  } catch {
    return [];
  }
}

/**
 * Minutes for a practice logged by date.
 *
 * @param entries every logged entry, each with a `date` and `durationMin`.
 * @param practice the Soul Sync practice name, when one matches — its sittings
 *   carry a start time and so can be placed on a day view.
 */
async function datedMinutesSeries(
  view: RangeView, selectedIso: string,
  entries: { date: string; durationMin: number }[],
  practice: 'japa' | 'yoga' | 'meditation' | null,
): Promise<PracticeSeriesResult> {
  const buckets = bucketsFor(view, selectedIso);
  const { from, to } = windowBounds(buckets);

  if (view === 'day') {
    const sittings = practice ? await soulsyncSittings(practice, from, to) : [];
    const dayEntries = entries.filter((e) => e.date === selectedIso);
    const values = bucketEvents(
      buckets, sittings.map((s) => ({ ts: s.ts, value: s.minutes })),
    );

    if (sittings.length === 0 && dayEntries.length > 0) {
      return {
        series: makeSeries(view, buckets, values),
        unavailable:
          `${dayEntries.length} session${dayEntries.length === 1 ? '' : 's'} logged today, ` +
          `but without a start time — so they cannot be placed on an hourly chart. ` +
          `Sessions recorded with Soul Sync running do carry one.`,
      };
    }
    return { series: makeSeries(view, buckets, values) };
  }

  const byDay = new Map<string, number>();
  for (const e of entries) {
    const ts = new Date(`${e.date}T12:00:00`).getTime();
    if (ts < from || ts >= to) continue;
    byDay.set(e.date, (byDay.get(e.date) ?? 0) + e.durationMin);
  }
  return { series: makeSeries(view, buckets, bucketDays(buckets, byDay, view)) };
}

/** Minutes for a logged body activity — yoga, gym, cycling and the rest. */
export async function bodyActivitySeries(
  activity: BodyActivity, view: RangeView, selectedIso: string,
): Promise<PracticeSeriesResult> {
  const all = await exerciseRepo.list().catch(() => []);
  return datedMinutesSeries(
    view, selectedIso,
    all.filter((e) => e.activity === activity),
    activity === 'yoga' ? 'yoga' : null,
  );
}

/** Minutes for a logged soul activity — meditation, sandhya. */
export async function soulActivitySeries(
  activity: SoulActivity, view: RangeView, selectedIso: string,
): Promise<PracticeSeriesResult> {
  const all = await soulActivityRepo.list().catch(() => []);
  return datedMinutesSeries(
    view, selectedIso,
    all.filter((e) => e.activity === activity),
    activity === 'meditation' ? 'meditation' : activity === 'japa' ? 'japa' : null,
  );
}

// ── Range totals, so a tile and its chart cannot disagree ─────────────────

export interface WalkWindowTotals {
  steps: number;
  km: number;
  kcal: number;
  /** Hourly records with walking in them, across the window. */
  activeHours: number;
  /** Days in the window that recorded any steps. */
  activeDays: number;
}

/**
 * Walking totals for the window the Day / Week / Month control is showing.
 *
 * WHY THIS EXISTS
 *
 * The Exercise tiles read "today" from the ring while the chart beside them
 * followed the selected range. On Day they agreed by accident; on Week or
 * Month the chart said one thing and the tiles under it another, with nothing
 * to say why. A figure and the chart it sits beneath have to answer the same
 * question.
 *
 * Reads `daily_activity`, which is the same store the week and month bars come
 * from, so the tiles are literally the sum of the bars above them.
 */
export async function walkWindowTotals(
  view: RangeView, selectedIso: string,
): Promise<WalkWindowTotals> {
  const buckets = bucketsFor(view, selectedIso);
  const { from, to } = windowBounds(buckets);
  const db = await getDB();

  try {
    const r = await db.getFirstAsync<{
      steps: number | null; km: number | null; kcal: number | null;
      hours: number | null; days: number | null;
    }>(
      `SELECT SUM(step_count)   AS steps,
              SUM(distance_km)  AS km,
              SUM(calorie_kcal) AS kcal,
              SUM(active_hours) AS hours,
              COUNT(*)          AS days
         FROM daily_activity
        WHERE activity_date BETWEEN ? AND ? AND step_count > 0`,
      [isoOf(new Date(from)), isoOf(new Date(to - 1))]
    );
    return {
      steps: Math.round(r?.steps ?? 0),
      km: Math.round((r?.km ?? 0) * 100) / 100,
      kcal: Math.round(r?.kcal ?? 0),
      activeHours: Math.round(r?.hours ?? 0),
      activeDays: r?.days ?? 0,
    };
  } catch {
    return { steps: 0, km: 0, kcal: 0, activeHours: 0, activeDays: 0 };
  }
}

/** Logged minutes and session count for a body activity over the window. */
export async function bodyActivityWindowTotals(
  activity: BodyActivity, view: RangeView, selectedIso: string,
): Promise<{ minutes: number; sessions: number }> {
  const buckets = bucketsFor(view, selectedIso);
  const { from, to } = windowBounds(buckets);
  const fromIso = isoOf(new Date(from));
  const toIso = isoOf(new Date(to - 1));

  const all = await exerciseRepo.list().catch(() => []);
  const mine = all.filter(
    (e) => e.activity === activity && e.date >= fromIso && e.date <= toIso,
  );
  return {
    minutes: mine.reduce((a, e) => a + e.durationMin, 0),
    sessions: mine.length,
  };
}
