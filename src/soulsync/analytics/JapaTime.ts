/**
 * JapaTime — how long japa actually took, measured rather than inferred.
 *
 * WHAT THIS REPLACES
 *
 * Japa time came from `utils.japasToSeconds`:
 *
 *     export const SECONDS_PER_JAPA = 6;
 *     export const japasToSeconds = (japas) => japas * SECONDS_PER_JAPA;
 *
 * That is not a measurement of anything. It is the japa count in different
 * units, so it could never disagree with the count beside it: 433 japa always
 * reads 43 minutes whether they took twenty minutes or two hours. The figure
 * then fed "JAPA TIME TODAY", the Home tab's "Sadhana Time", and through that
 * the Commitment Score — so one invented constant inflated three screens.
 *
 * WHY IT THEN SHOWED NOTHING AT ALL
 *
 * The first replacement measured only SoulSync sessions: the user had to press
 * Start, sit, and press Stop. That is a real measurement, and almost nobody
 * produces one — people pick up the ring and count. So the beads were recorded,
 * the practice happened, and the time read blank. Refusing to invent a number
 * was right; having no other way to get a real one was the gap.
 *
 * WHERE THE NUMBER COMES FROM NOW
 *
 * Two independent sources, both measured:
 *
 *   1. THE BEADS. Every tap — from the ring's counter or from the screen —
 *      is stored with its instant by `japaTimeRepo`. Consecutive beads less
 *      than two minutes apart are one sitting, and the sitting's span is time
 *      spent chanting. This is the source that covers ordinary practice.
 *
 *   2. SOULSYNC SESSIONS. An explicit start and stop, from `session_spiritual`.
 *      Time inside a session counts even across a long silence, because the
 *      user declared they were sitting.
 *
 * WHY THE TWO ARE UNIONED, NOT ADDED
 *
 * Beads counted during a SoulSync session appear in BOTH sources. Adding them
 * would double every timed session — exactly the class of hidden multiplication
 * this module exists to remove. So the sources are converted to intervals on
 * the clock, overlapping intervals are merged, and the merged spans are summed.
 * A minute of the day can be counted once, however many sources saw it.
 */

import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';
import { japaTimeRepo, MAX_GAP_SEC, type JapaDayRow } from '../db/japaTimeRepo';

export interface JapaTimeResult {
  /** Measured minutes for the day. Null when nothing could be timed. */
  minutes: number | null;
  /** The same figure in seconds, for short sittings that round to zero. */
  seconds: number;
  /** How many SoulSync sessions contributed. */
  sessions: number;
  /** Japa is happening right now — a session is open, or beads are still landing. */
  live: boolean;
  /** Beads counted today, including ones backfilled from the ring. */
  taps: number;
  /** Separate sittings the beads fell into. */
  stretches: number;
  /** First and last bead of the day, as instants. Null when there were none. */
  firstTapAt: Date | null;
  lastTapAt: Date | null;
  /**
   * Beads that arrived as a backfill from the ring and so could not be timed.
   * The UI uses this to explain a count that is larger than the time suggests.
   */
  untimedTaps: number;
}

/** Longest plausible single sitting. Guards a session left open overnight
 *  from reporting fourteen hours of japa. */
const MAX_SESSION_MIN = 6 * 60;

interface Span { from: number; to: number }

/** Merge overlapping or touching spans and total them, in milliseconds. */
const unionMs = (spans: Span[]): number => {
  if (!spans.length) return 0;
  const sorted = [...spans].sort((a, b) => a.from - b.from);
  let total = 0;
  let { from, to } = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.from <= to) {
      // Overlaps the span in hand — extend rather than count the shared part
      // a second time. This is the whole reason for the union.
      if (s.to > to) to = s.to;
    } else {
      total += to - from;
      ({ from, to } = s);
    }
  }
  return total + (to - from);
};

