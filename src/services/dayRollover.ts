/**
 * dayRollover — the one place that notices the date changed.
 *
 * WHY THIS EXISTS
 *
 * Every day key in this app is a local `YYYY-MM-DD` string, and the storage
 * layer handles that correctly. What was missing was anything that noticed the
 * string had changed while the app was open. Screens computed `todayStr()`
 * inside a mount-only effect, so an app left running across midnight kept
 * querying `daily_activity WHERE activity_date = <yesterday>` and kept showing
 * yesterday's steps — forever, until it was force-closed. The step count never
 * "reset" because nothing ever asked again.
 *
 * So: one timer, one notion of the current day, one event.
 *
 * WHY THREE TRIGGERS AND NOT JUST A TIMER
 *
 * A `setTimeout` aimed at midnight is not enough on a phone. Android's doze
 * suspends the JS timer queue, so a timer armed at 21:00 for a 3-hour sleep
 * routinely fires late — sometimes not until the user next picks the phone up.
 * The timer is the happy path; the other two are why this is reliable:
 *
 *   1. a timer aimed just past the next local midnight, re-armed each time
 *   2. an AppState listener — catches "phone was asleep, user just opened it",
 *      which is how most real rollovers are actually observed
 *   3. a slow interval while the app is in the foreground — catches a timer
 *      that was throttled but never suspended, e.g. the app was visible and
 *      idle right through midnight
 *
 * All three funnel into `check()`, which is idempotent: it fires listeners only
 * when the day string genuinely differs from the last one seen.
 */

import { useEffect, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import { isoDayOf } from '../utils';

/**
 * How long after midnight to aim.
 *
 * Not zero. A timer that fires at exactly 00:00:00.000 can still read the
 * previous day back from `new Date()` when the clock is a few milliseconds
 * behind, and then re-arms for a midnight that has already passed — a spin.
 * Five seconds is invisible to the user and removes the class of bug.
 */
const MIDNIGHT_SLACK_MS = 5_000;

/** Foreground safety net. Cheap enough to leave running, slow enough to ignore. */
const GUARD_TICK_MS = 60_000;

export type DayChangeListener = (today: string, previous: string) => void;

class DayRollover {
  private day: string = isoDayOf(new Date());
  private listeners = new Set<DayChangeListener>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private guard: ReturnType<typeof setInterval> | null = null;
  private appStateSub: { remove: () => void } | null = null;
  private started = false;

  /** The current local day, as every day-keyed table spells it. */
  get today(): string {
    return this.day;
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.day = isoDayOf(new Date());
    this.arm();
    this.guard = setInterval(() => this.check(), GUARD_TICK_MS);
    this.appStateSub = AppState.addEventListener('change', this.onAppState);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    if (this.guard) clearInterval(this.guard);
    this.appStateSub?.remove();
    this.timer = null;
    this.guard = null;
    this.appStateSub = null;
    this.started = false;
  }

  /**
   * Subscribe to day changes. Returns an unsubscribe.
   *
   * Listeners are called with (today, previous) so a handler can tell a normal
   * rollover from a clock change or a flight across timezones — both of which
   * produce a day change here, and both of which SHOULD reset the view.
   */
  subscribe(fn: DayChangeListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private onAppState = (st: AppStateStatus): void => {
    if (st === 'active') this.check();
  };

  /** Fire listeners if — and only if — the local day string has moved. */
  check(): void {
    const now = isoDayOf(new Date());
    if (now === this.day) return;
    const previous = this.day;
    this.day = now;
    for (const fn of this.listeners) {
      // One bad listener must not stop the others from resetting.
      try {
        fn(now, previous);
      } catch (e) {
        console.warn('[dayRollover] listener threw', e);
      }
    }
  }

  /** (Re-)aim the timer at the next local midnight. */
  private arm(): void {
    if (this.timer) clearTimeout(this.timer);
    const now = new Date();
    const nextMidnight = new Date(
      now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 0, 0
    ).getTime();
    const delay = Math.max(1_000, nextMidnight - now.getTime() + MIDNIGHT_SLACK_MS);
    /*
     * The chain re-arms itself unconditionally, whatever `check()` decides.
     *
     * Re-arming inside `check()` instead would break the moment the timer
     * fired and the day had NOT changed — an early fire, a clock nudged
     * backwards — because `check()` returns before doing anything when the day
     * string matches. The timer would then be dead for the rest of the
     * process, leaving the 60 s guard as the only trigger. Cheap insurance for
     * a mechanism that gets one chance a day to be right.
     */
    this.timer = setTimeout(() => {
      this.timer = null;
      this.check();
      this.arm();
    }, delay);
  }
}

export const dayRollover = new DayRollover();

/**
 * The current local day, re-rendering the caller when it changes.
 *
 * Use this instead of calling `todayStr()` inside a mount-only effect. Putting
 * the returned string in an effect's dependency array is what makes a screen
 * re-query when the date turns over:
 *
 *     const today = useToday();
 *     useEffect(() => { refresh(); }, [today]);
 */
export const useToday = (): string => {
  const [day, setDay] = useState<string>(dayRollover.today);
  useEffect(() => dayRollover.subscribe((t) => setDay(t)), []);
  return day;
};
