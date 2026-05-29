/**
 * VitalsPlanEngine — generates a personalized daily plan for the Plan tab.
 *
 *   "Today, here's a plan tuned to YOUR body and YOUR sadhana history."
 *
 * Inputs (gathered automatically — no caller args needed):
 *   • Age          — derived from UserProfile.dob
 *   • Vitals       — today's ambient BPM / HRV / SpO2 from the ring
 *                    (falls back to DUMMY.ambientToday until the ring syncs)
 *   • Health boxes — Stress, Sleep, Heart, Lung (0-100) — from the
 *                    Soulsync analytics layer (currently DUMMY mirrors them)
 *   • Composite    — Body Health, Soul Depth, Commitment (0-100)
 *   • 7-day actuals — Σ body minutes + Σ soul minutes from the repos
 *
 * Output: VitalsPlan
 *   { walkingMin, yogaMin, japaMin, meditationMin, breathworkMin,
 *     totalMin, notes: string[], rationale: string[] }
 *
 * Algorithm (deterministic rule-based — no ML/network calls):
 *
 *   1. AGE BASELINE — every healthy adult gets a starter quota:
 *        <30:  walk 30 · yoga 20 · japa 15 · meditate 10 · breath  5
 *        <50:  walk 25 · yoga 20 · japa 20 · meditate 15 · breath  5
 *        <70:  walk 20 · yoga 20 · japa 25 · meditate 20 · breath 10
 *        70+:  walk 15 · yoga 15 · japa 30 · meditate 20 · breath 10
 *
 *   2. VITALS NUDGES — add/subtract minutes per signal:
 *        Stress > 60  OR HRV  < 25  →  +5 meditate, +5 breath, gentler yoga
 *        SpO2 < 95                  →  +5 breath (pranayama focus)
 *        Sleep score < 60           →  +5 meditate (4-7-8 pre-bed)
 *        BodyHealthScore < 60       →  +10 walking
 *        SoulDepthScore  < 60       →  +5 japa, +5 meditate
 *        High resting BPM (>80)     →  +5 walking (cardio fitness)
 *
 *   3. HISTORY CORRECTION — last 7 days actuals:
 *        Σ body < 90  → emphasize walking ("low body week")
 *        Σ soul < 90  → emphasize japa   ("low soul week")
 *        Both strong (>180) → MAINTAIN (no inflation, protect joy)
 *
 *   4. CAP — total never exceeds 120 min/day. If over, trim from the
 *      already-strongest bucket. Sadhakas burn out from too much, not
 *      too little.
 *
 * The engine returns 2-4 plain-English `notes` explaining the WHY so
 * the user understands the recommendation isn't arbitrary.
 */

import { exerciseRepo } from '../../services/exerciseRepo';
import { soulActivityRepo } from '../../services/soulActivityRepo';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { DUMMY } from '../../services/dummyData';
import { computeJapaEffect } from '../analytics/JapaEffect';

export interface VitalsPlan {
  walkingMin:    number;
  yogaMin:       number;
  japaMin:       number;
  meditationMin: number;
  breathworkMin: number;
  /** Sum of all five buckets. */
  totalMin:      number;
  /** Plain-English summary lines shown above the plan. */
  notes:         string[];
  /** Bulleted "why" — shown when user taps "Why this plan?". */
  rationale:     string[];
  /** True if computed from real ring data, false if dummy was used. */
  fromRealVitals: boolean;
  /** True if last-7-day history is real, false if zero / dummy. */
  fromRealHistory: boolean;
}

interface PlanInputs {
  ageYears:        number;
  bpm:             number;
  rmssd:           number;     // HRV
  spo2:            number;
  stressScore:     number;     // 0-100, lower = better
  sleepScore:      number;     // 0-100
  bodyHealthScore: number;     // 0-100
  soulDepthScore:  number;     // 0-100
  commitmentScore: number;     // 0-100
  body7dMin:       number;     // last 7 days body minutes
  soul7dMin:       number;     // last 7 days soul minutes
  hasRealVitals:   boolean;
  hasRealHistory:  boolean;
}

const calcAge = (dob?: string): number => {
  if (!dob) return 40;          // sensible default if DOB not set
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return 40;
  const ms = Date.now() - birth.getTime();
  const yrs = ms / (365.25 * 86_400_000);
  return Math.max(10, Math.min(100, Math.round(yrs)));
};

