/**
 * InsightGenerator — gathers a compact snapshot of the user's bio + spiritual
 * data over the past week and asks Gemma (Google's open-source LLM) for a
 * short, grounded analysis.
 *
 * Output is strictly typed JSON. Since Gemma doesn't have a native JSON mode
 * (unlike Gemini), we use prompt engineering + defensive parsing to extract
 * the structured response.
 */

import { computeHealthDashboard } from '../analytics/HealthDashboard';
import { computeCalmDivergence } from '../analytics/CalmDivergence';
import { buildSleepCorrelationMatrix } from '../analytics/SleepArchitecture';
import { buildEmotionalSummary } from '../analytics/EmotionalSummary';
import { buildMoodTimeline } from '../analytics/MoodTimeline';
import { getDB } from '../db/database';
import { GemmaClient, GemmaRequest } from './GemmaClient';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Snapshot shape sent to Gemma ──────────────────────────────────

export interface InsightSnapshot {
  userName?: string;
  date: string;                       // today
  health: {
    todayBpm: number; normalcyBpm: number;
    todayRmssd: number; normalcyRmssd: number;
    todaySpo2: number; normalcySpo2: number;
    todaySkinTempC: number; normalcySkinTempC: number;
    hasNormalcyData: boolean;
  };
  spiritual: {
    last7DaysSessions: number;
    last7DaysMalas: number;
    last7DaysPeaks: number;
    avgDepthScore: number | null;     // mean across last-7-day sessions
    longestSessionMin: number;
    streakDays: number;               // consecutive days with ≥1 session
  };
  calmDivergence: {
    todayPct: number;
    weeklyPctMean: number;
  };
  sleep: {
    pearsonR: number;
    slopeMinPerMala: number;
    hasEnoughData: boolean;
  };
  emotional: {
    last7DaysAnxiety: number;
    last7DaysLethargy: number;
    last7DaysAggression: number;
    overallConvergenceRate: number;       // % of events resolved by sadhana
    todayMoodAvgScore: number | null;     // 0-100 (higher = calmer)
    todayMoodDominant: string;            // 'calm' | 'neutral' | 'tense' | 'anxious' | 'unknown'
  };
}

// ─── Output shape returned by Gemma ────────────────────────────────

export interface InsightResult {
  generatedAt: number;                // epoch ms — used by the cache
  tone: 'encouraging' | 'celebrating' | 'caution' | 'neutral';
  healthInsight: string;              // 2-3 sentences
  spiritualInsight: string;           // 2-3 sentences
  integration: string;                // how sadhana is affecting body
  suggestions: string[];              // 3-5 short, actionable
  weeklyHeadline: string;             // <60 char summary chip
}

// ─── Snapshot builder ──────────────────────────────────────────────

