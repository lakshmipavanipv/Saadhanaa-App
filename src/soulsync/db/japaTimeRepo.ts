/**
 * japaTimeRepo — japa time measured from the beads themselves.
 *
 * THE PROBLEM THIS SOLVES
 *
 * Japa time used to exist only for an explicit SoulSync session: press Start,
 * sit, press Stop. Nobody does that in practice — they pick up the ring and
 * count. So the beads were recorded, the practice happened, and the time read
 * blank, which looks like the app losing the session rather than never having
 * been asked to time it.
 *
 * WHAT IS MEASURED
 *
 * Every bead is an event with a real instant attached, whether it arrived from
 * the ring's counter or from a tap on the screen. The time between consecutive
 * beads is time spent chanting. Nothing is assumed about pace — this is the
 * opposite of the old `japas * 6`, which was the bead count wearing a clock's
 * clothes and could never disagree with the number printed beside it.
 *
 * HOW A GAP IS TREATED
 *
 * Summing every interval would make one bead before breakfast and one after
 * lunch into four hours of japa. So an interval longer than MAX_GAP_SEC is a
 * break and contributes nothing:
 *
 *     active_sec = SUM of (t[i] - t[i-1]) for every pair whose gap is at
 *                  most MAX_GAP_SEC
 *
 * which is identical to grouping the beads into sittings and adding up each
 * sitting's span, but needs no grouping pass and updates in O(1) per bead.
 *
 * WHY TWO MINUTES
 *
 * Japa runs at roughly 2-5 seconds a bead, and a practitioner pauses: to
 * breathe, to re-seat the mala, to finish a verse. Two minutes covers every
 * ordinary pause while still being far shorter than any real break. It errs in
 * the direction that under-counts: a pause longer than this is dropped
 * entirely rather than half-credited.
 *
 * ONE BEAD IS ZERO SECONDS
 *
 * A sitting of a single bead has no interval and so contributes nothing. That
 * is the honest answer — a lone tap carries no evidence of how long it took —
 * and it is why `tap_count` is kept alongside the seconds, so the UI can tell
 * "no japa" apart from "japa too brief to time".
 *
 * BACKFILLED TAPS
 *
 * Beads the ring counted while the phone was away arrive in a burst when it
 * reconnects, all stamped with the moment of the sync rather than when the
 * finger actually moved. They are stored with source 'sync' so the count stays
 * right, and excluded from the interval arithmetic, because those instants are
 * not when anything happened. Their duration is genuinely unknown: the ring
 * keeps only hourly snapshots, and an hour is far too coarse to time a sitting.
 */

import { getDB } from './database';

/** Longest pause still counted as part of the same sitting. */
export const MAX_GAP_SEC = 120;

export type JapaTapSource = 'ring' | 'app' | 'sync';

export interface JapaDayRow {
  japa_date: string;
  /**
   * Measured seconds of japa, rounded once from `active_ms`. Never includes
   * breaks.
   *
   * Derived at read, NOT accumulated. Rounding each bead's gap to whole
   * seconds as it arrived lost every interval under half a second, which at a
   * fast counting pace is all of them: twenty-one beads inside nine seconds
   * stored six. The error only ever ran one way, and it grew with the number
   * of beads.
   */
  active_sec: number;
  /** The exact accumulated interval, in the units the gaps arrive in. */
  active_ms: number;
  /** Beads counted that day, backfilled ones included. */
  tap_count: number;
  /** Separate sittings — a run of beads with no break longer than MAX_GAP_SEC. */
  stretches: number;
  first_tap_ts: number | null;
  last_tap_ts: number | null;
}

