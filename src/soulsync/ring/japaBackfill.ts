/**
 * japaBackfill — file beads the ring counted while the phone was away on the
 * days they were actually counted.
 *
 * WHAT THIS REPLACES
 *
 * The Japa tab took the sync's total and fired that many taps through the live
 * counter. Every one of them was stamped with the moment of the sync, so beads
 * counted on Sunday and synced on Tuesday became Tuesday's beads: the day you
 * happened to reconnect on was inflated, and the days you actually practised
 * stayed empty. It is the last of the counters that could put a number on the
 * screen you had not earned that day.
 *
 * WHAT IT DOES INSTEAD
 *
 * The ring stores hourly snapshots of a rising accumulator, so the difference
 * between two consecutive snapshots is that hour's beads and the later
 * snapshot's timestamp is when they happened. `syncJapaHistory` hands those
 * over as buckets; this walks them in order and writes each bead with its own
 * instant.
 *
 * MALAS ACROSS A DAY BOUNDARY
 *
 * A mala is 108 beads and does not respect midnight. The remainder is carried
 * forward through the buckets in time order, so a mala that began on Sunday
 * night and finished on Monday morning is credited to Monday — the day it was
 * completed, which is how a mala counted live is credited too. Whatever is
 * left over at the end is not a mala yet and is returned, so the caller can
 * put it back on the bead counter rather than losing it.
 *
 * WHY THE BEADS ARE STILL 'sync'
 *
 * Their DAY is now known, their minute is not: an hourly snapshot cannot say
 * whether the hour's beads took four minutes or forty. So they count toward
 * the day's bead total and stay out of the japa-time arithmetic, which needs
 * real intervals. See db/japaTimeRepo.
 */

import { japaTimeRepo } from '../db/japaTimeRepo';
import type { JapaBackfillBucket } from './japaHistorySync';

const BEADS = 108;

export interface BackfillPlan {
  /** Completed malas, per local day. */
  malasByDate: { date: string; malas: number; japas: number }[];
  /** Beads left over — not a mala yet. Belongs back on the counter. */
  remainder: number;
  /** Beads filed in total. */
  beads: number;
}

const localDay = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * Work out what the buckets mean, without writing anything.
 *
 * Pure, so the arithmetic can be tested against awkward cases — a mala
 * straddling midnight, a bucket larger than a mala, an empty sync — without a
 * ring or a database.
 *
 * @param carriedIn beads already on the counter before the backfill, so a mala
 *   half-finished live and half-finished offline still completes.
 */
export function planBackfill(
  buckets: JapaBackfillBucket[], carriedIn = 0,
): BackfillPlan {
  const byDate = new Map<string, number>();
  let carry = carriedIn;
  let beads = 0;

  // Time order matters: the carry passes from one bucket to the next, so a
  // mala completed in a later hour is credited to that hour's day.
  const ordered = [...buckets].sort((a, b) => a.at.getTime() - b.at.getTime());

  for (const b of ordered) {
    if (b.beads <= 0) continue;
    beads += b.beads;
    carry += b.beads;
    const malas = Math.floor(carry / BEADS);
    if (malas > 0) {
      carry -= malas * BEADS;
      const d = localDay(b.at);
      byDate.set(d, (byDate.get(d) ?? 0) + malas);
    }
  }

  return {
    malasByDate: [...byDate.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, malas]) => ({ date, malas, japas: malas * BEADS })),
    remainder: carry,
    beads,
  };
}

/**
 * Write the beads into the tap log, each at its own instant.
 *
 * Best-effort per bead: one that fails to record must not stop the rest, and
 * the mala rows are the caller's job — they go through `saveSession` so the
 * deity and the history store stay the single source they are everywhere else.
 */
export async function recordBackfilledBeads(
  buckets: JapaBackfillBucket[],
): Promise<void> {
  for (const b of buckets) {
    const base = b.at.getTime();
    for (let i = 0; i < b.beads; i++) {
      // Spread by a millisecond each so they are distinct rows within the
      // hour they belong to. They carry no interval either way — 'sync' beads
      // are excluded from the time arithmetic.
      await japaTimeRepo.recordTap('sync', base + i).catch(() => { /* skip one */ });
    }
  }
}
