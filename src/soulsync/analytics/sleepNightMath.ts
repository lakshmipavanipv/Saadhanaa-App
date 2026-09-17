/**
 * sleepNightMath — the one place the night-level sleep arithmetic lives.
 *
 * WHY IT EXISTS
 *
 * `awakenings * 5` was written out three separate times — SleepScore,
 * ScoreTrends and JapaEffect — each deriving a time-awake figure and an
 * "efficiency" from it independently. Three copies of one assumption is three
 * chances to change one and forget the others, and it had already produced
 * subtly different sleep numbers on different screens.
 *
 * WHAT THE ASSUMPTION ACTUALLY IS
 *
 * The ring reports how many times you woke, never for how long. Five minutes
 * per awakening is an assumption, not a measurement, and it is named here
 * rather than buried mid-expression so it can be found and argued with.
 *
 * WHY "EFFICIENCY" WAS THE WRONG WORD
 *
 * The old code did:
 *
 *     wasoMin    = awakenings * 5
 *     inBedMin   = totalMin + wasoMin
 *     efficiency = totalMin / inBedMin * 100
 *
 * Sleep efficiency means time asleep over time *in bed*, and time in bed is
 * not recorded — `SleepRow` stores a bedtime minute and a total, with no wake
 * time. Reconstructing the denominator from the numerator plus a guess makes
 * the result a function of `awakenings` alone: a seven-hour night with four
 * awakenings always lands near 96%, however restless it truly was. It looked
 * like a measured efficiency and behaved like a constant, which inflated the
 * sleep score for everyone.
 *
 * So the quantity keeps its information and loses the false name. More
 * awakenings genuinely does mean a more broken night — that part is real, and
 * it is reported as restlessness, which is what it measures.
 */

/**
 * Minutes assumed awake per recorded awakening.
 *
 * Sleep-lab scoring counts an awakening from about 30 seconds upward, and
 * brief arousals dominate; five minutes is a deliberately middling figure for
 * a consumer ring that cannot see the difference. Treat any number derived
 * from it as indicative.
 */
export const WAKE_MINUTES_PER_AWAKENING = 5;

/** Estimated minutes awake after first falling asleep. Indicative, not measured. */
export const estimatedWasoMin = (awakenings: number): number =>
  Math.max(0, Math.round(awakenings)) * WAKE_MINUTES_PER_AWAKENING;

/**
 * How broken the night was, 0-100, where 100 is undisturbed.
 *
 * Derived from awakenings against the time actually slept, so waking four
 * times in ten hours scores better than waking four times in five — which is
 * correct, and which a raw count cannot express.
 *
 * Returns null when there is no sleep to judge, rather than a flattering 100.
 */
export const restlessnessScore = (totalSleepMin: number, awakenings: number): number | null => {
  if (!totalSleepMin || totalSleepMin <= 0) return null;
  const waso = estimatedWasoMin(awakenings);
  const pct = (totalSleepMin / (totalSleepMin + waso)) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
};

/**
 * Time in bed, when it can be known.
 *
 * Always null today: nothing records when the user got up. It exists so that
 * callers ask the question and get an honest "unknown" instead of quietly
 * reconstructing a denominator out of the numerator.
 */
export const inBedMinutes = (): number | null => null;
