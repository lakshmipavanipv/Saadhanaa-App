/**
 * dailyReset — hand the day's figures to the app, prove they arrived, and only
 * then let the ring start over.
 *
 * THE ORDER IS THE WHOLE POINT
 *
 * A counter that resets is easy. A counter that resets without losing the day
 * it was counting is the actual problem, and it has three steps that must not
 * be reordered:
 *
 *   1. PURGE   — pull the closing day's records out of the ring and write them
 *                into the app's own day-keyed tables.
 *   2. VERIFY  — read back what the app stored and compare it against what the
 *                ring reported. If they do not agree, the day did not arrive.
 *   3. RESET   — only now let anything be zeroed.
 *
 * Step 2 is not ceremony. The ring drops a page of history once the app ACKs
 * it, so a pull that half-succeeded has already destroyed the source. There is
 * no second chance to fetch a day, which is precisely why the zeroing must be
 * conditional on the copy being verified rather than on the pull merely having
 * been attempted.
 *
 * WHY THE CLOCK PUSH IS PART OF THE RESET AND NOT THE PURGE
 *
 * The ring resets its own step counter at ITS midnight, off its own RTC. When
 * that clock has drifted behind, pushing the correct time forward is what
 * triggers the rollover — so the clock push IS a reset action, and doing it
 * before the purge would zero the counter while the day was still unread.
 *
 * STEPS VS BEADS
 *
 *   • Steps have no clear command, and need none: the ring zeroes them itself
 *     at its own midnight. The app's job is to have captured the closing total
 *     first, and to let the clock push land afterwards.
 *   • Beads are a lifetime accumulator that never resets on its own, so they
 *     are cleared explicitly — and only after the same verification.
 */

import { AppState, type AppStateStatus } from 'react-native';

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import { syncJapaHistory } from './japaHistorySync';
import { syncAllRingVitals, foldStepSamples } from './ringVitalsSync';
import { getDB } from '../db/database';
import { Storage } from '../../storage';

/** Days whose close-out has not succeeded yet. */
const PENDING_KEY = 'ring.closeout.pending.v1';

/**
 * How many days may be waiting at once.
 *
 * A ring left in a drawer for a fortnight should not accumulate a fortnight of
 * retries. The oldest are dropped: their steps are already in the app from
 * whatever syncs did run, and the bead counter being a few days late to zero
 * is a far smaller problem than a queue that grows without end.
 */
const MAX_PENDING_DAYS = 7;

/** How often to retry a pending close-out while the app is running. */
const RETRY_EVERY_MS = 15 * 60 * 1000;

/**
 * How far apart the ring's and the app's step totals may be and still count as
 * agreeing.
 *
 * Not zero. The ring keeps counting while the sync runs, so a handful of steps
 * taken during the transfer is agreement, not disagreement. Anything larger
 * means a page went missing and the day must not be zeroed.
 */
const STEP_MATCH_TOLERANCE = 25;

export interface DailyResetResult {
  /** The day whose figures were being closed out (local YYYY-MM-DD). */
  day: string;
  /** Steps the app has stored for that day after the purge. */
  appSteps: number | null;
  /** Steps the ring reported for that day. */
  ringSteps: number | null;
  /** Whether the two agreed within tolerance. */
  verified: boolean;
  /** Beads recovered from the ring before its counter was cleared. */
  beadsRecovered: number;
  /** Whether the ring's japa accumulator was actually zeroed. */
  beadsCleared: boolean;
  /** Whether the ring's clock was re-pushed (which lets its day roll). */
  clockPushed: boolean;
  error?: string;
}

const blank = (day: string): DailyResetResult => ({
  day, appSteps: null, ringSteps: null, verified: false,
  beadsRecovered: 0, beadsCleared: false, clockPushed: false,
});

