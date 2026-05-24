/**
 * MoodTimeline — 24-hour color-coded ribbon showing the user's
 * autonomic state (calm ⇄ stressed) hour-by-hour.
 *
 * Score per hour (0..100, higher = calmer):
 *   base = clamp((avgRmssd_hour / personalBaselineRmssd) * 50, 0, 100)
 *   penalty for emotional events that fired in that hour:
 *     anxiety   = −40
 *     aggression = −25
 *     lethargy   = −15
 *   bonus for completed japa sessions:
 *     +15 per session (capped at +25)
 *
 * Categorisation:
 *   < 25  → 'anxious'    (red)
 *   25-50 → 'tense'      (orange)
 *   50-70 → 'neutral'    (yellow)
 *   70-100 → 'calm'      (green)
 */

import { getDB } from '../db/database';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';

export type MoodCategory = 'anxious' | 'tense' | 'neutral' | 'calm' | 'unknown';

export interface HourMood {
  hour: number;             // 0..23
  score: number | null;     // null when no data for this hour
  category: MoodCategory;
  events: number;           // total emotional events this hour
  sessions: number;         // japa sessions this hour
  avgBpm: number | null;
  avgRmssd: number | null;
}

export interface MoodTimelineSnapshot {
  date: string;
  hours: HourMood[];
  avgScore: number | null;
  dominantCategory: MoodCategory;
}

export const moodCategory = (score: number | null): MoodCategory => {
  if (score == null) return 'unknown';
  if (score < 25) return 'anxious';
  if (score < 50) return 'tense';
  if (score < 70) return 'neutral';
  return 'calm';
};

export const colorForMood = (c: MoodCategory): string => ({
  anxious: '#ef4444',
  tense:   '#f59e0b',
  neutral: '#fbff7a',
  calm:    '#4ade80',
  unknown: 'rgba(255,255,255,0.06)',
}[c]);

export const buildMoodTimeline = async (yyyyMmDd: string): Promise<MoodTimelineSnapshot> => {
  const db = await getDB();
  const baseline = await ambientBaselineRepo.rollingAvg(14);
  const baselineRmssd = baseline.avgRmssd > 0 ? baseline.avgRmssd : 30;

  // Hour-by-hour ambient stats
  const hourly = await db.getAllAsync<{
    hour: number; avg_bpm: number; avg_rmssd: number; n: number;
  }>(
    `SELECT CAST(strftime('%H', timestamp) AS INTEGER) AS hour,
            AVG(ambient_bpm)   AS avg_bpm,
            AVG(ambient_rmssd) AS avg_rmssd,
            COUNT(*)           AS n
     FROM ambient_baseline
     WHERE date(timestamp) = ? AND activity_state != 'sleep'
     GROUP BY hour`,
    [yyyyMmDd]
  );

  // Hour-by-hour emotional event counts
  const events = await db.getAllAsync<{ hour: number; trigger: string; n: number }>(
    `SELECT CAST(strftime('%H', detected_at) AS INTEGER) AS hour,
            trigger_type AS trigger, COUNT(*) AS n
     FROM emotional_event
     WHERE date(detected_at) = ?
     GROUP BY hour, trigger_type`,
    [yyyyMmDd]
  );

  // Hour-by-hour completed japa sessions
  const sessions = await db.getAllAsync<{ hour: number; n: number }>(
    `SELECT CAST(strftime('%H', start_time) AS INTEGER) AS hour, COUNT(*) AS n
     FROM session_spiritual
     WHERE date(start_time) = ? AND end_time IS NOT NULL
     GROUP BY hour`,
    [yyyyMmDd]
  );

  const hours: HourMood[] = [];
  let scoreSum = 0;
  let scoreCount = 0;

  for (let h = 0; h < 24; h++) {
    const hourly_h = hourly.find(r => r.hour === h);
    const events_h = events.filter(r => r.hour === h);
    const sess_h = sessions.find(r => r.hour === h);

    let score: number | null = null;
    let avgBpm: number | null = null;
    let avgRmssd: number | null = null;

    if (hourly_h && hourly_h.n > 0) {
      avgBpm = Math.round(hourly_h.avg_bpm);
      avgRmssd = Math.round(hourly_h.avg_rmssd);
      // Base: how this hour's RMSSD compares to the 14-day baseline
      score = Math.max(0, Math.min(100, (hourly_h.avg_rmssd / baselineRmssd) * 50));
      // Penalties
      for (const ev of events_h) {
        if (ev.trigger === 'anxiety') score -= 40 * ev.n;
        else if (ev.trigger === 'aggression') score -= 25 * ev.n;
        else if (ev.trigger === 'lethargy') score -= 15 * ev.n;
      }
      // Bonuses
      if (sess_h) score += Math.min(25, 15 * sess_h.n);
      score = Math.max(0, Math.min(100, score));
      scoreSum += score;
      scoreCount += 1;
    }

    const totalEvents = events_h.reduce((a, b) => a + b.n, 0);
    hours.push({
      hour: h,
      score,
      category: moodCategory(score),
      events: totalEvents,
      sessions: sess_h?.n ?? 0,
      avgBpm,
      avgRmssd,
    });
  }

  const avgScore = scoreCount > 0 ? scoreSum / scoreCount : null;
  return {
    date: yyyyMmDd,
    hours,
    avgScore,
    dominantCategory: moodCategory(avgScore),
  };
};
