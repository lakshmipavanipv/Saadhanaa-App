/**
 * HealthScores — the adapter between stored readings and the scoring model.
 *
 * This module gathers inputs and nothing else; every judgement about what a
 * reading is worth lives in `HealthScoreModel`, which is pure and carries its
 * thresholds and sources beside them. Keeping the two apart means the model
 * can be reasoned about, and changed, without touching storage.
 *
 * The maths used to live here inline — constants chosen by feel, with no age
 * adjustment and no personal baseline. HealthScoreModel's header records what
 * was wrong with each of them.
 *
 * Every score stays null until the ring has supplied the readings it needs.
 * There is no default value, and no score is ever invented.
 */

import { computeHealthDashboard } from './HealthDashboard';
import { computeSleepScore } from './SleepScore';
import {
  heartScore, lungScore, stressScore, bandWord,
  type Score,
} from './HealthScoreModel';

export interface HealthBoxScores {
  /** 0-100, higher = calmer. Needs HRV or resting BPM. */
  stress: number | null;
  /** 0-100. Needs at least one scored night. */
  sleep: number | null;
  /** 0-100 from resting rate and HRV against age/sex norms. */
  heart: number | null;
  /** 0-100 from SpO2, anchored on clinical thresholds. */
  lung: number | null;
}

/** The scores plus their reasoning, for screens that explain themselves. */
export interface HealthBoxDetail {
  stress: Score;
  sleep: Score;
  heart: Score;
  lung: Score;
  /** One word per tile — "calm", "good", "low", "no data". */
  words: Record<'stress' | 'sleep' | 'heart' | 'lung', string>;
}

/**
 * Years from a stored ISO date of birth. Null when unset, so the model falls
 * back to the cohort midpoint rather than pretending to know.
 */
export const ageFromDob = (dob?: string | null): number | null => {
  if (!dob) return null;
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 && age < 120 ? age : null;
};

const modelSex = (gender?: string | null): 'male' | 'female' | undefined =>
  gender === 'male' || gender === 'female' ? gender : undefined;

export interface ProfileBits {
  dob?: string | null;
  gender?: string | null;
}

/**
 * Compute all four, with reasoning.
 *
 * `profile` is optional: without it the model uses cohort-midpoint references,
 * which is honest but less accurate. Callers holding the user's profile should
 * pass it — HRV norms nearly halve between 25 and 60, so age is the single
 * input that most changes the answer.
 */
export const computeHealthDetail = async (profile?: ProfileBits): Promise<HealthBoxDetail> => {
  const age = ageFromDob(profile?.dob);
  const sex = modelSex(profile?.gender);

  const pending = (why: string): Score => ({ value: null, band: null, basis: why });

  let heart: Score = pending('Readings not available yet.');
  let lung: Score = pending('Readings not available yet.');
  let stress: Score = pending('Readings not available yet.');

  try {
    const dash = await computeHealthDashboard();
    const [bpm, hrv, spo2] = dash.metrics;   // order fixed in HealthDashboard
    const val = (v: number) => (v > 0 ? v : null);
    /*
     * Fall back from today to the 30-day baseline when today is empty.
     *
     * Before: Heart / Lung / Stress read strictly today's numbers. A day
     * the ring was off the hand for the morning, or a phone cold-started
     * before any new reading had arrived, left all three tiles showing
     * "—" even though the Body & Soul Health Score hero beside them
     * cheerfully reported a number derived from the same user's weekly
     * baseline. Two tiles reading the same person should not disagree
     * about whether that person has data.
     *
     * `pick()` mirrors the fallback the hero already uses
     * (SoulsyncScoreCard.computeScores) so the tiles and the hero draw
     * from the same ground truth.
     */
    const pick = (today: number, baseline: number): number | null =>
      today > 0 ? today : (baseline > 0 ? baseline : null);

    heart = heartScore({
      restingBpm: pick(bpm.today,  bpm.baseline),
      rmssd:      pick(hrv.today,  hrv.baseline),
      age, sex,
    });
    lung = lungScore(pick(spo2.today, spo2.baseline));

    // Stress still prefers today's live reading because that is what
    // "stress right now" means — but if today has no reading at all,
    // fall back to the baseline so the tile is populated rather than
    // blank. Baselines on the right side keep their meaning: they are
    // what today's reading is being judged against.
    stress = stressScore({
      rmssd:      pick(hrv.today, hrv.baseline),
      restingBpm: pick(bpm.today, bpm.baseline),
      baselineRmssd: dash.hasNormalcyData ? val(hrv.baseline) : null,
      baselineBpm:   dash.hasNormalcyData ? val(bpm.baseline) : null,
      age, sex,
    });
  } catch {
    /* DB not ready — these stay null. */
  }

  let sleep: Score = pending('No scored night yet.');
  try {
    const s = await computeSleepScore();
    if (s.hasData) {
      // SleepScore is used as it stands, not re-derived here. It already
      // weights duration against the NSF window, efficiency, deep and REM
      // proportions, overnight HRV and time awake — strictly more than
      // duration and efficiency alone, which is all this module could offer.
      // Re-scoring it would throw the stage data away to make the number
      // look consistent with the other three, which is the wrong trade.
      sleep = {
        value: s.score,
        band: s.score >= 80 ? 'excellent' : s.score >= 60 ? 'good' : s.score >= 40 ? 'fair' : 'low',
        basis: `${s.label} — duration, efficiency, deep and REM share, overnight HRV and time awake.`,
      };
    }
  } catch {
    /* no scored nights yet */
  }

  return {
    stress, sleep, heart, lung,
    words: {
      stress: bandWord(stress, 'stress'),
      sleep: bandWord(sleep, 'sleep'),
      heart: bandWord(heart, 'heart'),
      lung: bandWord(lung, 'lung'),
    },
  };
};

/** Numbers only — the shape existing callers already expect. */
export const computeHealthBoxes = async (profile?: ProfileBits): Promise<HealthBoxScores> => {
  const d = await computeHealthDetail(profile);
  return { stress: d.stress.value, sleep: d.sleep.value, heart: d.heart.value, lung: d.lung.value };
};
