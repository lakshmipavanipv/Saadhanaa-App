/**
 * SoulsyncContext — one sitting, app-wide.
 *
 * WHY THIS EXISTS
 *
 * `useSoulsyncSession()` was called independently by five places: JapaScreen,
 * YogaScreen, MeditationScreen, YogaMeditationWrapper, and SoulsyncSessionBar's
 * own private fallback. Each call mints a separate state machine, so there was
 * no answer anywhere to the question "is a sitting running right now?" — only
 * five local opinions, and a session started on one screen was invisible to
 * every other.
 *
 * That was survivable while every session began with a deliberate tap on the
 * screen you were already looking at. It stops being survivable the moment a
 * session can start on its own: something has to own the one sitting, and the
 * bar on every screen has to be showing that same sitting's state rather than
 * its own idea of one.
 *
 * So the hook is lifted here, mounted once above the navigator, and everything
 * else reads it.
 *
 * WHAT DID NOT CHANGE
 *
 * The hook itself. This is a container, not a rewrite — `useSoulsync()` returns
 * exactly what `useSoulsyncSession()` returned, so every existing call site
 * behaves the same beyond now sharing state with its siblings.
 */

import React, { createContext, useContext, useEffect, useRef } from 'react';
import { useSoulsyncSession } from './hooks/useSoulsyncSession';
import { autoSession } from './services/autoSession';

export type SoulsyncValue = ReturnType<typeof useSoulsyncSession>;

const SoulsyncContext = createContext<SoulsyncValue | null>(null);

export const SoulsyncProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const session = useSoulsyncSession();

  /**
   * Hand the one session to the auto-starter.
   *
   * Everything here goes through a ref, and the effect has no dependencies, so
   * the controls are registered exactly once for the life of the app.
   *
   * Both halves of that matter. Reading `state.active` through a ref means
   * `isActive()` answers with the truth at call time rather than with whatever
   * was true when the controls were registered — a stale `false` would have
   * every bead trying to open a second session on top of the first. And the
   * empty dependency list matters because `start`/`stop` are rebuilt whenever
   * `state.active` flips: an effect keyed on them would re-run — and so run its
   * `detach()` cleanup — immediately after an auto-start succeeded, wiping the
   * record of which trigger owns the sitting and disarming the idle timer that
   * is supposed to end it.
   */
  const sessionRef = useRef(session);
  sessionRef.current = session;

  useEffect(() => {
    autoSession.attach({
      start: (meta) => sessionRef.current.start(meta),
      stop: () => sessionRef.current.stop(),
      // The hook's ref-backed answer, not `state.active` — the latter is a
      // render behind, so a check made right after `start()` resolves would
      // read false and conclude the session had not opened.
      isActive: () => sessionRef.current.isActive(),
    });
    return () => autoSession.detach();
  }, []);

  return <SoulsyncContext.Provider value={session}>{children}</SoulsyncContext.Provider>;
};

/**
 * The app's one Soul Sync sitting.
 *
 * Falls back to a private instance when no provider is above it, matching how
 * `useRange` degrades: a screen rendered outside the tree still works, it just
 * will not be the shared sitting. Nothing should rely on that path — it exists
 * so a deep-linked modal or a test cannot crash.
 */
export const useSoulsync = (): SoulsyncValue => {
  const ctx = useContext(SoulsyncContext);
  const fallback = useSoulsyncSession();
  return ctx ?? fallback;
};