const ageBaseline = (age: number) => {
  if (age < 30)  return { walkingMin: 30, yogaMin: 20, japaMin: 15, meditationMin: 10, breathworkMin:  5 };
  if (age < 50)  return { walkingMin: 25, yogaMin: 20, japaMin: 20, meditationMin: 15, breathworkMin:  5 };
  if (age < 70)  return { walkingMin: 20, yogaMin: 20, japaMin: 25, meditationMin: 20, breathworkMin: 10 };
  return            { walkingMin: 15, yogaMin: 15, japaMin: 30, meditationMin: 20, breathworkMin: 10 };
};

const gatherInputs = async (dob?: string): Promise<PlanInputs> => {
  // ── Age ──
  const ageYears = calcAge(dob);

  // ── Vitals: today's ambient averages from ring (fallback to dummy) ──
  let bpm   = DUMMY.ambientToday.bpm;
  let rmssd = DUMMY.ambientToday.rmssd;
  let spo2  = DUMMY.ambientToday.spo2;
  let hasRealVitals = false;
  try {
    const t = await ambientBaselineRepo.todaysAvg();
    if (t && t.n > 5) {
      bpm   = t.bpm   || bpm;
      rmssd = t.rmssd || rmssd;
      spo2  = t.spo2  || spo2;
      hasRealVitals = true;
    }
  } catch { /* leave dummy */ }

  // ── Composite + health-box scores via JapaEffect snapshot ──
  // JapaEffect provides "Saadhana Score" which is the soul side. Body
  // health + the 4 boxes come from DUMMY today (until the dedicated
  // analytics layer is wired in this build).
  let soulDepthScore  = DUMMY.soulDepthScore;
  try {
    const snap = await computeJapaEffect();
    if (snap?.hasJapaToday) soulDepthScore = snap.score || soulDepthScore;
  } catch { /* fallback */ }

  const stressScore     = DUMMY.healthBoxes.stress;
  const sleepScore      = DUMMY.healthBoxes.sleep;
  const bodyHealthScore = DUMMY.bodyHealthScore;
  const commitmentScore = DUMMY.commitmentScore;

  // ── 7-day actuals from repos ──
  let body7dMin = 0;
  let soul7dMin = 0;
  let hasRealHistory = false;
  try {
    const bodyBreak = await exerciseRepo.breakdown(7);
    body7dMin = bodyBreak.reduce((s, b) => s + b.minutes, 0);
    const soulBreak = await soulActivityRepo.breakdown(7);
    soul7dMin = soulBreak.reduce((s, b) => s + b.minutes, 0);
    hasRealHistory = (body7dMin + soul7dMin) > 0;
  } catch { /* both stay 0 */ }

  return {
    ageYears, bpm, rmssd, spo2,
    stressScore, sleepScore, bodyHealthScore, soulDepthScore, commitmentScore,
    body7dMin, soul7dMin, hasRealVitals, hasRealHistory,
  };
};

