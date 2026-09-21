/**
 * sessionDirector — one recording, held open by whatever is going on.
 *
 * WHY IT WORKS THIS WAY
 *
 * A Soul Sync sitting is not a property of a practice. It is a span of time
 * during which the ring is measuring the body, and the body does more than one
 * thing at a time: japa while walking is extremely ordinary, and so is standing
 * up mid-chant to keep walking. Modelling the session as "the japa session" or
 * "the walk session" forces a choice that does not exist in the practice, and
 * the choice is always wrong for someone.
 *
 * So the session is not owned by a practice at all. It is held open by HOLDS.
 * Anything that knows the body is engaged takes a hold; when it knows the
 * engagement has ended, it releases it. The first hold opens the recording and
 * the last release closes it — so vitals span from the first "on" to the last
 * "stop", with no gap in the middle and no second row for the overlap.
 *
 *   beads arriving          →  japa hold
 *   steps arriving          →  walk hold
 *   the user tapping Start  →  manual hold
 *
 * Holds are independent. Tapping Stop on the japa bar while still walking
 * releases the manual hold and leaves the walk hold recording, which is the
 * honest answer: the ring is still measuring, because you are still moving.
 *
 * WHAT THE SITTING IS CALLED
 *
 * One label has to go in the row, and it is the most specific practice that
 * was held at any point — japa outranks a walk. A walk that becomes a chant is
 * relabelled japa in place, without stopping anything, because exercise is
 * deliberately unscoreable and japa is not: splitting them into two sessions
 * would throw away the scorable half. The label never downgrades, so putting
 * the beads down and walking on does not turn a chant back into exercise.
 *
 * AUTOMATIC VS DELIBERATE
 *
 * An automatic hold expires on its own after IDLE_RELEASE_MS without a signal
 * — the beads stopped, the steps stopped. A manual hold has a person behind it
 * and is released only by that person. This is why a sitting you started by
 * hand is never closed out from under you, however long you sit still.
 */

import { useSyncExternalStore } from 'react';

import type { SessionKind } from '../analytics/SadhanaDepth';

/** An automatic hold with no signal for this long has ended. */
const IDLE_RELEASE_MS = 5 * 60 * 1000;

/** How often expiry is checked. Coarse on purpose — this is a five-minute idea. */
const SWEEP_MS = 30 * 1000;

/** Steps needed inside the window below before walking counts as a walk. */
const WALK_START_STEPS = 40;
const WALK_WINDOW_MS = 90 * 1000;

/** How long to stay quiet after a failed start. */
const START_BACKOFF_MS = 2 * 60 * 1000;

/**
 * The longest a recording held open only by AUTOMATIC holds may run, and the
 * quiet spell after it.
 *
 * A manual hold has someone who knows it is running; an automatic one does
 * not. Walking is the case that matters: the walk hold is refreshed by every
 * step, so someone on their feet all morning would hold a recording open for
 * hours — and a recording drives the live vitals cycler, which arms the ring's
 * HRV and SpO2 sensors every few seconds. Holding a sensor armed is the
 * failure mode that freezes this ring (see the LiveMetric notes in
 * SadhanaRing.ts).
 *
 * The cap does not apply while a manual hold is in place. Someone who pressed
 * Start meant it.
 */
const MAX_AUTO_SESSION_MS = 60 * 60 * 1000;
const POST_CAP_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Who is holding the recording open.
 *
 * Manual holds are keyed by practice (`manual:japa`, `manual:yoga`) rather
 * than being one shared slot, because each practice has its own bar and each
 * bar's Stop must release its own hold. One shared manual slot meant starting
 * japa by hand while walking made the Exercise tab's bar read "Stop" — and
 * pressing it would have released the japa hold.
 */
export type HoldId = 'japa' | 'walk' | `manual:${SessionKind}`;

/** Most specific practice wins the label. */
const RANK: Record<SessionKind, number> = { japa: 3, meditation: 2, yoga: 2, exercise: 1 };

interface Hold {
  practice: SessionKind;
  /** Automatic holds expire without a signal; manual ones never do. */
  auto: boolean;
  /** Epoch ms of the last signal — automatic holds only. */
  lastSignalAt: number;
}

