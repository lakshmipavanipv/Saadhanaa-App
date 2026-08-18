/**
 * HealthScores — the four composite wellness scores shown on the Home grid
 * (Stress / Sleep / Heart / Lung), derived from measured vitals only.
 *
 * Previously this maths lived inline in DashboardScreen while the AI plan
 * engine used placeholder constants, so the two could disagree about the same
 * body. Both now call this module, and every score is `null` until the ring
 * has supplied the readings it needs — there is no default value.
 */

import { computeHealthDashboard } from './HealthDashboard';
import { computeSleepScore } from './SleepScore';

export interface HealthBoxScores {
  /** 0-100, higher = calmer. Needs HRV + resting BPM. */
  stress: number | null;
  /** 0-100 from the sleep-score module. Needs at least one scored night. */
  sleep: number | null;
  /** 0-100 composite of HRV and resting heart rate. */
  heart: number | null;
  /** 0-100 mapped from SpO2. */
  lung: number | null;
}

const clamp100 = (n: number): number => Math.max(0, Math.min(100, Math.round(n)));

export const computeHealthBoxes = async (): Promise<HealthBoxScores> => {
  let stress: number | null = null;
  let heart: number | null = null;
  let lung: number | null = null;

  try {
    const dash = await computeHealthDashboard();
    const [bpm, hrv, spo2] = dash.metrics;   // order fixed in HealthDashboard

    // Stress: low HRV and an elevated resting rate both cost points.
    if (hrv.today > 0 && bpm.today > 0) {
      stress = clamp100(
        100
        - (hrv.today < 30 ? (30 - hrv.today) * 2 : 0)
        - Math.max(0, bpm.today - 65) * 1.5
      );
    }

    // Heart: HRV (60 ms ⇒ full marks) weighted 55%, resting HR 45%.
    if (hrv.today > 0 && bpm.today > 0) {
      heart = clamp100(
        ((hrv.today / 60) * 100) * 0.55 +
        (100 - Math.max(0, bpm.today - 60) * 1.5) * 0.45
      );
    }

    // Lung: SpO2 90% ⇒ 0, 95% ⇒ 50, 100% ⇒ 100.
    if (spo2.today > 0) {
      lung = clamp100((spo2.today - 90) * 10);
    }
  } catch {
    /* DB not ready — every score stays null. */
  }

  let sleep: number | null = null;
  try {
    const s = await computeSleepScore();
    sleep = s.hasData ? s.score : null;
  } catch {
    /* no scored nights yet */
  }

  return { stress, sleep, heart, lung };
};