const buildPlan = (i: PlanInputs): VitalsPlan => {
  const plan = ageBaseline(i.ageYears);
  const rationale: string[] = [];

  rationale.push(
    `Age ${i.ageYears} baseline → walk ${plan.walkingMin}, yoga ${plan.yogaMin}, ` +
    `japa ${plan.japaMin}, meditate ${plan.meditationMin}, breath ${plan.breathworkMin}.`
  );

  // ── Vitals nudges ──
  if (i.stressScore > 60 || i.rmssd < 25) {
    plan.meditationMin += 5;
    plan.breathworkMin += 5;
    rationale.push(
      `Stress ${i.stressScore}/100 · HRV ${i.rmssd.toFixed(0)} ms → +5 meditate, ` +
      `+5 breath (calm the nervous system).`
    );
  }
  if (i.spo2 < 95) {
    plan.breathworkMin += 5;
    rationale.push(`SpO₂ ${i.spo2.toFixed(1)}% is low → +5 pranayama focus.`);
  }
  if (i.sleepScore < 60) {
    plan.meditationMin += 5;
    rationale.push(
      `Sleep ${i.sleepScore}/100 → +5 meditate, prefer 4-7-8 breath before bed.`
    );
  }
  if (i.bodyHealthScore < 60) {
    plan.walkingMin += 10;
    rationale.push(
      `Body Health ${i.bodyHealthScore}/100 → +10 walking (most efficient lift).`
    );
  }
  if (i.soulDepthScore < 60) {
    plan.japaMin += 5;
    plan.meditationMin += 5;
    rationale.push(
      `Soul Depth ${i.soulDepthScore}/100 → +5 japa, +5 meditate (deepen the well).`
    );
  }
  if (i.bpm > 80) {
    plan.walkingMin += 5;
    rationale.push(`Resting BPM ${i.bpm.toFixed(0)} is high → +5 walking (cardio).`);
  }

  // ── 7-day history correction ──
  if (i.hasRealHistory) {
    if (i.body7dMin < 90) {
      plan.walkingMin += 5;
      rationale.push(
        `Only ${i.body7dMin} body min in last 7 days → +5 walking emphasis.`
      );
    }
    if (i.soul7dMin < 90) {
      plan.japaMin += 5;
      rationale.push(
        `Only ${i.soul7dMin} soul min in last 7 days → +5 japa emphasis.`
      );
    }
    if (i.body7dMin > 180 && i.soul7dMin > 180) {
      rationale.push(
        `Strong week (${i.body7dMin} body · ${i.soul7dMin} soul min) → ` +
        `maintaining baseline. Protect the joy — don't overcommit.`
      );
    }
  } else {
    rationale.push(
      `No tracked history yet — plan is based on age + today's vitals only.`
    );
  }

  // ── Cap total at 120 min/day (burnout protection) ──
  let total =
    plan.walkingMin + plan.yogaMin + plan.japaMin + plan.meditationMin + plan.breathworkMin;
  const CAP = 120;
  if (total > CAP) {
    const over = total - CAP;
    // Trim from the bucket that grew most (walking usually)
    const buckets: Array<keyof typeof plan> = ['walkingMin', 'meditationMin', 'japaMin', 'yogaMin', 'breathworkMin'];
    let remaining = over;
    for (const b of buckets) {
      if (remaining <= 0) break;
      const trim = Math.min(remaining, plan[b] - 5);  // never below 5
      if (trim > 0) { plan[b] -= trim; remaining -= trim; }
    }
    total = plan.walkingMin + plan.yogaMin + plan.japaMin + plan.meditationMin + plan.breathworkMin;
    rationale.push(`Capped at ${CAP} min/day — trimmed ${over} min to protect recovery.`);
  }

  // ── Build user-facing notes (top-of-card summary) ──
  const notes: string[] = [];

  if (i.stressScore > 60 || i.rmssd < 25) {
    notes.push("Your body is asking for calm today — meditation + breath get top billing.");
  } else if (i.spo2 < 95) {
    notes.push("Oxygen looks soft — a focused pranayama block will lift it gently.");
  } else if (i.bodyHealthScore < 60) {
    notes.push("Body Health is below your soul side — a longer walk will rebalance the day.");
  } else if (i.soulDepthScore < 60) {
    notes.push("Soul side wants attention — extra japa + meditation today.");
  } else if (i.commitmentScore > 80) {
    notes.push("You're on a beautiful streak — maintain, don't push. Recovery is part of the practice.");
  } else {
    notes.push("Vitals look steady — a balanced plan to keep both worlds moving.");
  }

  // Specific micro-tip
  if (i.bpm > 75 && plan.walkingMin < 25) {
    notes.push(`Try a brisk 5-min walk before japa — drops the resting BPM by ~3-5.`);
  } else if (i.rmssd < 30) {
    notes.push("4-7-8 breathing for 3 minutes can lift HRV by 15-25% almost immediately.");
  } else if (i.soulDepthScore >= 70) {
    notes.push("Your sadhana is landing — even a short session today will compound the depth.");
  }

  return {
    walkingMin:    plan.walkingMin,
    yogaMin:       plan.yogaMin,
    japaMin:       plan.japaMin,
    meditationMin: plan.meditationMin,
    breathworkMin: plan.breathworkMin,
    totalMin:      total,
    notes,
    rationale,
    fromRealVitals:  i.hasRealVitals,
    fromRealHistory: i.hasRealHistory,
  };
};

export const vitalsPlanEngine = {
  /** Generate a personalized plan using the user's DOB + ring + history. */
  async generate(dob?: string): Promise<VitalsPlan> {
    const inputs = await gatherInputs(dob);
    return buildPlan(inputs);
  },
};