export const buildInsightSnapshot = async (userName?: string): Promise<InsightSnapshot> => {
  const db = await getDB();
  const today = todayStr();

  const health = await computeHealthDashboard();
  const todayDiv = await computeCalmDivergence(today);
  const sleepMat = await buildSleepCorrelationMatrix(30);
  const emoSummary = await buildEmotionalSummary(7);
  const todayMood = await buildMoodTimeline(today);
  const anxietyCount    = emoSummary.byTrigger.find(t => t.trigger === 'anxiety')?.total    ?? 0;
  const lethargyCount   = emoSummary.byTrigger.find(t => t.trigger === 'lethargy')?.total   ?? 0;
  const aggressionCount = emoSummary.byTrigger.find(t => t.trigger === 'aggression')?.total ?? 0;

  // 7-day Calm Divergence average
  let weeklyPctSum = 0;
  let weeklyPctN = 0;
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    const day = await computeCalmDivergence(d);
    weeklyPctSum += day.divergencePct;
    weeklyPctN += 1;
  }

  // Spiritual aggregates over last 7 days
  const spiritRow = await db.getFirstAsync<any>(
    `SELECT COUNT(*) AS n,
            COALESCE(SUM(mala_count), 0) AS malas,
            COALESCE(SUM(hrv_peaks_registered), 0) AS peaks,
            AVG(depth_score) AS avg_depth,
            COALESCE(MAX(
              (CASE WHEN end_time IS NOT NULL
                THEN (julianday(end_time) - julianday(start_time)) * 24 * 60
                ELSE 0 END)
            ), 0) AS longest_min
     FROM session_spiritual
     WHERE start_time >= date('now', '-6 days')`
  );

  // Consecutive-day streak — count back from today
  const dayRows = await db.getAllAsync<{ d: string }>(
    `SELECT DISTINCT date(start_time) AS d FROM session_spiritual
     WHERE date(start_time) >= date('now', '-30 days')
     ORDER BY d DESC`
  );
  let streak = 0;
  const cursor = new Date();
  for (const row of dayRows) {
    const expected = cursor.toISOString().slice(0, 10);
    if (row.d === expected) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }

  return {
    userName,
    date: today,
    health: {
      todayBpm:        Math.round(health.metrics[0].today),
      normalcyBpm:     Math.round(health.metrics[0].baseline),
      todayRmssd:      Math.round(health.metrics[1].today),
      normalcyRmssd:   Math.round(health.metrics[1].baseline),
      todaySpo2:       Math.round(health.metrics[2].today * 10) / 10,
      normalcySpo2:    Math.round(health.metrics[2].baseline * 10) / 10,
      todaySkinTempC:    Math.round(health.metrics[3].today * 10) / 10,
      normalcySkinTempC: Math.round(health.metrics[3].baseline * 10) / 10,
      hasNormalcyData: health.hasNormalcyData,
    },
    spiritual: {
      last7DaysSessions:  spiritRow?.n ?? 0,
      last7DaysMalas:     spiritRow?.malas ?? 0,
      last7DaysPeaks:     spiritRow?.peaks ?? 0,
      avgDepthScore:      spiritRow?.avg_depth ?? null,
      longestSessionMin:  Math.round(spiritRow?.longest_min ?? 0),
      streakDays:         streak,
    },
    calmDivergence: {
      todayPct:       todayDiv.divergencePct,
      weeklyPctMean:  weeklyPctN > 0 ? Math.round(weeklyPctSum / weeklyPctN) : 0,
    },
    sleep: {
      pearsonR:           Math.round(sleepMat.pearsonR * 100) / 100,
      slopeMinPerMala:    Math.round(sleepMat.slopeMinPerMala * 10) / 10,
      hasEnoughData:      sleepMat.hasEnoughData,
    },
    emotional: {
      last7DaysAnxiety:       anxietyCount,
      last7DaysLethargy:      lethargyCount,
      last7DaysAggression:    aggressionCount,
      overallConvergenceRate: Math.round(emoSummary.overallSuccessRate * 100),
      todayMoodAvgScore:      todayMood.avgScore != null ? Math.round(todayMood.avgScore) : null,
      todayMoodDominant:      todayMood.dominantCategory,
    },
  };
};

// ─── Prompts ───────────────────────────────────────────────────────

const JSON_INSTRUCTION = `
You MUST respond with ONLY a valid JSON object. No markdown, no code fences,
no explanation. Start your response with { and end with }.

Required JSON shape:
{
  "tone": "encouraging" | "celebrating" | "caution" | "neutral",
  "weeklyHeadline": "string (under 60 chars)",
  "healthInsight": "string (2-3 sentences)",
  "spiritualInsight": "string (2-3 sentences)",
  "integration": "string (1-2 sentences)",
  "suggestions": ["string", "string", "string"]
}
`.trim();