export interface SessionControls {
  start: (meta: { practice: SessionKind }) => Promise<void>;
  stop: () => Promise<unknown>;
  /** Synchronous truth, not a render-behind state value. */
  isActive: () => boolean;
  /** Relabel a running sitting when a more specific practice joins. */
  setPractice: (practice: SessionKind) => Promise<void>;
}

class SessionDirector {
  private controls: SessionControls | null = null;
  private holds = new Map<HoldId, Hold>();

  /** True when THIS opened the current recording — see `release`. */
  private owns = false;
  /** Highest rank labelled so far this session; never downgrades. */
  private labelledRank = 0;
  private openedAt = 0;

  private listeners = new Set<() => void>();
  private rev = 0;
  private sweepTimer: ReturnType<typeof setInterval> | null = null;
  private starting = false;
  private backoffUntil = 0;

  /** Recent step reports, for the "is this actually a walk" window. */
  private stepEvents: { at: number; steps: number }[] = [];

  attach(controls: SessionControls): void {
    this.controls = controls;
    if (!this.sweepTimer) this.sweepTimer = setInterval(() => this.sweep(), SWEEP_MS);
  }

  detach(): void {
    if (this.sweepTimer) { clearInterval(this.sweepTimer); this.sweepTimer = null; }
    this.controls = null;
    this.holds.clear();
    this.owns = false;
    this.labelledRank = 0;
    this.stepEvents = [];
  }

  // ── Signals ──────────────────────────────────────────────────────────────

  /** One bead. Called from the japa tap funnel, whatever the source. */
  noteJapa(): void {
    void this.hold('japa', 'japa', true);
  }

  /** Steps just landed. @param delta steps since the last report. */
  noteSteps(delta: number): void {
    if (delta <= 0) return;
    const now = Date.now();
    this.stepEvents.push({ at: now, steps: delta });
    this.stepEvents = this.stepEvents.filter((e) => e.at >= now - WALK_WINDOW_MS);

    // An existing walk hold is refreshed by any step at all — the threshold is
    // for deciding a walk has STARTED, not for proving it is still going.
    if (this.holds.has('walk')) { void this.hold('walk', 'exercise', true); return; }

    const recent = this.stepEvents.reduce((s, e) => s + e.steps, 0);
    if (recent >= WALK_START_STEPS) void this.hold('walk', 'exercise', true);
  }

  /** The user pressed Start on a practice's bar. */
  async startManual(practice: SessionKind): Promise<void> {
    await this.hold(`manual:${practice}`, practice, false);
  }

  /**
   * The user pressed Stop.
   *
   * Releases only their hold. If the ring is still measuring because they are
   * still walking, the recording continues — and the bar says so.
   */
  async stopManual(practice: SessionKind): Promise<void> {
    await this.release(`manual:${practice}`);
  }

  /** Whether the user has deliberately held THIS practice open. */
  hasManualHold(practice: SessionKind): boolean {
    return this.holds.has(`manual:${practice}`);
  }

  /** Any deliberate hold, whatever the practice. */
  private anyManualHold(): boolean {
    for (const id of this.holds.keys()) if (id.startsWith('manual:')) return true;
    return false;
  }

  /**
   * Subscribe to hold changes.
   *
   * Holds live outside React, but the bars render from them — whether this
   * practice is held decides if the control says Stop or Add. Without a
   * notification the bar only re-rendered when `state.active` happened to
   * flip, so adding a practice to a recording that was already running changed
   * nothing on screen.
   */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Bumped on every hold change; the bars read it to re-render. */
  get version(): number {
    return this.rev;
  }

  private emit(): void {
    this.rev += 1;
    for (const fn of this.listeners) {
      try { fn(); } catch { /* one bad listener must not stop the rest */ }
    }
  }

  /** Whether anything at all is holding a recording open. */
  get held(): boolean {
    return this.holds.size > 0;
  }

  /**
   * A recording ended by some route other than this director.
   *
   * Without it, the holds would outlive the session they refer to and the next
   * signal would be read as "still going" against a recording that is gone.
   */
  noteSessionEnded(): void {
    this.holds.clear();
    this.owns = false;
    this.labelledRank = 0;
    this.emit();
  }