/**
 * Close out `day` — purge, verify, then reset.
 *
 * Never throws. This runs from a midnight timer with nobody watching, and a
 * ring that is out of range at 3am is the normal case, not an error. When
 * anything fails the ring is left exactly as it was: still holding the day,
 * still accumulating. Nothing is lost by declining to reset; a great deal is
 * lost by resetting anyway.
 */
export async function closeOutDay(day: string): Promise<DailyResetResult> {
  const out = blank(day);

  const deviceId = await readSr16DeviceId();
  if (!deviceId) return { ...out, error: 'no ring paired' };

  // ── 1. PURGE ────────────────────────────────────────────────────────────
  //
  // Beads first. `syncAllRingVitals` drains and ACKs the japa channel without
  // consulting the bead watermark, so running it first would destroy the very
  // snapshots `syncJapaHistory` needs to credit offline practice.
  try {
    const japa = await syncJapaHistory();
    out.beadsRecovered = japa.delta;
  } catch (e) {
    return { ...out, error: `bead purge: ${(e as Error).message}` };
  }

  let ringSteps: number | null = null;
  try {
    const res = await syncAllRingVitals();
    /*
     * The ring's own figure for the CLOSING day, folded out of the raw samples.
     *
     * Deliberately not `res.steps.total`, which is `byDay.get(today)` — and at
     * one minute past midnight "today" is the day that just began, so it would
     * compare the closing day's stored total against the new day's handful of
     * steps and conclude they disagree, every single night.
     */
    const byDay = foldStepSamples(res.raw.steps);
    ringSteps = byDay.get(day)?.steps ?? null;
  } catch (e) {
    return { ...out, error: `step purge: ${(e as Error).message}` };
  }

  // ── 2. VERIFY ───────────────────────────────────────────────────────────
  let appSteps: number | null = null;
  try {
    const db = await getDB();
    const row = await db.getFirstAsync<{ step_count: number | null }>(
      `SELECT step_count FROM daily_activity WHERE activity_date = ?`, [day]
    );
    appSteps = row?.step_count ?? null;
  } catch (e) {
    return { ...out, ringSteps, error: `verify read: ${(e as Error).message}` };
  }

  out.appSteps = appSteps;
  out.ringSteps = ringSteps;

  /*
   * What counts as verified.
   *
   * When the ring reported a total, the app's stored figure must match it.
   * When it reported nothing — the channel was empty because the app had
   * already drained it earlier in the day — a stored figure is itself the
   * evidence, since the only way it got there is a successful earlier pull.
   * What is NOT verified is the app holding nothing: that is the case where
   * the day may still be sitting unread on the ring.
   */
  out.verified = ringSteps != null
    ? appSteps != null && Math.abs(appSteps - ringSteps) <= STEP_MATCH_TOLERANCE
    : appSteps != null;

  if (!out.verified) {
    console.log(
      `[DAYROLL] ${day} NOT closed out — app=${appSteps} ring=${ringSteps}. ` +
      `Leaving the ring untouched so the day is not lost.`
    );
    return out;
  }

  // ── 3. RESET ────────────────────────────────────────────────────────────
  let ring: SadhanaRing | null = null;
  try {
    ring = await SadhanaRing.connect(deviceId);
    // Beads: explicit, because nothing else ever zeroes them.
    await ring.sync.clearTasbihCount();
    out.beadsCleared = true;
  } catch (e) {
    out.error = `bead clear: ${(e as Error).message}`;
  } finally {
    await ring?.disconnect().catch(() => {});
  }

  // Steps: no command, just the correct time. The ring rolls its own day off
  // its RTC, so an accurate clock is what makes that happen at the user's
  // midnight rather than at whatever hour the ring had drifted to.
  try {
    await SadhanaRing.syncClockOnAllOpen();
    out.clockPushed = true;
  } catch (e) {
    out.error = `${out.error ? out.error + '; ' : ''}clock: ${(e as Error).message}`;
  }

  console.log(
    `[DAYROLL] ${day} closed out — steps app=${appSteps} ring=${ringSteps}, ` +
    `beads recovered=${out.beadsRecovered} cleared=${out.beadsCleared}`
  );
  return out;
}

