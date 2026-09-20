/**
 * JapaPlan — what the practitioner committed to, as opposed to what they did.
 *
 * WHERE THE TARGET COMES FROM
 *
 * Plan Your Wellbeing writes real commitments into `routineRepo`: each japa
 * item carries the minutes intended per occurrence, the days it applies to,
 * and — for a Sadhana Path — the steps it is made of, each with a value and a
 * unit ('malas', 'japas', 'min' or 'count').
 *
 * So the target is something the user actually set. This module only reads it.
 * Nothing here invents a goal, and when nothing has been planned it returns
 * null rather than a default, so the UI can say "no plan set" instead of
 * marking the user against a number they never chose.
 *
 * CUMULATIVE ACROSS DEITIES
 *
 * `routineRepo.today()` returns every japa item scheduled for the current
 * weekday, and this sums all of them. Two malas of Tara and three of Chandi is
 * a target of five — one figure for the day's japa, not one per deity, because
 * the Japa tab shows one counter.
 *
 * WHY MALAS AND MINUTES ARE READ SEPARATELY
 *
 * A japa commitment is sometimes "twenty minutes" and sometimes "three malas",
 * and the two are not convertible: how long three malas take is exactly the
 * thing the app refuses to assume (see analytics/JapaTime for why `japas * 6`
 * was removed). A plan can therefore have a time target, a mala target, both,
 * or neither, and each is reported on its own.
 */

import { routineRepo, type RoutineItem } from '../../services/routineRepo';

const BEADS_PER_MALA = 108;

export interface JapaPlanTarget {
  /** Minutes committed for the day, or null when the plan sets no time. */
  minutes: number | null;
  /** Malas committed for the day, or null when the plan counts in time only. */
  malas: number | null;
  /** How many planned japa items apply today. */
  items: number;
  /** Their names, for the "what you planned" line. */
  names: string[];
}

const EMPTY: JapaPlanTarget = { minutes: null, malas: null, items: 0, names: [] };

/**
 * Malas a single routine item asks for. Null when it counts in time only.
 *
 * TWO WAYS A PLAN CAN EXPRESS MALAS
 *
 *   goalUnit: 'malas'   a plain japa commitment — "three malas of Tara".
 *   steps[]             a Sadhana Path, where each step carries its own count
 *                       and the item's target is their sum.
 *
 * A Sadhana Path's steps win when both are present: they are the more specific
 * statement, and their sum IS the item's target rather than a second one.
 */
const malasIn = (item: RoutineItem): number | null => {
  if (item.steps?.length) {
    let malas = 0;
    let found = false;
    for (const st of item.steps) {
      if (st.unit === 'malas') { malas += st.value; found = true; }
      // A step counted in raw beads is the same commitment in other units.
      else if (st.unit === 'japas') { malas += st.value / BEADS_PER_MALA; found = true; }
    }
    if (found) return Math.round(malas * 10) / 10;
  }
  if (item.goalUnit === 'malas' && (item.goalValue ?? 0) > 0) {
    return item.goalValue as number;
  }
  return null;
};

/**
 * Today's japa commitment.
 *
 * `routineRepo.today()` already filters to items scheduled for the current
 * weekday, so a Tuesday-only sadhana does not show as missed on a Wednesday.
 */
export async function japaPlanToday(): Promise<JapaPlanTarget> {
  let items: RoutineItem[];
  try {
    items = (await routineRepo.today()).filter((i) => i.category === 'japa');
  } catch {
    return EMPTY;
  }
  if (!items.length) return EMPTY;

  let minutes = 0;
  let minutesSet = false;
  let malas = 0;
  let malasSet = false;

  for (const i of items) {
    // An item whose goal is malas carries a placeholder durationMin, which is
    // not a commitment the user made and must not be added to a time target.
    const countsTime = i.goalUnit !== 'malas';
    if (countsTime && i.durationMin > 0) { minutes += i.durationMin; minutesSet = true; }

    const m = malasIn(i);
    if (m != null) { malas += m; malasSet = true; }
  }

  return {
    minutes: minutesSet ? Math.round(minutes) : null,
    malas: malasSet ? Math.round(malas * 10) / 10 : null,
    items: items.length,
    names: items.map((i) => i.name),
  };
}

/** Today's japa routine items, for callers that need to edit them. */
export async function japaItemsToday(): Promise<RoutineItem[]> {
  try {
    return (await routineRepo.today()).filter((i) => i.category === 'japa');
  } catch {
    return [];
  }
}

export type JapaGoalSave =
  | { ok: true; created: boolean }
  /**
   * Several japa commitments share today's target and no deity was named, so
   * one number cannot be split back between them. Naming a deity resolves it.
   */
  | { ok: false; reason: 'ambiguous'; items: number };

/** Today's commitment for one deity, if there is one. Matched by name. */
export const japaItemFor = (items: RoutineItem[], deityName?: string | null) =>
  deityName
    ? items.find((i) => i.name.trim().toLowerCase() === deityName.trim().toLowerCase())
    : undefined;

/**
 * Write a japa goal back into Plan Your Wellbeing.
 *
 * WHEN A DEITY IS NAMED
 *
 * The goal belongs to that deity alone: its commitment is edited, or created
 * if it has none. The other deities' targets are untouched, and the figure on
 * the Japa card — which is their sum — moves by exactly what was changed.
 * This is why the editor carries a deity picker: without one, a single number
 * had to stand for every commitment at once.
 *
 * WHEN NONE IS NAMED
 *
 *   no items    one is created, unattributed
 *   one item    it is edited, since there is nothing to confuse it with
 *   several     refused — the card's target is their sum, and being told the
 *               total is now seven says nothing about which deity gained the
 *               two. Editing the first silently, or splitting the difference,
 *               would put numbers in the user's plan that they did not choose.
 */
export async function saveJapaGoal(
  unit: 'min' | 'malas', value: number, deityName?: string | null,
): Promise<JapaGoalSave> {
  const items = await japaItemsToday();

  // durationMin stays minutes-only, so a mala target never leaks into the
  // app's time accounting. 15 is the placeholder for "not timed".
  const durationMin = unit === 'min' ? value : 15;
  const patch = { goalUnit: unit, goalValue: value, durationMin };

  if (deityName) {
    const mine = japaItemFor(items, deityName);
    if (mine) {
      await routineRepo.update(mine.id, patch);
      return { ok: true, created: false };
    }
    await routineRepo.add({
      category: 'japa', name: deityName.trim(), frequency: 'daily', custom: false, ...patch,
    });
    return { ok: true, created: true };
  }

  if (items.length > 1) return { ok: false, reason: 'ambiguous', items: items.length };

  if (items.length === 1) {
    await routineRepo.update(items[0].id, patch);
    return { ok: true, created: false };
  }

  await routineRepo.add({
    category: 'japa', name: 'Japa', frequency: 'daily', custom: false, ...patch,
  });
  return { ok: true, created: true };
}
