/**
 * InsightGenerator — gathers a compact snapshot of the user's bio + spiritual
 * data over the past week and asks Gemini for a short, grounded analysis.
 *
 * Output is strictly typed JSON (the model is forced into JSON mode via
 * responseMimeType=application/json).
 */

import { computeHealthDashboard } from '../analytics/HealthDashboard';
import { computeCalmDivergence } from '../analytics/CalmDivergence';
import { buildSleepCorrelationMatrix } from '../analytics/SleepArchitecture';
import { getDB } from '../db/database';
import { GeminiClient, GeminiRequest } from './GeminiClient';

const todayStr = () => new Date().toISOString().slice(0, 10);

// ─── Snapshot shape sent to Gemini ─────────────────────────────────

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
}

// ─── Output shape returned by Gemini ───────────────────────────────

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
  };
};

// ─── Prompt + generator ────────────────────────────────────────────

const SYSTEM_INSTRUCTION = `
You are Soulsync — a kind, grounded bio-spiritual analyst inside a Hindu
sadhana app. The user wears a smart ring tracking BPM, HRV (RMSSD), SpO₂
and skin temperature, and practises japa meditation daily.

Given a JSON snapshot of their past week, return ONE JSON object that
exactly matches this TypeScript shape (do NOT wrap in markdown):
{
  "tone": "encouraging" | "celebrating" | "caution" | "neutral",
  "healthInsight": "2-3 sentences on their physical health trend",
  "spiritualInsight": "2-3 sentences on their japa progress",
  "integration": "1-2 sentences on how sadhana is affecting their body",
  "suggestions": ["3 to 5 short, concrete, kind suggestions (≤90 chars each)"],
  "weeklyHeadline": "<60 char summary chip"
}

RULES
- Be warm. Use the user's name if provided.
- NEVER give medical advice or diagnoses. Phrase observations as
  "your data suggests…", not "you have…".
- Reference SPECIFIC numbers from the snapshot ("your RMSSD jumped from
  32 to 47 ms").
- If hasNormalcyData=false OR hasEnoughData=false, acknowledge that
  you're still learning their baseline; don't make confident claims.
- Tone selection:
    "celebrating"  → big improvements in BPM/HRV + ≥3 sessions this week
    "encouraging"  → progress + room to grow
    "caution"      → BPM trending up vs baseline, or skipped >3 days
    "neutral"      → not enough data
- Suggestions: actionable, devotional-flavoured ("Try adding a 5-minute
  Pranayama before tomorrow's Japa") — not generic wellness fluff.
`.trim();

export const generateInsights = async (
  snapshot: InsightSnapshot,
  apiKey: string,
  signal?: AbortSignal
): Promise<InsightResult> => {
  const client = new GeminiClient(apiKey);

  const req: GeminiRequest = {
    systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
    contents: [
      { role: 'user', parts: [{ text: JSON.stringify(snapshot, null, 2) }] },
    ],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    },
  };

  const raw = await client.generate(req, signal);

  let parsed: Omit<InsightResult, 'generatedAt'>;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    // Defensive: try to extract JSON from a possibly-wrapped response
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('GEMINI_PARSE: not valid JSON');
    parsed = JSON.parse(m[0]);
  }

  // Validate the shape
  if (!parsed.healthInsight || !parsed.spiritualInsight || !Array.isArray(parsed.suggestions)) {
    throw new Error('GEMINI_SHAPE: required fields missing');
  }

  return { ...parsed, generatedAt: Date.now() };
};
