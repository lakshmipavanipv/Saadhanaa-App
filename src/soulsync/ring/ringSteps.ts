/**
 * One-shot helper: pull today's step total from the paired SR16.
 *
 * Connects (keepAlive off so the ring's touch-cycle isn't blocked),
 * runs {5,2,16} historical sync, filters samples to today, sums them,
 * disconnects. Non-blocking — safe to call from a UI effect.
 *
 * If no ring is paired or the connect fails, returns null so the caller
 * can fall back to the phone pedometer without a UI error.
 */

import { SadhanaRing } from './SadhanaRing';
import { readSr16DeviceId } from './japaCounter';
import type { StepSample } from './sync';

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
    ring = await SadhanaRing.connect(deviceId, { keepAlive: false });
  } catch {
    return null;
  }

  try {
    const res = await ring.sync.sync<StepSample>('steps');
    const today = new Date();
    const today0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const tomorrow0 = today0 + 24 * 60 * 60 * 1000;

    let steps = 0, calorieKcal = 0, distanceKm = 0, sampleCount = 0;
    for (const s of res.samples) {
      const t = s.timestamp.getTime();
      if (t < today0 || t >= tomorrow0) continue;
      steps += s.steps;
      calorieKcal += s.calorieKcal;
      distanceKm += s.distanceKm;
      sampleCount++;
    }
    return { steps, calorieKcal, distanceKm, sampleCount };
  } catch {
    return null;
  } finally {
    await ring.disconnect().catch(() => {});
  }
}
