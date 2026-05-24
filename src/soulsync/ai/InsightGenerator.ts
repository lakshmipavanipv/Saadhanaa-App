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
- Suggestions: 3-5 actionable, devotional-flavoured items (≤90 chars each),
  not generic wellness fluff.

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

const parseInsightJSON = (raw: string): Omit<InsightResult, 'generatedAt'> => {
  // Gemma sometimes wraps in markdown despite instructions; strip if present.
  let cleaned = raw.trim();

  // Strip ```json ... ``` or ``` ... ``` fences
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');

  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try extracting first {...} block
    const m = cleaned.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('GEMMA_PARSE: no JSON object found in response');
    try {
      parsed = JSON.parse(m[0]);
    } catch (e) {
      throw new Error('GEMMA_PARSE: malformed JSON in response');
    }
  }

  // Validate required fields
  if (!parsed.healthInsight || !parsed.spiritualInsight || !Array.isArray(parsed.suggestions)) {
    throw new Error('GEMMA_SHAPE: required fields missing');
  }

  // Defensive defaults for optional fields
  return {
    tone: parsed.tone ?? 'neutral',
    weeklyHeadline: parsed.weeklyHeadline ?? 'Your weekly read',
    healthInsight: parsed.healthInsight,
    spiritualInsight: parsed.spiritualInsight,
    integration: parsed.integration ?? '',
    suggestions: parsed.suggestions.slice(0, 5),
  };
};

// ─── Generators ────────────────────────────────────────────────────

export const generateInsights = async (
  snapshot: InsightSnapshot,
  signal?: AbortSignal
): Promise<InsightResult> => {
  const client = new GemmaClient();
  const req: GemmaRequest = {
    systemPrompt: SYSTEM_INSTRUCTION,
    userMessage: `Here is the snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
    params: {
      temperature: 0.7,
      max_new_tokens: 1024,
      top_p: 0.95,
    },
  };
  const raw = await client.generate(req, signal);
  const parsed = parseInsightJSON(raw);
  return { ...parsed, generatedAt: Date.now() };
};

export const generateRetrospectiveInsights = async (
  snapshot: InsightSnapshot,
  signal?: AbortSignal
): Promise<InsightResult> => {
  const client = new GemmaClient();
  const req: GemmaRequest = {
    systemPrompt: RETROSPECTIVE_SYSTEM,
    userMessage: `Here is the snapshot:\n${JSON.stringify(snapshot, null, 2)}`,
    params: {
      temperature: 0.7,
      max_new_tokens: 1024,
      top_p: 0.95,
    },
  };
  const raw = await client.generate(req, signal);
  const parsed = parseInsightJSON(raw);
  return { ...parsed, generatedAt: Date.now() };
};
