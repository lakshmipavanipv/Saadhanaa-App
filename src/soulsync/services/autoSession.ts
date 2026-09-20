/**
 * autoSession — start and stop a Soul Sync sitting from what the body is doing.
 *
 * WHY THIS EXISTS
 *
 * Recording a sitting required remembering to tap a button before starting and
 * again after finishing. Japa and walking are exactly the two practices where
 * that is least likely to happen: the ring is already counting beads, the ring
 * is already counting steps, and the app knows a practice is underway well
 * before the user thinks to tell it. A sitting that goes unrecorded is a hole
 * in the history and in every average computed from it.
 *
 * So: when the ring reports beads or the pedometer reports walking, open a
 * session. When they stop for long enough, close it.
 *
 * THE RULES, AND WHY THEY ARE THESE RULES
 *
 *   • Only ONE sitting exists (see SoulsyncContext), so auto-start never
 *     competes with a running session — it defers to it.
 *
 *   • A session the USER started is never auto-stopped. They made a decision;
 *     a five-minute pause is not the app's cue to overrule it. Auto-stop only
 *     ever closes what auto-start opened.
 *
 *   • Japa outranks walking. Beads are the more specific signal — someone
 *     walking while chanting is doing japa, and filing that as exercise would
 *     score it against the wrong baseline (exercise sittings are deliberately
 *     unscoreable; see SadhanaDepth's SessionKind notes).
 *
 *   • Walking needs evidence, not a step. A few paces to the kitchen must not
 *     open a session, so a walk starts only once WALK_START_STEPS have landed
 *     inside WALK_WINDOW_MS. Beads carry no such threshold: one bead is already
 *     a deliberate act.
 *
 *   • A failed start backs off. Starting throws when the ring is out of range
 *     or permission was revoked, and retrying on every step would hammer BLE
 *     for as long as the user keeps walking.
 */

import type { SessionKind } from '../analytics/SadhanaDepth';

/** No activity for this long ends an auto-started sitting. */
const IDLE_STOP_MS = 5 * 60 * 1000;

/** Steps needed inside the window below before walking counts as a walk. */
const WALK_START_STEPS = 40;
const WALK_WINDOW_MS = 90 * 1000;

/** How long to stay quiet after a failed start. */
const START_BACKOFF_MS = 2 * 60 * 1000;

/**
 * The longest an auto-started sitting may run, and the quiet spell after it.
 *
 * A manual sitting has someone who knows it is running. An automatic one does
 * not, and walking is the case that matters: a session stays open for five
 * minutes past the last step, so someone on their feet through the morning
 * would hold one open for hours. That is not just a long row in the database —
 * a session drives the live vitals cycler, which arms the ring's HRV and SpO2
 * sensors every few seconds, and holding a sensor armed is the failure mode
 * that freezes this ring (see the LiveMetric notes in SadhanaRing.ts).
 *
 * So an auto sitting is capped, and a cooldown follows it. An hour of walking
 * is recorded as roughly an hour of walking with a gap in it, rather than as
 * one unbounded session that keeps the radio and the sensors busy all day.
 */
const MAX_AUTO_SESSION_MS = 60 * 60 * 1000;
const POST_CAP_COOLDOWN_MS = 15 * 60 * 1000;

export type AutoTrigger = 'japa' | 'walk';

/** What the trigger files the sitting as. */
const PRACTICE_FOR: Record<AutoTrigger, SessionKind> = { japa: 'japa', walk: 'exercise' };

/** Japa beats walking when both are happening. */
const RANK: Record<AutoTrigger, number> = { japa: 2, walk: 1 };

export interface AutoSessionControls {
  start: (meta: { practice: SessionKind }) => Promise<void>;
  stop: () => Promise<unknown>;
  /** Whether a sitting — any sitting — is currently open. */
  isActive: () => boolean;
}

export type AutoSessionEvent =
  | { kind: 'started'; trigger: AutoTrigger }
  | { kind: 'stopped'; trigger: AutoTrigger };

class AutoSession {
  private controls: AutoSessionControls | null = null;
  private onEvent: ((e: AutoSessionEvent) => void) | null = null;

  /** The trigger that opened the current sitting — null when we did not open it. */
  private ownedBy: AutoTrigger | null = null;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private capTimer: ReturnType<typeof setTimeout> | null = null;
  private starting = false;
  private backoffUntil = 0;

  /** Recent step timestamps, for the "is this actually a walk" window. */
  private stepEvents: { at: number; steps: number }[] = [];

  attach(controls: AutoSessionControls, onEvent?: (e: AutoSessionEvent) => void): void {
    this.controls = controls;
    this.onEvent = onEvent ?? null;
  }

