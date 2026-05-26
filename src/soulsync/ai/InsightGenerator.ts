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
You are Soulsync — a kind, grounded bio-spiritual analyst inside a Hindu
sadhana app. The user wears a smart ring tracking BPM, HRV (RMSSD), SpO₂
and skin temperature, and practises japa meditation daily.

You will receive a JSON snapshot of their past week. Analyse it and respond
with insights formatted as JSON.

RULES
- Be warm. Use the user's name if provided.
- NEVER give medical advice or diagnoses. Phrase observations as
  "your data suggests…", not "you have…".
- Reference SPECIFIC numbers from the snapshot.
- If hasNormalcyData=false OR hasEnoughData=false, acknowledge that
  you're still learning their baseline; don't make confident claims.
- Tone selection:
    "celebrating"  → big improvements in BPM/HRV + ≥3 sessions this week
    "encouraging"  → progress + room to grow
    "caution"      → BPM trending up vs baseline, or skipped >3 days
    "neutral"      → not enough data
- Suggestions: 3-5 actionable, devotional-flavoured items (≤90 chars each).
  THE FIRST SUGGESTION MUST BE A CONCRETE DAILY SADHANA TIME TARGET
  (e.g., "Aim for 20 minutes daily to reach depth 7"). Base it on
  avgDepthScore + sessions. Tang et al. show HRV gains plateau ~20 min.

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

  // Tone
  let tone: InsightResult['tone'] = 'neutral';
  if (sessions >= 3 && bpmDelta <= -2)      tone = 'celebrating';
  else if (sessions >= 1 && bpmDelta < 5)   tone = 'encouraging';
  else if (sessions === 0 || bpmDelta > 8)  tone = 'caution';

  const name = snap.userName ? `${snap.userName}, ` : '';

  const healthLines: string[] = [];
  if (snap.health.hasNormalcyData) {
    if (bpmDelta < -2)       healthLines.push(`Your resting heart rate is ${Math.abs(bpmDelta)} bpm lower than your 30-day baseline — a calmer nervous system today.`);
    else if (bpmDelta > 5)   healthLines.push(`Resting heart rate is ${bpmDelta} bpm above baseline — consider a longer japa session today.`);
    else                     healthLines.push(`Heart-rate is tracking close to your normal baseline.`);
    if (snap.health.todayRmssd > snap.health.normalcyRmssd + 4) {
      healthLines.push(`HRV (RMSSD) is up — your body is recovering well.`);
    }
  } else {
    healthLines.push('Soulsync is still learning your baseline — keep the ring on a few more days to unlock the body comparison.');
  }

  const spiritualLines: string[] = [];
  if (sessions === 0) {
    spiritualLines.push(`No japa sessions this week. ${name}even five minutes today plants a seed.`);
  } else {
    spiritualLines.push(`${sessions} session${sessions === 1 ? '' : 's'} and ${malas} mala${malas === 1 ? '' : 's'} this week.`);
    if (streak >= 3) spiritualLines.push(`${streak}-day streak — consistency is the heart of sadhana.`);
  }

  const integration = snap.emotional.last7DaysAnxiety + snap.emotional.last7DaysLethargy + snap.emotional.last7DaysAggression === 0
    ? 'Calm stability across the week — emotional waves stayed quiet.'
    : `${snap.emotional.overallConvergenceRate}% of emotional events were resolved with sadhana this week.`;

  const suggestions: string[] = [
    // Prescriptive — always include the session-time recommendation first
    recommendSession(snap),
  ];
  if (snap.health.todayRmssd < 30 && snap.health.hasNormalcyData) suggestions.push('Try 5 minutes of pranayama before japa to lift HRV');
  if (bpmDelta > 5) suggestions.push('A slower 10-min Gayatri can help bring heart rate down');
  if (sessions > 0) suggestions.push('Light a diya before your next session — anchors the mind');
  if (suggestions.length < 3) suggestions.push('Sit facing east in the early morning for tomorrow\'s japa');

  return {
    tone,
    weeklyHeadline: sessions >= 3 ? `Strong week — ${sessions} sessions` : sessions > 0 ? `Gentle week — ${sessions} session${sessions === 1 ? '' : 's'}` : 'Begin your weekly rhythm',
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