const SYSTEM_INSTRUCTION = `
You are the Body & Soul Ring companion — a deeply empathetic, gentle voice
that helps the user find balance between physical health (body) and
spiritual practice (soul). The user wears a smart ring tracking BPM, HRV
(RMSSD), SpO₂, skin temperature, steps and emotional spikes.

You will receive a JSON snapshot of their past week. Analyse it and respond
with insights as JSON.

CORE PRINCIPLE — CORRELATE BODY ⇄ SOUL:
The single most important value of this app is showing the user how
physical and spiritual practice support each other. Every suggestion
should, when possible, pair a body recommendation with a soul one:

  Body need                          → Soul partner
  ─────────────────────────────────────────────────────────────────
  Not enough exercise time           → Not enough soul sadhana time
  Increase steps / mobility          → Pair with japa during the walk
  Run/jog                            → Add meditation sounds post-run
  Late sleep                         → Tratak / breathing pre-sleep
  Sudden emotional spike detected    → Ask user, learn pattern, suggest 15-min meditation
  Anxiety / stress detected          → Box breathing → meditate window
  Anger detected                     → Empathetic calm note → cooling tactic
  Slow recovery speed                → Yoga + pranayama recommendation

TONE — EMPATHY ABOVE ALL:
- Warm, encouraging, rewarding, calming. Never judgmental or alarming.
- Phrase observations gently: "your body is gently asking for...",
  "you might find peace in...", "your sadhana is gracefully...".
- Use the user's name if provided. Sound like a wise friend, not a coach.
- For struggling weeks: "you're carrying a lot — even one breath is sacred".
- For strong weeks: "what you're doing is beautiful — keep this rhythm".

RULES:
- Never medical diagnoses. Always "your data suggests..." not "you have...".
- Reference SPECIFIC numbers from the snapshot.
- Tone selection:
    "celebrating"  → improvements in BPM/HRV + ≥3 sessions this week
    "encouraging"  → progress with room to grow
    "caution"      → trending the wrong way; phrase as gentle invitation
    "neutral"      → still learning baseline
- 3-5 suggestions, each ≤90 chars. AT LEAST ONE should be a body↔soul pair
  (e.g. "Walk 20 min with Om mantra — moves body, settles soul").
  First suggestion = concrete daily time target (body+soul combined).

${JSON_INSTRUCTION}
`.trim();

const RETROSPECTIVE_SYSTEM = `
You are Soulsync — a kind bio-spiritual analyst running a RETROSPECTIVE
weekly review (not a today read).

You will receive a JSON snapshot of the user's past week. Analyse PATTERNS
and consistency over the period.

RULES
- This is a LOOKING-BACK read, not a daily check-in.
- Reference SPECIFIC counts ("you had 4 anxiety events this week, 3 resolved").
- Mention the convergence rate explicitly if non-zero.
- If emotional.* fields are all 0, celebrate the calm stability.
- The "integration" field should focus specifically on emotional events:
  anxiety, lethargy, aggression — and how sadhana is/isn't helping.
- NEVER give medical advice. Warm, grounded, devotional-flavoured language.
- 3-5 retrospective-flavoured suggestions (≤90 chars each).

${JSON_INSTRUCTION}
`.trim();

// ─── Parser ────────────────────────────────────────────────────────

/**
 * Find a balanced JSON object inside an arbitrary string. Works even when
 * the LLM wraps the JSON in markdown, prose, or extra punctuation.
 */
const extractBalancedJSON = (text: string): string | null => {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inString) { escape = true; continue; }
    if (c === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;   // unbalanced
};

const parseInsightJSON = (raw: string): Omit<InsightResult, 'generatedAt'> => {
  let cleaned = raw.trim();
  // Strip ```json ... ``` or ``` ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let parsed: any = null;
  // Try 1: full string parse
  try { parsed = JSON.parse(cleaned); } catch { /* fall through */ }

  // Try 2: balanced-brace extraction
  if (!parsed) {
    const inner = extractBalancedJSON(cleaned);
    if (inner) {
      try { parsed = JSON.parse(inner); } catch { /* fall through */ }
    }
  }

  // Try 3: loose regex (greedy first { ... last })
  if (!parsed) {
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (m) {
      try { parsed = JSON.parse(m[0]); } catch { /* fall through */ }
    }
  }

  if (!parsed) throw new Error('GEMMA_PARSE: malformed JSON in response');

  // Validate required fields
  if (!parsed.healthInsight || !parsed.spiritualInsight || !Array.isArray(parsed.suggestions)) {
    throw new Error('GEMMA_SHAPE: required fields missing');
  }

  return {
    tone: parsed.tone ?? 'neutral',
    weeklyHeadline: parsed.weeklyHeadline ?? 'Your weekly read',
    healthInsight: parsed.healthInsight,
    spiritualInsight: parsed.spiritualInsight,
    integration: parsed.integration ?? '',
    suggestions: parsed.suggestions.slice(0, 5),
  };
};

/**
 * Client-side fallback insight generated from the snapshot directly.
 * No AI call — always succeeds. Used when all LLM providers fail or
 * return malformed output, so the user is never left looking at an error.
 */