// ── Deferred close-out ──────────────────────────────────────────────────────

/**
 * At midnight the ring is usually off the finger, on a charger, or simply out
 * of range — asleep in another room is the ordinary case, not the exception.
 * A close-out that runs once at 00:00 and gives up would therefore almost
 * never be the one that runs, and the day would be left half-closed: steps
 * uncopied, beads still accumulating.
 *
 * So midnight does not perform the close-out. It QUEUES one. The queue is
 * persisted, survives the app being killed, and is retried whenever there is a
 * reason to think the ring might be reachable again — on a timer, when the app
 * comes back to the foreground, and whenever a caller says the ring just
 * connected.
 *
 * A day leaves the queue only once `closeOutDay` reports it verified. Failure
 * is not an error state here; it is the normal state at 3am, and the day
 * simply waits.
 */

const readPending = (): Promise<string[]> => Storage.get<string[]>(PENDING_KEY, []);

/** Queue a day for close-out. Idempotent. */
export async function queueCloseOut(day: string): Promise<void> {
  const pending = await readPending();
  if (pending.includes(day)) return;
  const next = [...pending, day].sort().slice(-MAX_PENDING_DAYS);
  await Storage.set(PENDING_KEY, next);
  console.log(`[DAYROLL] queued ${day} for close-out (${next.length} pending)`);
}

/** Days still waiting, oldest first. */
export async function pendingCloseOuts(): Promise<string[]> {
  return readPending();
}

/**
 * Attempt every pending close-out, oldest first.
 *
 * Stops at the first day that does not complete: if the ring is unreachable
 * for one it will be unreachable for the next, and there is no value in
 * hammering BLE through the whole backlog to learn the same thing.
 */
export async function runPendingCloseOuts(): Promise<void> {
  const pending = await readPending();
  if (!pending.length) return;

  const remaining = [...pending];
  for (const day of pending) {
    const res = await closeOutDay(day).catch((e) => ({
      ...blank(day), error: (e as Error).message,
    }));
    if (!res.verified) {
      console.log(`[DAYROLL] ${day} still pending: ${res.error ?? 'not verified'}`);
      break;
    }
    remaining.shift();
  }

  if (remaining.length !== pending.length) await Storage.set(PENDING_KEY, remaining);
}

/**
 * Keep trying until the ring turns up.
 *
 * Returns a stop function. Retries are cheap when there is nothing queued —
 * `runPendingCloseOuts` reads one key and returns — so the timer is left
 * running rather than being armed and disarmed around the queue's state.
 */
export function startCloseOutRetries(): () => void {
  let running = false;
  const attempt = () => {
    // One at a time. A foreground event landing on top of a timer tick would
    // otherwise have two purges racing for the same destructive channel reads.
    if (running) return;
    running = true;
    void runPendingCloseOuts()
      .catch((e) => console.log(`[DAYROLL] retry failed: ${(e as Error).message}`))
      .finally(() => { running = false; });
  };

  const timer = setInterval(attempt, RETRY_EVERY_MS);
  const onState = (st: AppStateStatus) => { if (st === 'active') attempt(); };
  const sub = AppState.addEventListener('change', onState);
  // The ring coming back is the signal that actually matters — far better
  // than waiting out a fifteen-minute interval after it reappears.
  const offConnect = SadhanaRing.onAnyConnect(attempt);
  attempt();   // and once now, for a day queued while the app was closed

  return () => { clearInterval(timer); sub.remove(); offConnect(); };
}

/**
 * Called when the ring has just become reachable.
 *
 * The strongest signal there is that a pending day can now be closed out, and
 * far better than waiting out the retry interval.
 */
export function onRingAvailable(): void {
  void runPendingCloseOuts().catch(() => { /* it stays queued */ });
}
