/**
 * BpmJourney — 3-phase BPM trend (pre / during / post) for one session.
 *
 *   • PRE  — last `preMinutes` of ambient_baseline before session start
 *   • DURING — full session_telemetry for that session
 *   • POST — ambient_baseline rows from session end to now (capped at `postMinutes`)
 *
 * If `sessionId` is null we render only the ambient context (no session).
 * If the session is still active, POST is empty until Stop is pressed.
 */

import { getDB } from '../db/database';
import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';

export interface JourneyPoint {
  t: number;             // epoch ms
  bpm: number;
  rmssd: number | null;
  phase: 'pre' | 'during' | 'post';
}

export interface BpmJourneySnapshot {
  points: JourneyPoint[];
  preAvgBpm: number | null;
  duringAvgBpm: number | null;
  postAvgBpm: number | null;
  bpmDropDuring: number | null;     // baseline (pre) - during
  improvementPct: number | null;    // ((pre - during) / pre) * 100
  message: string;
  hasPre: boolean;
  hasDuring: boolean;
  hasPost: boolean;
}

interface AmbRow { timestamp: string; bpm: number; rmssd: number }

const avg = (arr: number[]): number | null =>
  arr.length === 0 ? null : arr.reduce((a, b) => a + b, 0) / arr.length;

export const buildBpmJourney = async (
  sessionId: string | null,
  opts: { preMinutes?: number; postMinutes?: number } = {}
): Promise<BpmJourneySnapshot> => {
  const preMin = opts.preMinutes ?? 10;
  const postMin = opts.postMinutes ?? 30;
  const db = await getDB();

  if (!sessionId) {
    // No session selected — just show ambient context for last (pre+post) minutes
    const rows = await db.getAllAsync<AmbRow>(
      `SELECT timestamp, ambient_bpm AS bpm, ambient_rmssd AS rmssd
       FROM ambient_baseline
       WHERE timestamp >= datetime('now', '-${preMin + postMin} minutes')
       ORDER BY timestamp ASC`
    );
    const points: JourneyPoint[] = rows.map(r => ({
      t: new Date(r.timestamp).getTime(),
      bpm: r.bpm,
      rmssd: r.rmssd ?? null,
      phase: 'pre',
    }));
    return {
      points,
      preAvgBpm: avg(points.map(p => p.bpm)),
      duringAvgBpm: null,
      postAvgBpm: null,
      bpmDropDuring: null,
      improvementPct: null,
      message: points.length > 0
        ? 'Showing your ambient BPM. Start a Soulsync session to see the full pre/during/post journey.'
        : 'Soulsync is warming up — open the app for a minute or two so we can sample your baseline.',
      hasPre: points.length > 0,
      hasDuring: false,
      hasPost: false,
    };
  }

  // Look up the session
  const sessions = await db.getAllAsync<{ session_id: string; start_time: string; end_time: string | null }>(
    `SELECT session_id, start_time, end_time FROM session_spiritual WHERE session_id = ?`,
    [sessionId]
  );
  const session = sessions[0];
  if (!session) {
    return {
      points: [],
      preAvgBpm: null, duringAvgBpm: null, postAvgBpm: null,
      bpmDropDuring: null, improvementPct: null,
      message: 'Session not found.',
      hasPre: false, hasDuring: false, hasPost: false,
    };
  }

  const startMs = new Date(session.start_time).getTime();
  const endMs = session.end_time ? new Date(session.end_time).getTime() : Date.now();
  const preStart = new Date(startMs - preMin * 60_000).toISOString();
  const postEnd = new Date(Math.min(Date.now(), endMs + postMin * 60_000)).toISOString();

  // PRE — ambient samples from preStart up to session start
  const preRows = await db.getAllAsync<AmbRow>(
    `SELECT timestamp, ambient_bpm AS bpm, ambient_rmssd AS rmssd
     FROM ambient_baseline
     WHERE timestamp >= ? AND timestamp < ?
     ORDER BY timestamp ASC`,
    [preStart, session.start_time]
  );

  // DURING — session telemetry, downsampled to one row per 5s if huge
  const duringRows = await db.getAllAsync<AmbRow>(
    `SELECT timestamp, bpm, rmssd_ms AS rmssd
     FROM session_telemetry
     WHERE session_id = ?
     ORDER BY timestamp ASC`,
    [sessionId]
  );

  // POST — ambient samples from session end up to now (capped at postMinutes)
  let postRows: AmbRow[] = [];
  if (session.end_time) {
    postRows = await db.getAllAsync<AmbRow>(
      `SELECT timestamp, ambient_bpm AS bpm, ambient_rmssd AS rmssd
       FROM ambient_baseline
       WHERE timestamp > ? AND timestamp <= ?
       ORDER BY timestamp ASC`,
      [session.end_time, postEnd]
    );
  }

  const toPoint = (phase: JourneyPoint['phase']) => (r: AmbRow): JourneyPoint => ({
    t: new Date(r.timestamp).getTime(),
    bpm: r.bpm,
    rmssd: r.rmssd ?? null,
    phase,
  });

  const points: JourneyPoint[] = [
    ...preRows.map(toPoint('pre')),
    ...duringRows.map(toPoint('during')),
    ...postRows.map(toPoint('post')),
  ];

  const preAvgBpm    = avg(preRows.map(r => r.bpm));
  const duringAvgBpm = avg(duringRows.map(r => r.bpm));
  const postAvgBpm   = avg(postRows.map(r => r.bpm));

  const bpmDropDuring =
    preAvgBpm != null && duringAvgBpm != null ? preAvgBpm - duringAvgBpm : null;
  const improvementPct =
    preAvgBpm != null && duringAvgBpm != null && preAvgBpm > 0
      ? ((preAvgBpm - duringAvgBpm) / preAvgBpm) * 100
      : null;

  let message: string;
  if (improvementPct != null && improvementPct > 3) {
    message = `BPM dropped ${(bpmDropDuring ?? 0).toFixed(0)} bpm during Japa · ${improvementPct.toFixed(0)}% calmer than the minutes before.`;
  } else if (improvementPct != null && improvementPct < -3) {
    message = `BPM rose ${Math.abs(bpmDropDuring ?? 0).toFixed(0)} bpm during this session — try slowing the chant.`;
  } else if (improvementPct != null) {
    message = 'Session BPM tracked close to your pre-Japa baseline.';
  } else {
    message = 'Need more ambient data before the session to compute the pre/during comparison.';
  }

  return {
    points,
    preAvgBpm,
    duringAvgBpm,
    postAvgBpm,
    bpmDropDuring,
    improvementPct,
    message,
    hasPre: preRows.length > 0,
    hasDuring: duringRows.length > 0,
    hasPost: postRows.length > 0,
  };
};

/** Convenience: latest session id (active or most-recent completed). */
export const latestSessionId = async (): Promise<string | null> => {
  const db = await getDB();
  const row = await db.getFirstAsync<{ session_id: string }>(
    `SELECT session_id FROM session_spiritual ORDER BY start_time DESC LIMIT 1`
  );
  return row?.session_id ?? null;
};
