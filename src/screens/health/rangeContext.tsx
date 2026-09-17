/**
 * Shared Day / Week / Month range for every practice and report screen.
 *
 * WHY THIS IS SHARED STATE
 *
 * Each health detail screen used to hold its own `useState` for the view and
 * the selected day. That is fine while a screen is an island, but the moment
 * the same control appears on Japa, Yoga, Meditate, Exercise and the Health
 * reports, per-screen state means five calendars that quietly disagree:
 * choose Tuesday in Japa, open Health, and it is showing today again with no
 * indication that the day changed under you. A date is one idea, so it is one
 * piece of state.
 *
 * Deliberately NOT persisted. The range is a way of looking at the data, not
 * a setting: coming back to the app tomorrow and finding it still pinned to
 * last Tuesday would be worse than starting on today every time.
 *
 * `selected` is an ISO day string (YYYY-MM-DD) in local time, matching the
 * keys the history and vitals code already buckets by, so nothing has to
 * convert between representations.
 */

import React, { createContext, useContext, useMemo, useState } from 'react';
import type { HealthView } from './HealthPrimitives';

/**
 * Re-exported so callers of this context have the day helper to hand. The
 * implementation is `utils.isoDayOf` — there were six separate copies of this
 * four-line function across the health screens, which is six places for a
 * timezone bug to hide.
 */
import { isoDayOf as isoDay } from '../../utils';
export { isoDay };

interface RangeValue {
  view: HealthView;
  setView: (v: HealthView) => void;
  /** Selected day, ISO YYYY-MM-DD, local time. */
  selected: string;
  setSelected: (iso: string) => void;
  /** How many days the current view spans — 1 / 7 / 30. */
  spanDays: number;
}

const RangeContext = createContext<RangeValue | null>(null);

export const RangeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(() => isoDay(new Date()));

  const value = useMemo<RangeValue>(() => ({
    view,
    setView,
    selected,
    setSelected,
    spanDays: view === 'month' ? 30 : view === 'week' ? 7 : 1,
  }), [view, selected]);

  return <RangeContext.Provider value={value}>{children}</RangeContext.Provider>;
};

/**
 * Read the shared range.
 *
 * Falls back to its own local state when no provider is above it, so a screen
 * rendered outside the tree — a modal opened straight from a deep link, a
 * test — still works instead of throwing. It simply will not stay in step
 * with the other tabs, which is the correct degradation.
 */
export const useRange = (): RangeValue => {
  const ctx = useContext(RangeContext);
  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(() => isoDay(new Date()));
  const fallback = useMemo<RangeValue>(() => ({
    view, setView, selected, setSelected,
    spanDays: view === 'month' ? 30 : view === 'week' ? 7 : 1,
  }), [view, selected]);
  return ctx ?? fallback;
};
