/**
 * Recommendations — generates 2-3 daily body↔soul recommendations
 * shown in a popup right after the user opens the app each day.
 *
 * The matrix below was provided by the user — it encodes the empathic
 * pairing between a BODY-signal observation and a SOUL-side response.
 * The engine reads today's metrics (steps, soul minutes, body minutes,
 * recent emotional events, latest HRV recovery, last sleep score) and
 * matches them against the rules to pick the most relevant 2-3 cards.
 *
 * Train Gemma later by feeding this rule set as few-shot examples; for
 * now the local engine is deterministic so the popup always shows
 * grounded, empathic guidance even when offline / quota exhausted.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { exerciseRepo } from '../../services/exerciseRepo';
import { soulActivityRepo } from '../../services/soulActivityRepo';
import { getDB } from '../db/database';

export interface Recommendation {
  id: string;
  /** What the body signal says today. */
  bodySignal: string;
  /** Empathic soul-side suggestion. */
  soulResponse: string;
  /** Optional deep-link target — Meditation screen technique id, etc. */
  navigateTo?: { tab: string; params?: any };
  /** Icon shown on the card. */
  icon: string;
  /** Priority: higher = shows first. */
  priority: number;
}

interface DailySignals {
  bodyMinutesToday:   number;
  soulMinutesToday:   number;
  stepsToday:         number;
  lastSleepScore:     number | null;
  lastBedtimeMin:     number | null;
  recentAnxiety:      boolean;
  recentAnger:        boolean;
  recentEmoSpike:     boolean;
  recoverySlow:       boolean;   // HRV not returning to baseline
}

const todayDateStr = () => new Date().toISOString().slice(0, 10);

// ─── Gather the signals ───────────────────────────────────────────

const gatherSignals = async (): Promise<DailySignals> => {
  const bodyMinutesToday = await exerciseRepo.todayMinutes().catch(() => 0);
  const soulMinutesToday = await soulActivityRepo.todayMinutes().catch(() => 0);

  // Steps: stored in daily_activity table.
  const db = await getDB();
  const stepsRow = await db.getFirstAsync<{ step_count: number | null }>(
    `SELECT step_count FROM daily_activity WHERE activity_date = ?`,
    [todayDateStr()]
  ).catch(() => null);
  const stepsToday = stepsRow?.step_count ?? 0;

  // Last sleep score: bedtime + composite from the last sleep_record row.
  const sleepRow = await db.getFirstAsync<{ bedtime_minute: number | null }>(
    `SELECT bedtime_minute FROM sleep_record ORDER BY sleep_date DESC LIMIT 1`
  ).catch(() => null);
  const lastBedtimeMin = sleepRow?.bedtime_minute ?? null;
  const lastSleepScore: number | null = null; // computed in SleepScore; not joined here for speed

  // Emotional event flags (last 24 h).
  const since = new Date(Date.now() - 86_400_000).toISOString();
  const emoRows = await db.getAllAsync<{ trigger_type: string }>(
    `SELECT trigger_type FROM emotional_event WHERE detected_at >= ?`,
    [since]
  ).catch(() => []);
  const recentAnxiety  = emoRows.some(r => r.trigger_type === 'anxiety');
  const recentAnger    = emoRows.some(r => r.trigger_type === 'aggression');
  const recentEmoSpike = emoRows.length >= 3;   // ≥3 events ≈ emotional spikes day

  // Slow recovery proxy: average pre/post improvement < 5% in last 3 events
  const recoveryRow = await db.getFirstAsync<{ avg_imp: number | null }>(
    `SELECT AVG(hrv_improvement_pct) AS avg_imp FROM emotional_event
     WHERE post_intervention_rmssd IS NOT NULL
     ORDER BY detected_at DESC LIMIT 3`
  ).catch(() => null);
  const recoverySlow = recoveryRow?.avg_imp != null && recoveryRow.avg_imp < 5;

  return {
    bodyMinutesToday, soulMinutesToday, stepsToday,
    lastSleepScore, lastBedtimeMin,
    recentAnxiety, recentAnger, recentEmoSpike, recoverySlow,
  };
};

// ─── Rule engine ──────────────────────────────────────────────────

