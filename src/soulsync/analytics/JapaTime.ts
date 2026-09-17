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
 * then fed "JAPA TIME TODAY", the Home tab's "Sadhana Time — 137 min today",
 * and through that the Commitment Score — so one invented constant inflated
 * three screens.
 *
 * WHERE THE REAL NUMBER COMES FROM
 *
 * `session_spiritual` already stores `start_time` and `end_time` per session,
 * written when the user starts and stops a SoulSync session. The elapsed time
 * between them is measured. This module sums it.
 *
 * WHAT HAPPENS WHEN THERE IS NO SESSION
 *
 * Beads counted outside a session have no duration, and this returns null for
 * them rather than filling the gap. A dash is a true statement; six seconds a
 * bead is a guess wearing a measurement's clothes. `untimedJapas` lets the UI
 * say *why* it is blank, which is the part that makes a dash acceptable.
 */

import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';

export interface JapaTimeResult {
  /** Measured minutes from completed sessions. Null when nothing was timed. */
  minutes: number | null;
  /** How many sessions contributed. */
  sessions: number;
  /** A session is open right now, so `minutes` is still growing. */
  live: boolean;
}

/** Longest plausible single sitting. Guards a session left open overnight
 *  from reporting fourteen hours of japa. */
const MAX_SESSION_MIN = 6 * 60;

/**
 * Measured japa minutes for one local day.
 *
 * @param isoDay YYYY-MM-DD in local time. The repo matches on `date(start_time)`,
 *   so a session is attributed to the day it began — a sitting that crosses
 *   midnight counts once, on its start date, instead of being split or
 *   double-counted.
 */
export async function japaMinutesOnDate(isoDay: string): Promise<JapaTimeResult> {
  let rows: Awaited<ReturnType<typeof sessionSpiritualRepo.sessionsOnDate>>;
  try {
    rows = await sessionSpiritualRepo.sessionsOnDate(isoDay);
  } catch {
    return { minutes: null, sessions: 0, live: false };
  }
  if (!rows.length) return { minutes: null, sessions: 0, live: false };

  let total = 0;
  let counted = 0;
  let live = false;

  for (const r of rows) {
    const start = new Date(r.start_time).getTime();
    if (!Number.isFinite(start)) continue;

    // An open session is still running; measure it to now so the number moves
    // while the user sits, rather than appearing only after they stop.
    const isOpen = !r.end_time;
    const end = isOpen ? Date.now() : new Date(r.end_time as string).getTime();
    if (!Number.isFinite(end) || end <= start) continue;

    const min = (end - start) / 60_000;
    if (min > MAX_SESSION_MIN) continue;   // left open; not a six-hour sitting

    total += min;
    counted++;
    if (isOpen) live = true;
  }

  if (!counted) return { minutes: null, sessions: 0, live: false };
  return { minutes: Math.round(total), sessions: counted, live };
}
