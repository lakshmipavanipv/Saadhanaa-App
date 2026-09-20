/**
 * practiceSeries — one bucketing rule for every practice box.
 *
 * WHY THIS IS SHARED
 *
 * Walk, Japa, Yoga and Meditation all answer the same question — "how much,
 * over what window" — and each had grown its own chart with its own idea of
 * what a bar meant. A week of walking was seven daily bars; a week of japa was
 * seven daily bars drawn differently; yoga had no chart at all. Reading one
 * taught you nothing about the next.
 *
 * The bucket boundaries are decided here, once, so a bar in any of the four
 * boxes covers exactly the same stretch of clock.
 *
 * THE RULE
 *
 *   Day    12 bars of two hours, midnight to midnight. Fine enough to show
 *          when a practice actually happened, coarse enough that a single
 *          sitting is a visible block rather than a spike.
 *   Week   7 bars, one per day, ending on the selected day.
 *   Month  5 bars, one per week, ending on the selected day.
 *
 * WHY MONTH IS FIVE WEEKS AND NOT THIRTY DAYS
 *
 * Thirty days does not divide into weeks. Bucketing it anyway leaves a
 * two-day bar at the left end, which is shorter for the arithmetic rather
 * than for the practice, and reads as a bad fortnight that never happened.
 * Five whole weeks is 35 days — a slightly wider window, but every bar covers
 * the same number of days, so their heights can honestly be compared. The
 * total line says which window it used.
 */

export type RangeView = 'day' | 'week' | 'month';

export interface Bucket {
  key: string;
  /** Inclusive start, exclusive end, in epoch ms. */
  from: number;
  to: number;
  /** Short label — only some are rendered on the axis. */
  label: string;
}

export interface Series {
  buckets: Bucket[];
  values: number[];
  /** Index of the bucket containing now, or -1 when the window is historical. */
  currentIndex: number;
  /**
   * One label per bar, as the original walk-box sparkline drew them. A
   * separate axis strip under a chart of twelve bars has to guess which bar
   * each label belongs to; a label under its own bar does not.
   */
  axis: string[];
  /** Plain-words description of the window, for the total line. */
  windowLabel: string;
}

const pad = (n: number): string => String(n).padStart(2, '0');

/**
 * An hour of the day as a short clock label: 2 -> "2a", 14 -> "2p", 24 -> "12a".
 *
 * 24 is midnight at the END of the day, so it reads "12a" like midnight at the
 * start would. That is correct rather than confusing: the last bar covers
 * 22:00 to midnight, and midnight is what it ends on.
 */
