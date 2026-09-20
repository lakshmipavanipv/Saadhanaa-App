/**
 * PracticeGoals — daily minute targets for yoga and meditation, read from and
 * written to Plan Your Wellbeing.
 *
 * The same contract japa has: the target shown on a card IS the plan. There is
 * no second store, because two stores disagree the moment one is edited and
 * the user has no way of telling which the progress bar is using.
 *
 * Simpler than japa's, for one reason: a yoga or meditation commitment is
 * always minutes. Japa needed a unit picker because "three malas" and "twenty
 * minutes" are both natural ways to commit to it and neither converts into the
 * other. Nobody commits to "three yogas".
 */

import { routineRepo, type RoutineItem, type RoutineCategory } from '../../services/routineRepo';

/** The planner's name for each practice. 'meditate', not 'meditation'. */
export const PLAN_CATEGORY = {
  yoga: 'yoga' as RoutineCategory,
  meditation: 'meditate' as RoutineCategory,
};

export type SoulPractice = keyof typeof PLAN_CATEGORY;

export interface PracticeGoal {
  /** Committed minutes for today, or null when nothing is planned. */
  minutes: number | null;
  /** The commitments that make it up — their names, for the card's subtitle. */
  names: string[];
  items: RoutineItem[];
}

const EMPTY: PracticeGoal = { minutes: null, names: [], items: [] };

/**
 * Today's commitment for a practice.
 *
 * `routineRepo.today()` already filters to the current weekday, so a
 * Tuesday-only sadhana is not counted as missed on a Wednesday. Several
 * commitments sum, exactly as japa's do.
 */
export async function practiceGoalToday(practice: SoulPractice): Promise<PracticeGoal> {
  let items: RoutineItem[];
  try {
    items = (await routineRepo.today()).filter((i) => i.category === PLAN_CATEGORY[practice]);
  } catch {
    return EMPTY;
  }
  if (!items.length) return EMPTY;

  const minutes = items.reduce((a, i) => a + (i.durationMin || 0), 0);
  return {
    minutes: minutes > 0 ? minutes : null,
    names: items.map((i) => i.name),
    items,
  };
}

export type GoalSave =
  | { ok: true; created: boolean }
  /** Several commitments share today's target, so one number cannot be split. */
  | { ok: false; reason: 'ambiguous'; items: number };

/**
 * Write a minute target back into the plan.
 *
 * Same three cases as japa, and the middle one is the reason the rule exists:
 * when the card's figure is the SUM of several commitments, being told the
 * total is now forty says nothing about which of them gained the ten. Rather
 * than edit one silently, it refuses and the caller offers the planner.
 */
export async function savePracticeGoal(
  practice: SoulPractice, minutes: number,
): Promise<GoalSave> {
  const { items } = await practiceGoalToday(practice);

  if (items.length > 1) return { ok: false, reason: 'ambiguous', items: items.length };

  if (items.length === 1) {
    await routineRepo.update(items[0].id, { durationMin: minutes, goalUnit: 'min', goalValue: minutes });
    return { ok: true, created: false };
  }

  await routineRepo.add({
    category: PLAN_CATEGORY[practice],
    name: practice === 'yoga' ? 'Yoga' : 'Meditation',
    durationMin: minutes,
    goalUnit: 'min',
    goalValue: minutes,
    frequency: 'daily',
    custom: false,
  });
  return { ok: true, created: true };
}