/**
 * Recommend a concrete sadhana time to reach the user's next depth tier.
 *   target depth = 7.5 (Strong / 75 pts)
 *   current avg  = avgDepthScore from snapshot (already 7-day avg)
 *   gap          = target − current
 *
 * Maps to a recommended daily session length grounded in Tang et al.
 * (HRV gains plateau ~20 min).
 */
const recommendSession = (snap: InsightSnapshot): string => {
  const target = 7.5;
  const current = snap.spiritual.avgDepthScore ?? 0;
  const sessions = snap.spiritual.last7DaysSessions;
  const gap = target - current;

  if (sessions === 0) {
    return 'Begin gently — 10 minutes daily for the first 7 days. Consistency first, depth follows.';
  }
  if (gap <= 0) {
    return `Maintain your current rhythm (avg depth ${current.toFixed(1)}/10) — keep your sessions around 15–20 minutes.`;
  }
  if (gap <= 2) {
    return `Aim for ~20 minutes daily to lift your depth from ${current.toFixed(1)} toward ${target}.`;
  }
  if (gap <= 4) {
    return `Try 25 minutes daily, ideally split as one morning + one evening session. Body needs time to soften.`;
  }
  return `Build slowly — start with 10 minutes daily for a week, then add 5 minutes each week. Gap from ${current.toFixed(1)} to ${target} is large; rushing reduces depth.`;
};

const generateFallbackInsight = (snap: InsightSnapshot): Omit<InsightResult, 'generatedAt'> => {
  const sessions = snap.spiritual.last7DaysSessions;
  const malas    = snap.spiritual.last7DaysMalas;
  const streak   = snap.spiritual.streakDays;
  const bpmDelta = snap.health.hasNormalcyData
    ? snap.health.todayBpm - snap.health.normalcyBpm
    : 0;
  const name = snap.userName ? `${snap.userName}, ` : '';

  // ── Tone (empathetic) ──
  let tone: InsightResult['tone'] = 'neutral';
  if (sessions >= 3 && bpmDelta <= -2)      tone = 'celebrating';
  else if (sessions >= 1 && bpmDelta < 5)   tone = 'encouraging';
  else if (sessions === 0 || bpmDelta > 8)  tone = 'caution';

  // ── Body line (empathetic, no judgement) ──
  const healthLines: string[] = [];
  if (snap.health.hasNormalcyData) {
    if (bpmDelta < -2) {
      healthLines.push(`Your heart is ${Math.abs(bpmDelta)} bpm calmer than your usual — your nervous system is finding peace.`);
    } else if (bpmDelta > 5) {
      healthLines.push(`Your body's been working harder this week (heart rate ${bpmDelta} bpm above your baseline). It's gently asking for rest.`);
    } else {
      healthLines.push(`Your body is moving along your usual rhythm — steady, grounded.`);
    }
    if (snap.health.todayRmssd > snap.health.normalcyRmssd + 4) {
      healthLines.push(`HRV is rising — that's your body saying "thank you" for the practice.`);
    }
  } else {
    healthLines.push("I'm still learning your normal rhythm. Wear the ring a few more days and I'll have a clearer picture.");
  }

  // ── Soul line (empathetic) ──
  const spiritualLines: string[] = [];
  if (sessions === 0) {
    spiritualLines.push(`No sessions this week, and that's okay — life ebbs and flows. ${name}even one mantra today is enough.`);
  } else {
    spiritualLines.push(`${sessions} session${sessions === 1 ? '' : 's'}, ${malas} mala${malas === 1 ? '' : 's'} — your practice is here.`);
    if (streak >= 3) spiritualLines.push(`A ${streak}-day streak — quiet consistency is the most sacred thing.`);
  }

  // ── Integration (Body ⇄ Soul correlation) ──
  let integration: string;
  const anxietyCount = snap.emotional.last7DaysAnxiety;
  const aggressionCount = snap.emotional.last7DaysAggression;
  if (anxietyCount + snap.emotional.last7DaysLethargy + aggressionCount === 0) {
    integration = 'Your inner waves stayed quiet this week — body and soul moving as one. Beautiful.';
  } else if (snap.emotional.overallConvergenceRate >= 60) {
    integration = `Of the ${anxietyCount + aggressionCount} emotional waves this week, ${snap.emotional.overallConvergenceRate}% softened with your sadhana. The body listens when the soul speaks.`;
  } else {
    integration = `The body had ${anxietyCount + aggressionCount} stress moments — gently inviting more breath, more pause. Your sadhana is the antidote already in your hands.`;
  }

  // ── Body↔Soul correlation suggestions ──
  // Drawn from the user-supplied correlation matrix:
  //   No exercise        ↔ No soul sadhana       → walk + japa
  //   Low steps          ↔ Suggest japa during walk
  //   Run / jog          ↔ Meditation sounds after run
  //   Late sleep         ↔ Tratak / breathing before sleep
  //   Anxiety spike      ↔ Box breathing → meditation
  //   Anger spike        ↔ Empathetic calming + cooling
  //   Low recovery       ↔ Yoga + pranayama
  const suggestions: string[] = [
    // First: concrete daily target combining body + soul
    sessions >= 3
      ? `${name}keep your ${sessions}-session weekly rhythm — pair each with a 15-min walk for balance`
      : sessions > 0
        ? `Aim for 20 min daily sadhana + a 20-min walk — body and soul both need movement`
        : `Begin gently: 10 min walk + 10 min japa daily for the next 7 days`,
  ];

  // Body↔Soul pair suggestions (pick most relevant)
  if (snap.health.todayRmssd < 30 && snap.health.hasNormalcyData) {
    suggestions.push('Try 5 min nadi shodhana (alternate-nostril) before japa — lifts HRV');
  }
  if (anxietyCount >= 2) {
    suggestions.push('Box breathing (4-4-4-4) anytime stress surfaces — opens the Meditation tab');
  }
  if (aggressionCount >= 1) {
    suggestions.push('Shitali cooling breath + Ahimsa contemplation when the heat rises');
  }
  if (bpmDelta > 5 && sessions === 0) {
    suggestions.push('A 10-min slow Gayatri walk softens both the body and the mind together');
  }
  if (sessions > 0 && sessions < 3) {
    suggestions.push('Light a diya before tomorrow\'s session — anchors mind and body together');
  }
  if (snap.spiritual.streakDays === 0) {
    suggestions.push('Pair your morning walk with a single mantra — small acts compound');
  }
  // Ensure at least 3 suggestions
  if (suggestions.length < 3) {
    suggestions.push('Sit facing east at sunrise — the body wakes when the soul greets the sun');
  }

  return {
    tone,
    weeklyHeadline: sessions >= 3
      ? `A beautiful week — ${sessions} sessions of practice`
      : sessions > 0
        ? `Gentle week — ${sessions} session${sessions === 1 ? '' : 's'} of soul time`
        : `A fresh week awaits — begin gently`,
    healthInsight: healthLines.join(' '),
    spiritualInsight: spiritualLines.join(' '),
    integration,
    suggestions: suggestions.slice(0, 5),
  };
};