  detach(): void {
    this.clearIdle();
    this.clearCap();
    this.controls = null;
    this.onEvent = null;
    this.ownedBy = null;
    this.stepEvents = [];
  }

  /** One bead. Called from the japa tap funnel, whatever the source. */
  noteJapa(): void {
    void this.note('japa');
  }

  /**
   * Steps just landed.
   *
   * @param delta how many steps since the last report.
   */
  noteSteps(delta: number): void {
    if (delta <= 0) return;
    const now = Date.now();
    this.stepEvents.push({ at: now, steps: delta });
    // Drop anything that fell out of the window.
    const cutoff = now - WALK_WINDOW_MS;
    this.stepEvents = this.stepEvents.filter((e) => e.at >= cutoff);

    // A sitting we already own keeps being fed by any step at all — the
    // threshold is for STARTING a walk, not for proving it is still going.
    if (this.ownedBy === 'walk') { void this.note('walk'); return; }

    const recent = this.stepEvents.reduce((s, e) => s + e.steps, 0);
    if (recent >= WALK_START_STEPS) void this.note('walk');
  }

  /**
   * The user stopped a sitting by hand, or one ended some other way.
   *
   * Without this, a manual Stop on a sitting auto-start had opened would leave
   * `ownedBy` set, and the next bead would be treated as "still going" against
   * a session that no longer exists.
   */
  noteSessionEnded(): void {
    this.clearIdle();
    this.clearCap();
    this.ownedBy = null;
  }

  private async note(trigger: AutoTrigger): Promise<void> {
    const c = this.controls;
    if (!c) return;

    // Ours and still going: just push the idle deadline out.
    if (this.ownedBy === trigger) { this.armIdle(); return; }

    // Something is already recording.
    if (c.isActive()) {
      if (this.ownedBy == null) return;           // user's sitting — leave it alone
      // Ours, but a higher-ranked practice just announced itself. Close the
      // weaker one and let the next call open the stronger: a walk that turns
      // into japa should be filed as japa, not left as exercise.
      if (RANK[trigger] > RANK[this.ownedBy]) {
        await this.finish();
        await this.begin(trigger);
      }
      return;
    }

    await this.begin(trigger);
  }

  private async begin(trigger: AutoTrigger): Promise<void> {
    const c = this.controls;
    if (!c || this.starting || Date.now() < this.backoffUntil) return;
    this.starting = true;
    try {
      await c.start({ practice: PRACTICE_FOR[trigger] });
      // `start()` resolves without throwing when it declines — it is guarded
      // internally and simply returns if a sitting is already open. Claiming
      // ownership of a session that was never opened would arm an idle timer
      // against nothing and make every later bead a no-op, so confirm.
      if (!c.isActive()) {
        console.log(`[autoSession] start declined (${trigger}) — no session opened`);
        return;
      }
      this.ownedBy = trigger;
      this.armIdle();
      this.armCap();
      this.onEvent?.({ kind: 'started', trigger });
    } catch (e) {
      // Ring out of range, or BLE permission gone. Back off rather than retry
      // on every bead for the rest of the mala.
      this.backoffUntil = Date.now() + START_BACKOFF_MS;
      console.log(`[autoSession] start refused (${trigger}): ${(e as Error).message}`);
    } finally {
      this.starting = false;
    }
  }

  private async finish(): Promise<void> {
    const c = this.controls;
    const trigger = this.ownedBy;
    this.clearIdle();
    this.clearCap();
    this.ownedBy = null;
    if (!c || !trigger) return;
    try {
      await c.stop();
      this.onEvent?.({ kind: 'stopped', trigger });
    } catch (e) {
      console.log(`[autoSession] stop failed: ${(e as Error).message}`);
    }
  }

  private armIdle(): void {
    this.clearIdle();
    this.idleTimer = setTimeout(() => { void this.finish(); }, IDLE_STOP_MS);
  }

  /**
   * The hard stop, armed once at start and never pushed out by activity.
   *
   * Deliberately not refreshed the way the idle timer is — the whole point is
   * a ceiling on how long continuous activity can hold a sitting open.
   */
  private armCap(): void {
    this.clearCap();
    this.capTimer = setTimeout(() => {
      // Quiet spell afterwards, so the next step does not reopen immediately
      // and turn the cap into a no-op.
      this.backoffUntil = Date.now() + POST_CAP_COOLDOWN_MS;
      void this.finish();
    }, MAX_AUTO_SESSION_MS);
  }

  private clearIdle(): void {
    if (this.idleTimer) { clearTimeout(this.idleTimer); this.idleTimer = null; }
  }

  private clearCap(): void {
    if (this.capTimer) { clearTimeout(this.capTimer); this.capTimer = null; }
  }
}

export const autoSession = new AutoSession();
