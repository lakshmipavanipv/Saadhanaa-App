/**
 * dailyReset — start the ring on a fresh day too.
 *
 * WHY THE RING NEEDS ANYTHING DOING TO IT
 *
 * The phone's day keys are all local `YYYY-MM-DD` strings and roll over on
 * their own. The ring's do not. Two of its counters behave quite differently
 * and only one of them resets by itself:
 *
 *   • STEPS reset at the ring's own midnight, read from its onboard RTC. The
 *     app writes that clock once per physical connection, and `connect()`
 *     reuses a cached link — so a ring held open for days by the japa counter
 *     keeps whatever time it was given at pairing, and its midnight drifts
 *     away from the user's. Fixing that is a clock push, not a counter reset,
 *     and it lives in `SadhanaRing.syncClockOnAllOpen()`.
 *
 *   • The JAPA counter is a lifetime accumulator. It has no notion of a day at
 *     all: it counts up from the moment the ring was made and never resets.
 *     The app has always hidden this by attributing beads to days phone-side,
 *     but the number the ring itself holds — and shows — just keeps climbing.
 *
 * This module handles the second one.
 *
 * ORDER MATTERS, AND THIS IS WHY
 *
 * Clearing the counter first would throw away beads. The ring holds hourly
 * snapshots of the accumulator that `syncJapaHistory()` diffs against a stored
 * watermark to recover practice done while the phone was away — so anything
 * not yet pulled is only in the ring. Drain, THEN clear.
 *
 * Both readers already survive the clear, which is what makes it safe at all:
 * `japaHistorySync` treats `latest.count < prev.count` as "start clean" rather
 * than as a negative delta, and `JapaRingCounter.applyRingCount` re-baselines
 * on a non-positive delta instead of emitting one. Neither invents beads.
 */

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import { syncJapaHistory } from './japaHistorySync';

export interface DailyResetResult {
  /** Beads recovered from the ring before the counter was cleared. */
  beadsRecovered: number;
  /** Whether the ring's japa accumulator was actually zeroed. */
  cleared: boolean;
  error?: string;
}

/**
 * Credit anything the ring still holds, then zero its japa counter.
 *
 * Never throws — this runs from a midnight timer with nobody watching, and a
 * ring that is out of range or asleep is the normal case at 3am, not an error
 * worth surfacing. The counter simply stays as it is until the next rollover.
 */
export async function resetRingDailyCounters(): Promise<DailyResetResult> {
  const deviceId = await readSr16DeviceId();
  if (!deviceId) return { beadsRecovered: 0, cleared: false, error: 'no ring paired' };

  // 1. Drain. Beads counted offline live only in the ring's own snapshots
  //    until this runs, and the clear below would destroy them.
  let beadsRecovered = 0;
  try {
    const res = await syncJapaHistory();
    beadsRecovered = res.delta;
  } catch (e) {
    // A failed drain means we must NOT clear — that would lose the beads we
    // were unable to read.
    return { beadsRecovered: 0, cleared: false, error: `drain: ${(e as Error).message}` };
  }

  // 2. Zero the accumulator so the ring's own count means "today".
  let ring: SadhanaRing | null = null;
  try {
    ring = await SadhanaRing.connect(deviceId);
    await ring.sync.clearTasbihCount();
    console.log(`[DAYROLL] ring japa counter cleared (recovered ${beadsRecovered} beads first)`);
    return { beadsRecovered, cleared: true };
  } catch (e) {
    console.log(`[DAYROLL] ring japa clear failed: ${(e as Error).message}`);
    return { beadsRecovered, cleared: false, error: (e as Error).message };
  } finally {
    await ring?.disconnect().catch(() => {});
  }
}