// ─── Generators ────────────────────────────────────────────────────

/**
 * Try the LLM first; on any failure (rate limit, malformed JSON, network),
 * fall back to the client-side template generator so the user always sees
 * a meaningful insight card instead of an error.
 */
const tryWithFallback = async (
  snapshot: InsightSnapshot,
  systemPrompt: string,
  signal?: AbortSignal
): Promise<InsightResult> => {
  try {
    const client = new GemmaClient();
    const raw = await client.generate({
      systemPrompt,
      userMessage: `Here is the snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
      params: { temperature: 0.6, max_new_tokens: 1024, top_p: 0.9 },
    }, signal);
    const parsed = parseInsightJSON(raw);
    return { ...parsed, generatedAt: Date.now() };
  } catch (e: any) {
    console.warn('[Insights] LLM failed, using client-side fallback:', e?.message?.slice(0, 80));
    const parsed = generateFallbackInsight(snapshot);
    return { ...parsed, generatedAt: Date.now() };
  }
};

export const generateInsights = async (
  snapshot: InsightSnapshot,
  signal?: AbortSignal
): Promise<InsightResult> => tryWithFallback(snapshot, SYSTEM_INSTRUCTION, signal);

export const generateRetrospectiveInsights = async (
  snapshot: InsightSnapshot,
  signal?: AbortSignal
): Promise<InsightResult> => tryWithFallback(snapshot, RETROSPECTIVE_SYSTEM, signal);