  // ── Mechanics ────────────────────────────────────────────────────────────

  private async hold(id: HoldId, practice: SessionKind, auto: boolean): Promise<void> {
    const c = this.controls;
    if (!c) return;

    const existing = this.holds.get(id);
    this.holds.set(id, { practice, auto, lastSignalAt: Date.now() });
    if (!existing) this.emit();

    if (!c.isActive()) {
      await this.begin();
      return;
    }
    // Already recording — this hold joins it. A session someone else opened is
    // still joined: that is the point of one recording rather than several.
    if (!existing) await this.relabel();
  }

  private async release(id: HoldId): Promise<void> {
    if (!this.holds.delete(id)) return;
    this.emit();
    if (this.holds.size === 0) await this.finish();
  }

  /** Open a recording under the best label currently held. */
  private async begin(): Promise<void> {
    const c = this.controls;
    if (!c || this.starting || Date.now() < this.backoffUntil) return;
    const practice = this.bestPractice();
    if (!practice) return;

    this.starting = true;
    try {
      await c.start({ practice });
      // `start()` declines without throwing when a sitting is already open, so
      // a resolved promise is not proof that one opened.
      if (!c.isActive()) return;
      this.owns = true;
      this.openedAt = Date.now();
      this.labelledRank = RANK[practice];
    } catch (e) {
      // Ring out of range, or BLE permission gone. Back off rather than retry
      // on every bead for the rest of the mala.
      this.backoffUntil = Date.now() + START_BACKOFF_MS;
      this.holds.clear();
      this.emit();
      console.log(`[sessionDirector] start refused: ${(e as Error).message}`);
    } finally {
      this.starting = false;
    }
  }

  private async finish(): Promise<void> {
    const c = this.controls;
    this.holds.clear();
    const owned = this.owns;
    this.owns = false;
    this.labelledRank = 0;
    this.emit();
    if (!c || !owned) return;
    try {
      await c.stop();
    } catch (e) {
      console.log(`[sessionDirector] stop failed: ${(e as Error).message}`);
    }
  }

  /** Upgrade the label if a more specific practice has joined. Never downgrades. */
  private async relabel(): Promise<void> {
    const c = this.controls;
    const practice = this.bestPractice();
    if (!c || !practice) return;
    if (RANK[practice] <= this.labelledRank) return;
    this.labelledRank = RANK[practice];
    await c.setPractice(practice);
  }

  private bestPractice(): SessionKind | null {
    let best: SessionKind | null = null;
    for (const h of this.holds.values()) {
      if (best == null || RANK[h.practice] > RANK[best]) best = h.practice;
    }
    return best;
  }

  /** Expire stale automatic holds, and enforce the cap on automatic-only runs. */
  private sweep(): void {
    const now = Date.now();
    let changed = false;
    for (const [id, h] of [...this.holds]) {
      if (h.auto && now - h.lastSignalAt >= IDLE_RELEASE_MS) {
        this.holds.delete(id);
        changed = true;
      }
    }

    // The cap applies only while nothing deliberate is holding the recording.
    const manual = this.anyManualHold();
    if (!manual && this.owns && this.openedAt > 0 && now - this.openedAt >= MAX_AUTO_SESSION_MS) {
      this.backoffUntil = now + POST_CAP_COOLDOWN_MS;
      void this.finish();
      return;
    }

    if (changed) this.emit();
    if (changed && this.holds.size === 0) void this.finish();
  }
}

export const sessionDirector = new SessionDirector();

/**
 * Re-render when the holds change.
 *
 * `useSyncExternalStore` rather than a `useState`/`useEffect` pair because the
 * holds are read during render — a bar asks "am I held?" to decide whether its
 * control says Stop or Add — and this is the API that guarantees the value
 * read while rendering is the one subscribed to.
 */
export const useHolds = (): number =>
  useSyncExternalStore(
    (fn) => sessionDirector.subscribe(fn),
    () => sessionDirector.version,
    () => sessionDirector.version,
  );