const RULES: ((s: DailySignals) => Recommendation | null)[] = [
  // ── Anger detected → empathetic calm ──
  (s) => !s.recentAnger ? null : ({
    id: 'anger-calm',
    bodySignal: 'Your body carried some heat recently 🌡️',
    soulResponse:
      "I'm with you, my dear. Relax for yourself — not for anyone else. " +
      "Try Ahimsa Contemplation or a cooling left-nostril breath. The moment " +
      "that triggered you will still be there, but you'll meet it with a clearer heart.",
    icon: '💛',
    priority: 100,
    navigateTo: { tab: 'Meditation', params: { openId: 'ahimsa-loving-kindness' } },
  }),

  // ── Anxiety detected → box breathing ──
  (s) => !s.recentAnxiety ? null : ({
    id: 'anxiety-box',
    bodySignal: 'Your nervous system tightened today',
    soulResponse:
      'A 4-4-4-4 Box Breath gently brings the vagal brake back online. ' +
      'Even 3 minutes — your HRV will show you the proof.',
    icon: '🫁',
    priority: 90,
    navigateTo: { tab: 'Meditation', params: { openId: 'box-breathing' } },
  }),

  // ── ≥3 emotional events → 15 min meditation ──
  (s) => !s.recentEmoSpike ? null : ({
    id: 'spike-meditate',
    bodySignal: 'A few emotional spikes today',
    soulResponse:
      "That's not weakness — that's a body asking for stillness. " +
      "A 15-minute meditation session will help the wave settle.",
    icon: '🌊',
    priority: 85,
    navigateTo: { tab: 'Meditation' },
  }),

  // ── Slow HRV recovery → yoga / pranayama ──
  (s) => !s.recoverySlow ? null : ({
    id: 'recovery-yoga',
    bodySignal: 'Your recovery is moving slowly',
    soulResponse:
      'Gentle yoga + Nadi Shodhana would re-open the parasympathetic gate. ' +
      "Even 10 minutes today — your body will thank you tomorrow.",
    icon: '🧘',
    priority: 80,
    navigateTo: { tab: 'Yoga', params: { openId: 'nadi-shodhana' } },
  }),

  // ── No body movement AND no soul work today ──
  (s) => (s.bodyMinutesToday === 0 && s.soulMinutesToday === 0) ? ({
    id: 'both-zero',
    bodySignal: 'No body or soul work logged yet today',
    soulResponse:
      "Gentle start awaits — a 10-min walk while doing soft japa is " +
      "the easiest way to keep both worlds in motion. No pressure 🙏",
    icon: '🌅',
    priority: 70,
  }) : null,

  // ── No body movement but soul work done → suggest walk + japa ──
  (s) => (s.bodyMinutesToday === 0 && s.soulMinutesToday > 0) ? ({
    id: 'low-steps-walk-japa',
    bodySignal: `Soul time logged · only ${s.stepsToday} steps so far`,
    soulResponse:
      'Try a walking-japa: 10 minutes of mindful steps with one mala chanted. ' +
      'Body + soul, together — the body needs the same devotion you give the spirit.',
    icon: '🚶',
    priority: 65,
  }) : null,

  // ── No soul work but body logged → meditation sounds post-workout ──
  (s) => (s.bodyMinutesToday > 0 && s.soulMinutesToday === 0) ? ({
    id: 'post-workout-sound',
    bodySignal: `${s.bodyMinutesToday} min workout done · soul resting`,
    soulResponse:
      "After exertion, the mind is still buzzing. A short meditation-sound " +
      'session settles the nervous system and locks in the workout gains.',
    icon: '🎵',
    priority: 60,
    navigateTo: { tab: 'Meditation' },
  }) : null,

  // ── Late bedtime last night → suggest tratak / breathing pre-sleep ──
  (s) => (s.lastBedtimeMin != null && s.lastBedtimeMin > 0 && s.lastBedtimeMin < 240) ? ({
    id: 'late-sleep-tratak',
    bodySignal: 'You slept past midnight last night',
    soulResponse:
      'The 9 pm – 12 am window is where deep sleep is built. Tonight, try ' +
      'a candle-tratak or 4-7-8 breathing 20 min before bed — the body will follow.',
    icon: '🌙',
    priority: 55,
    navigateTo: { tab: 'Meditation', params: { openId: 'four-seven-eight' } },
  }) : null,
];

// ─── Public API ──────────────────────────────────────────────────

const DISMISSED_KEY = 'recommendations.dismissedDate.v1';

export const recommendationsEngine = {
  /** Whether the popup should show today (not yet dismissed for today). */
  async shouldShowToday(): Promise<boolean> {
    const dismissed = await AsyncStorage.getItem(DISMISSED_KEY);
    return dismissed !== todayDateStr();
  },

  /** Mark today's recommendations as dismissed. Re-appears tomorrow. */
  async dismissForToday(): Promise<void> {
    await AsyncStorage.setItem(DISMISSED_KEY, todayDateStr());
  },

  /** Generate today's recommendations (up to `max`, ranked by priority). */
  async generate(max: number = 3): Promise<Recommendation[]> {
    const signals = await gatherSignals();
    const all: Recommendation[] = [];
    for (const rule of RULES) {
      const rec = rule(signals);
      if (rec) all.push(rec);
    }
    all.sort((a, b) => b.priority - a.priority);
    return all.slice(0, max);
  },
};