/** Local YYYY-MM-DD for an instant. Matches the app's `todayStr()`. */
const localDay = (ts: number): string => {
  const d = new Date(ts);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const EMPTY = (day: string): JapaDayRow => ({
  japa_date: day, active_sec: 0, active_ms: 0, tap_count: 0, stretches: 0,
  first_tap_ts: null, last_tap_ts: null,
});

/** Seconds are computed once, from the exact milliseconds. */
const withSeconds = (r: JapaDayRow | undefined | null): JapaDayRow | null =>
  r ? { ...r, active_sec: Math.round((r.active_ms ?? 0) / 1000) } : null;

export const japaTimeRepo = {
  /**
   * Record one bead and fold it into the day's total.
   *
   * Safe to call on every tap: the update is O(1) and never reads the day's
   * history.
   *
   * @param source Where the bead came from. 'sync' is excluded from the
   *   interval arithmetic — see the file header.
   * @param ts Instant of the tap. Defaults to now; passed explicitly only by
   *   tests and by any future path that knows the real time of an old bead.
   */
  async recordTap(source: JapaTapSource, ts: number = Date.now()): Promise<JapaDayRow> {
    const db = await getDB();
    const day = localDay(ts);

    await db.runAsync(
      'INSERT INTO japa_tap (ts, day, source) VALUES (?, ?, ?)',
      [ts, day, source]
    );

    // The previous *timed* bead of the same day. Restricted to ts < this one
    // so a tap arriving out of order can never produce a negative interval.
    const prev = source === 'sync' ? null : await db.getFirstAsync<{ ts: number | null }>(
      `SELECT MAX(ts) AS ts FROM japa_tap
        WHERE day = ? AND source <> 'sync' AND ts < ?`,
      [day, ts]
    );

    const gapMs = prev?.ts == null ? null : ts - prev.ts;
    // A new sitting starts when there is no earlier bead today, or the pause
    // was long enough to be a break.
    const continues = gapMs != null && gapMs <= MAX_GAP_SEC * 1000;
    // Exact, not rounded. See JapaDayRow.active_sec for what rounding here
    // used to cost.
    const addMs = continues ? (gapMs as number) : 0;
    const addStretch = source === 'sync' ? 0 : continues ? 0 : 1;

    await db.runAsync(
      `INSERT INTO japa_day
            (japa_date, active_ms, active_sec, tap_count, stretches, first_tap_ts, last_tap_ts)
            VALUES (?, ?, 0, 1, ?, ?, ?)
       ON CONFLICT(japa_date) DO UPDATE SET
            active_ms    = active_ms + excluded.active_ms,
            active_sec   = CAST((active_ms + excluded.active_ms) / 1000.0 + 0.5 AS INTEGER),
            tap_count    = tap_count + 1,
            stretches    = stretches + excluded.stretches,
            first_tap_ts = MIN(first_tap_ts, excluded.first_tap_ts),
            last_tap_ts  = MAX(last_tap_ts, excluded.last_tap_ts)`,
      [day, addMs, addStretch, ts, ts]
    );

    return (await japaTimeRepo.day(day)) ?? EMPTY(day);
  },

  /** The stored total for one local day, or null if no bead was ever counted. */
  async day(isoDay: string): Promise<JapaDayRow | null> {
    const db = await getDB();
    const row = await db.getFirstAsync<JapaDayRow>(
      'SELECT * FROM japa_day WHERE japa_date = ?', [isoDay]
    );
    return withSeconds(row);
  },

  /** Stored totals for a date range, oldest first. Used by the history tab. */
  async range(fromIso: string, toIso: string): Promise<JapaDayRow[]> {
    const db = await getDB();
    const rows = await db.getAllAsync<JapaDayRow>(
      'SELECT * FROM japa_day WHERE japa_date BETWEEN ? AND ? ORDER BY japa_date',
      [fromIso, toIso]
    );
    return rows.map((r) => withSeconds(r) as JapaDayRow);
  },

  /**
   * Everything ever counted.
   *
   * Reads the stored daily rows rather than the raw beads: a year of japa is
   * a few hundred rows one way and a few hundred thousand the other, for the
   * same answer.
   */
  async allTime(): Promise<{ seconds: number; taps: number; days: number }> {
    const db = await getDB();
    const r = await db.getFirstAsync<{ ms: number | null; taps: number | null; days: number }>(
      'SELECT SUM(active_ms) AS ms, SUM(tap_count) AS taps, COUNT(*) AS days FROM japa_day'
    );
    // Summed in milliseconds and rounded once, so a lifetime total cannot
    // drift away from the days it is made of.
    return { seconds: Math.round((r?.ms ?? 0) / 1000), taps: r?.taps ?? 0, days: r?.days ?? 0 };
  },

  /** Every bead of a day, oldest first. The evidence behind the total. */
  async taps(isoDay: string): Promise<{ ts: number; source: JapaTapSource }[]> {
    const db = await getDB();
    return db.getAllAsync<{ ts: number; source: JapaTapSource }>(
      'SELECT ts, source FROM japa_tap WHERE day = ? ORDER BY ts', [isoDay]
    );
  },

  /**
   * Recompute a day's total from its raw beads.
   *
   * The incremental path assumes beads arrive in time order, which is true of
   * live tapping. This is the escape hatch for when that assumption breaks — a
   * clock change, an import, a change to MAX_GAP_SEC — and it is what makes
   * keeping the raw rows worthwhile: the daily figure is never a number nobody
   * can re-derive.
   */
  async rebuildDay(isoDay: string): Promise<JapaDayRow> {
    const db = await getDB();
    const rows = await japaTimeRepo.taps(isoDay);
    if (!rows.length) {
      await db.runAsync('DELETE FROM japa_day WHERE japa_date = ?', [isoDay]);
      return EMPTY(isoDay);
    }

    const timed = rows.filter((r) => r.source !== 'sync');
    let ms = 0;
    let stretches = timed.length ? 1 : 0;
    for (let i = 1; i < timed.length; i++) {
      const gap = timed[i].ts - timed[i - 1].ts;
      if (gap <= MAX_GAP_SEC * 1000) ms += gap; else stretches++;
    }

    const out: JapaDayRow = {
      japa_date: isoDay,
      active_ms: ms,
      active_sec: Math.round(ms / 1000),
      tap_count: rows.length,
      stretches,
      first_tap_ts: rows[0].ts,
      last_tap_ts: rows[rows.length - 1].ts,
    };

    await db.runAsync(
      `INSERT INTO japa_day
            (japa_date, active_ms, active_sec, tap_count, stretches, first_tap_ts, last_tap_ts)
            VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(japa_date) DO UPDATE SET
            active_ms    = excluded.active_ms,
            active_sec   = excluded.active_sec,
            tap_count    = excluded.tap_count,
            stretches    = excluded.stretches,
            first_tap_ts = excluded.first_tap_ts,
            last_tap_ts  = excluded.last_tap_ts`,
      [out.japa_date, out.active_ms, out.active_sec, out.tap_count, out.stretches,
       out.first_tap_ts, out.last_tap_ts]
    );
    return out;
  },
};

/**
 * Record a bead without ever letting the timing get in the way of the count.
 *
 * Called from the one `tap()` path both the screen and the ring go through, so
 * a bead is timed identically whichever finger moved. If the database is busy
 * or absent (web), the bead is still counted by the caller — only the timing
 * of that one bead is lost.
 */
export const recordJapaTap = (source: JapaTapSource): void => {
  void japaTimeRepo.recordTap(source).catch(() => { /* count survives; timing doesn't */ });
};
