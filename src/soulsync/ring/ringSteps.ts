/**
 * One-shot helper: pull today's step total from the paired SR16.
 *
 * Connects, reads BOTH step channels ({5,2,16} and {5,26,16}), filters to today,
 * disconnects. Non-blocking — safe to call from a UI effect.
 *
 * If no ring is paired or the connect fails, returns null so the caller
 * can fall back to the phone pedometer without a UI error.
 */

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import type { StepSample } from './sync';
import { upsertRingSteps } from './ringVitalsSync';

export interface RingStepsToday {
  steps: number;
  calorieKcal: number;
  distanceKm: number;
  sampleCount: number;
}

/**
 * Returns null if the ring isn't paired, can't be reached, or hasn't
 * recorded any steps today. Caller should fall back to the phone
 * pedometer in either case.
 */
export async function getRingStepsToday(): Promise<RingStepsToday | null> {
  const deviceId = await readSr16DeviceId();
  if (!deviceId) return null;

  let ring: SadhanaRing | null = null;
  try {
    ring = await SadhanaRing.connect(deviceId);
  } catch {
    return null;
  }

  try {
    /*
     * BOTH step channels, as the full vitals sync does.
     *
     * This read only {5,2,16}. In the RWfit capture that channel answered
     * with data 3 times out of 36, while {5,26,16} — the Jieli-platform
     * second steps channel — answered 24 times and carried up to 163 bytes.
     * So the Exercise tab's own read was asking the quiet channel and usually
     * getting nothing back, which is why its day chart stayed empty even with
     * the ring connected and a step total on screen: that total had come from
     * the full sync, which reads both.
     *
     * Same record layout, so the samples merge and `foldStepSamples` settles
     * any overlap — the daily running total is a floor, never an addend.
     */
    const [res, res2] = await Promise.all([
      ring.sync.sync<StepSample>('steps').catch(() => ({ samples: [] as StepSample[] })),
      ring.sync.sync<StepSample>('steps2').catch(() => ({ samples: [] as StepSample[] })),
    ]);
    const samples: StepSample[] = [...res.samples, ...res2.samples];
    const today = new Date();
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrow0 = today0 + 24 * 60 * 60 * 1000;

    let steps = 0, calorieKcal = 0, distanceKm = 0, sampleCount = 0;
    /*
     * Logged so the ring's own counting can be checked against a walk of
     * known length, which is the only way to test a step counter:
     *   adb logcat -s ReactNativeJS:V | grep STEPCHECK
     *
     * Both figures are printed — the ring's running total and the sum of its
     * hourly buckets — because they should agree to within the current
     * part-hour, and a persistent gap between them means the records are being
     * read wrongly rather than the walking being miscounted.
     */
    const ringTotal = samples
      .filter((x) => x.isDailyTotal)
      .reduce((a, x) => Math.max(a, x.steps), 0);

    for (const s of samples) {
      // The running daily total already contains the hourly records beside
      // it; adding both reports roughly double. See decodeSteps.
      if (s.isDailyTotal) continue;
      const t = s.timestamp.getTime();
      if (t < today0 || t >= tomorrow0) continue;
      steps += s.steps;
      calorieKcal += s.calorieKcal;
      distanceKm += s.distanceKm;
      sampleCount++;
    }
     
    console.log(
      `[STEPCHECK] ring running total=${ringTotal}  hourly sum=${steps}  ` +
      `records=${samples.length}  reporting=${Math.max(steps, ringTotal)}`
    );

    /*
     * Persist what was just read.
     *
     * This used to return the totals and drop the records, so the Exercise
     * tab could show "3,495 steps today" and, directly underneath, "no
     * hour-by-hour steps for this day yet" — the hours had been in hand and
     * were thrown away. `upsertRingSteps` writes both the daily row and the
     * hourly ones, and it is the same function the full vitals sync uses, so
     * the two paths cannot disagree about what a day's steps are.
     */
    try {
      await upsertRingSteps(samples);
    } catch {
      // The figures above are still returned; only the chart goes without.
    }

    return { steps: Math.max(steps, ringTotal), calorieKcal, distanceKm, sampleCount };
  } catch {
    return null;
  } finally {
    await ring.disconnect().catch(() => {});
  }
}