const hourLabel = (h24: number): string => {
  const h = h24 % 24;
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${suffix}`;
};

export const isoOf = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Local midnight at the start of the given ISO day. */
const startOfDay = (isoDay: string): Date => {
  const [y, m, d] = isoDay.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
};

const DAY_MS = 86_400_000;

/**
 * The bucket boundaries for a view and a selected day.
 *
 * Every window ENDS on the selected day, so switching from week to month
 * extends backwards rather than sliding, and the right-hand bar stays the same
 * practice it was before the switch.
 */
export function bucketsFor(view: RangeView, selectedIso: string): Bucket[] {
  const day0 = startOfDay(selectedIso);

  if (view === 'day') {
    // Twelve two-hour blocks, midnight to midnight.
    return Array.from({ length: 12 }, (_, i) => {
      const from = day0.getTime() + i * 2 * 3600_000;
      return {
        key: `h${i * 2}`,
        from,
        to: from + 2 * 3600_000,
        /*
         * Labelled by the hour the block ENDS, as a CLOCK TIME: 2a, 4a … 12a.
         *
         * Bare numbers running 2…24 are a duration, not a time of day — "18"
         * asks the reader to convert. The suffix says at a glance which half
         * of the day a bar sits in, which is the whole reason for looking at
         * an hourly chart.
         *
         * Short forms because twelve labels share one row: "10a" fits under a
         * bar, "10:00 am" does not.
         */
        label: hourLabel((i + 1) * 2),
      };
    });
  }

  if (view === 'week') {
    return Array.from({ length: 7 }, (_, i) => {
      const from = day0.getTime() - (6 - i) * DAY_MS;
      const d = new Date(from);
      return {
        key: isoOf(d),
        from,
        to: from + DAY_MS,
        label: d.toLocaleDateString(undefined, { weekday: 'narrow' }),
      };
    });
  }

  // Month: five whole weeks, the last ending on the selected day.
  return Array.from({ length: 5 }, (_, i) => {
    const to = day0.getTime() + DAY_MS - (4 - i) * 7 * DAY_MS;
    const from = to - 7 * DAY_MS;
    const d = new Date(from);
    return {
      key: isoOf(d),
      from,
      to,
      label: `${d.getDate()}/${d.getMonth() + 1}`,
    };
  });
}

/**
 * Labels under the bars.
 *
 * Week and month get one each — seven day initials or five dates both fit.
 *
 * The DAY view does not. Twelve two-hour bars with "12PM" under each is a wall
 * of text at 9pt, and the labels crowd into each other. So the bars stay
 * two-hourly — that is the resolution the practice is drawn at — while the
 * axis is marked every FOUR hours and the bars between are left unlabelled.
 * Six marks across the day is what a clock face does, and for the same reason.
 */
const axisFor = (view: RangeView, buckets: Bucket[]): string[] =>
  view === 'day'
    ? buckets.map((b, i) => (i % 2 === 1 ? b.label : ''))
    : buckets.map((b) => b.label);

const windowLabelFor = (view: RangeView): string =>
  view === 'day' ? 'Today' : view === 'week' ? 'Last 7 days' : 'Last 5 weeks';

/** Assemble a Series from pre-computed bucket values. */
export const makeSeries = (
  view: RangeView, buckets: Bucket[], values: number[],
): Series => {
  const now = Date.now();
  return {
    buckets,
    values,
    currentIndex: buckets.findIndex((b) => now >= b.from && now < b.to),
    axis: axisFor(view, buckets),
    windowLabel: windowLabelFor(view),
  };
};

/**
 * Drop timestamped events into buckets.
 *
 * Used where the source knows WHEN something happened: japa beads, the ring's
 * hourly step records, a logged session with a start time.
 */
export function bucketEvents(
  buckets: Bucket[],
  events: { ts: number; value: number }[],
): number[] {
  const out = new Array(buckets.length).fill(0);
  for (const e of events) {
    // Linear scan is fine: at most twelve buckets, and the alternative is a
    // binary search that has to be right about half-open intervals.
    for (let i = 0; i < buckets.length; i++) {
      if (e.ts >= buckets[i].from && e.ts < buckets[i].to) { out[i] += e.value; break; }
    }
  }
  return out;
}

/**
 * Drop per-day totals into buckets.
 *
 * Used where the source only knows WHICH DAY: a stored daily step count, a
 * logged yoga session with a date and no time. Such a source cannot fill a
 * two-hour bucket, so on the day view this returns zeros and the caller says
 * so rather than spreading the day's total across the hours — which would be
 * inventing a shape the data does not have.
 */
export function bucketDays(
  buckets: Bucket[],
  byDay: Map<string, number>,
  view: RangeView,
): number[] {
  if (view === 'day') return new Array(buckets.length).fill(0);
  const out = new Array(buckets.length).fill(0);
  for (const [iso, v] of byDay) {
    const ts = startOfDay(iso).getTime();
    for (let i = 0; i < buckets.length; i++) {
      if (ts >= buckets[i].from && ts < buckets[i].to) { out[i] += v; break; }
    }
  }
  return out;
}

/** First and last instant the window covers — for querying a source once. */
export const windowBounds = (buckets: Bucket[]): { from: number; to: number } => ({
  from: buckets[0].from,
  to: buckets[buckets.length - 1].to,
});
