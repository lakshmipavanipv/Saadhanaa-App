/**
 * JapaTotals — ONE place that answers "how many malas", for every screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHY THE NUMBERS DISAGREED
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Finishing one mala wrote to THREE separate counters:
 *
 *   history[]                    a dated row: date, deity, malas, japas
 *   deityProgress[id].malas      a per-deity running total, no dates
 *   deity.totalMalas             another per-deity running total, no dates
 *
 * Every screen then picked whichever it fancied, and they could not agree:
 *
 *   • The bead graphic showed `deityProgress[id].malas` — that deity's total
 *     since it was first counted. It read "5 malas" on a day with one, and it
 *     did not move when the range changed to Week or Month, because it has no
 *     dates in it to filter by.
 *
 *   • The daily tile summed today's `history` rows. Correct, and therefore
 *     different from the graphic beside it.
 *
 *   • The deity breakdown showed `deityProgress[id].malas + deity.totalMalas`
 *     — the same lifetime count added to itself. Not merely out of step:
 *     exactly double.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE RULE NOW
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `history` is the historical table for malas. Every completed mala is one
 * dated row in it, with the deity it was for. It is the only store with dates,
 * so it is the only one that can answer a question about a day, a week or a
 * month — and therefore it is the only one anything reads.
 *
 * The other two are not deleted (other code still writes them, and a migration
 * that silently dropped a user's totals would be worse than the drift), but
 * nothing displays them any more. The one part of `deityProgress` that stays
 * useful is `.count`: beads tapped toward a mala that is not finished yet,
 * which by definition cannot be in `history`.
 *
 * WHY EVERY FIGURE COMES FROM ONE FUNCTION
 *
 * "Make them agree" is not something that can be done once. Two screens
 * summing the same rows their own way drift the moment either is edited. One
 * function cannot disagree with itself.
 */

import type { HistoryEntry } from '../../types';

export interface DeityTotal {
  deityId: string;
  deity: string;
  malas: number;
  japas: number;
}

export interface JapaTotals {
  /** Malas completed in the window. */
  malas: number;
  /** Beads from those completed malas. Excludes the one in progress. */
  japas: number;
  /** How many separate sittings were recorded. */
  entries: number;
  /** Per deity, biggest first. Only deities with something in the window. */
  byDeity: DeityTotal[];
}

const EMPTY: JapaTotals = { malas: 0, japas: 0, entries: 0, byDeity: [] };

/**
 * Totals over an inclusive date window.
 *
 * @param fromIso YYYY-MM-DD, inclusive. Omit with `toIso` for all of history.
 * @param toIso   YYYY-MM-DD, inclusive.
 *
 * String comparison is correct here because ISO dates sort lexicographically,
 * and it avoids building a Date per row — this runs on every render of the
 * Japa tab.
 */
export function japaTotals(
  history: HistoryEntry[] | undefined,
  fromIso?: string,
  toIso?: string,
): JapaTotals {
  if (!history?.length) return EMPTY;

  let malas = 0;
  let japas = 0;
  let entries = 0;
  const by = new Map<string, DeityTotal>();

  for (const h of history) {
    if (fromIso && h.date < fromIso) continue;
    if (toIso && h.date > toIso) continue;

    malas += h.malas;
    japas += h.japas;
    entries++;

    const id = h.deityId || h.deity || 'unattributed';
    const e = by.get(id) ?? { deityId: id, deity: h.deity || 'Unattributed', malas: 0, japas: 0 };
    e.malas += h.malas;
    e.japas += h.japas;
    by.set(id, e);
  }

  return {
    malas, japas, entries,
    byDeity: [...by.values()].sort((a, b) => b.malas - a.malas || b.japas - a.japas),
  };
}

/** Everything ever recorded. The same function, with no window. */
export const japaLifetime = (history: HistoryEntry[] | undefined): JapaTotals =>
  japaTotals(history);

/**
 * The window the shared Day / Week / Month control is showing.
 *
 * Kept here rather than in each screen so a "week" means the same seven days
 * in the tile, the graphic and the deity list — which is half of what went
 * wrong. Matches analytics/practiceSeries: the window always ENDS on the
 * selected day, and a month is five whole weeks.
 */
export function rangeWindow(
  view: 'day' | 'week' | 'month', selectedIso: string,
): { from: string; to: string } {
  const days = view === 'day' ? 1 : view === 'week' ? 7 : 35;
  const [y, m, d] = selectedIso.split('-').map(Number);
  const end = new Date(y, m - 1, d);
  const start = new Date(end.getTime() - (days - 1) * 86_400_000);
  const p = (n: number) => String(n).padStart(2, '0');
  const iso = (x: Date) => `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
  return { from: iso(start), to: iso(end) };
}

/** "Today", "Last 7 days", "Last 5 weeks" — the same words the chart uses. */
export const rangeLabel = (view: 'day' | 'week' | 'month'): string =>
  view === 'day' ? 'Today' : view === 'week' ? 'Last 7 days' : 'Last 5 weeks';