const emptyResult = (): JapaTimeResult => ({
  minutes: null, seconds: 0, sessions: 0, live: false,
  taps: 0, stretches: 0, firstTapAt: null, lastTapAt: null, untimedTaps: 0,
});

/**
 * Measured japa time for one local day.
 *
 * @param isoDay YYYY-MM-DD in local time. Sessions are matched on
 *   `date(start_time)`, so a sitting that crosses midnight counts once, on the
 *   day it began, instead of being split or double-counted. Beads are filed by
 *   the local day of the tap itself.
 */
export async function japaMinutesOnDate(isoDay: string): Promise<JapaTimeResult> {
  const spans: Span[] = [];
  const out = emptyResult();

  // ── 1. The beads ──────────────────────────────────────────────────
  let taps: { ts: number; source: string }[] = [];
  try {
    taps = await japaTimeRepo.taps(isoDay);
  } catch { /* no bead log yet — sessions alone may still answer */ }

  if (taps.length) {
    out.taps = taps.length;
    out.firstTapAt = new Date(taps[0].ts);
    out.lastTapAt = new Date(taps[taps.length - 1].ts);
    out.untimedTaps = taps.filter((t) => t.source === 'sync').length;

    // Backfilled beads carry the instant of the sync, not of the finger, so
    // they say nothing about duration and are left out of the spans.
    const timed = taps.filter((t) => t.source !== 'sync');
    let start: number | null = null;
    let prev: number | null = null;
    for (const t of timed) {
      if (prev != null && (t.ts - prev) / 1000 > MAX_GAP_SEC) {
        // The pause was long enough to be a break: close the sitting.
        spans.push({ from: start as number, to: prev });
        out.stretches++;
        start = t.ts;
      } else if (start == null) {
        start = t.ts;
      }
      prev = t.ts;
    }
    if (start != null && prev != null) {
      spans.push({ from: start, to: prev });
      out.stretches++;
      // Still mid-sitting if the last bead was moments ago. The figure is
      // growing, so the UI can say so rather than looking frozen.
      if (Date.now() - prev <= MAX_GAP_SEC * 1000) out.live = true;
    }
  }

  // ── 2. SoulSync sessions ──────────────────────────────────────────
  try {
    const rows = await sessionSpiritualRepo.sessionsOnDate(isoDay);
    for (const r of rows) {
      const from = new Date(r.start_time).getTime();
      if (!Number.isFinite(from)) continue;

      // An open session is still running; measure it to now so the number
      // moves while the user sits, rather than appearing only after they stop.
      const isOpen = !r.end_time;
      const to = isOpen ? Date.now() : new Date(r.end_time as string).getTime();
      if (!Number.isFinite(to) || to <= from) continue;
      if ((to - from) / 60_000 > MAX_SESSION_MIN) continue;  // left open overnight

      spans.push({ from, to });
      out.sessions++;
      if (isOpen) out.live = true;
    }
  } catch { /* beads alone may still answer */ }

  if (!spans.length) {
    // No timing anywhere. Still report the beads, so a screen can say "counted,
    // but too brief to time" instead of implying nothing happened.
    return { ...out, minutes: null, seconds: 0 };
  }

  out.seconds = Math.round(unionMs(spans) / 1000);
  out.minutes = Math.round(out.seconds / 60);
  return out;
}

/**
 * The stored per-day rows, for the history tab's week and month ranges.
 *
 * This reads `japa_day` — the beads only. Sessions are not folded in here
 * because the union above needs the raw instants, and re-deriving a month of
 * them on every range change would be a lot of work for a figure that differs
 * only on days the user ran a SoulSync session.
 */
export async function japaDaysInRange(fromIso: string, toIso: string): Promise<JapaDayRow[]> {
  try {
    return await japaTimeRepo.range(fromIso, toIso);
  } catch {
    return [];
  }
}

/** "1h 12m", "18 min", "40 sec" — never a bare zero when beads were counted. */
export const formatJapaTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds} sec`;
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
};
