/**
 * SadhanaDepth — how deeply one sitting landed in the body.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHAT THIS REPLACES, AND WHY
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The old score (`JapaEffect.computeJapaEffect`) had four problems, and they
 * compounded:
 *
 *  1. IT WAS A DAILY AVERAGE PRETENDING TO BE A SESSION SCORE. It pooled every
 *     session of the day and every telemetry row under them. A focused morning
 *     sitting and a distracted evening one produced one number that described
 *     neither, and the user could never see which of the two was which.
 *
 *  2. IT COMPARED AGAINST THE WRONG THING. The baseline was "today's ambient
 *     average" — which INCLUDES the minutes either side of the session, and on
 *     a quiet day is largely made of them. A body that is calm all day scored
 *     badly for not becoming calmer, and a stressful day flattered any sitting
 *     inside it. The comparison has to be against a period the practice did
 *     not touch.
 *
 *  3. DURATION WAS WORTH 20% AND WAS THE ONLY COMPONENT YOU COULD GAME. Leave
 *     the session running while making tea and the score rises. Every other
 *     component required a body that actually settled.
 *
 *  4. IT ALWAYS RETURNED A NUMBER. Missing HRV scored 0 points out of 40 —
 *     indistinguishable from a body that failed to respond. "The ring wasn't
 *     measuring" and "the practice did nothing" are opposite statements and
 *     were rendered identically.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE MODEL
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * A meditative state has a recognisable physiological signature: parasympathetic
 * (vagal) activation. It shows up four ways in what this ring can measure, and
 * one way in what the practitioner chose to do.
 *
 *   VAGAL LIFT        0.35   RMSSD during the sitting, against baseline.
 *                            The most direct marker of vagal tone there is, and
 *                            the one meditation research consistently moves
 *                            (Krygier 2013; Lehrer & Gevirtz 2014).
 *
 *   CARDIAC SETTLING  0.25   Heart rate during the sitting, against baseline.
 *                            Benson's relaxation response: a drop of roughly
 *                            4-15 bpm is the typical range in trained subjects.
 *
 *   STEADINESS        0.20   Coefficient of variation of heart rate WITHIN the
 *                            sitting. A settled body holds a narrow band; a
 *                            restless one swings as posture shifts and
 *                            attention breaks. This is independent information:
 *                            two sittings can share a mean and differ entirely
 *                            in how steady they were.
 *
 *   TRAJECTORY        0.10   Heart rate in the final third minus the first
 *                            third. Distinguishes "arrived already calm" from
 *                            "went deeper as it went on" — which is the thing
 *                            a practitioner is actually training.
 *
 *   SUSTAINED         0.10   Duration. Deliberately the SMALLEST weight, and
 *                            down from 0.20, precisely because it is the only
 *                            component that rewards leaving the app open. It
 *                            is not zero, because HRV effects do need minutes
 *                            to develop (Tang 2007) — but sitting longer must
 *                            never be a substitute for settling.
 *
 * Weights sum to 1.00.
 *
 * WHY SpO2 IS NOT SCORED
 *
 * It was worth 10% before. The SR16 spot-measures SpO2 every few minutes at
 * ±2% accuracy, so a "1% dip during the session" is measurement noise given a
 * physiological name. It is still shown as context, with a weight of zero, so
 * the reader can see it without it moving the number.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * THE BASELINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Preferred: the ambient hour BEFORE the session started. It controls for the
 * day — a fevered afternoon and a rested morning are different bodies, and
 * comparing a sitting against its own immediate context is the only way to
 * attribute the change to the practice.
 *
 * Fallback: the practitioner's own 30-day rolling ambient average, excluding
 * sleep. Weaker, because a day's circumstances leak into the comparison, but
 * far better than a population table for a metric as individual as RMSSD.
 *
 * Which one was used is recorded and shown. It changes what the number means.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * WHEN THERE IS NO SCORE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * `score` is null unless the sitting is at least MIN_MINUTES long, has at
 * least MIN_SAMPLES telemetry rows, and has enough weight behind it to be
 * worth stating. A component with no data does not score zero — it is dropped,
 * and the remaining weights are renormalised, with `confidence` reporting what
 * fraction of the model actually had data. A score at 0.45 confidence is a
 * different claim from one at 1.00 and the UI says so.
 */

import { getDB } from '../db/database';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { piecewise } from './HealthScoreModel';

// ── Gates ──────────────────────────────────────────────────────────────────

/** Below this, a sitting has not had time to show a physiological response. */
export const MIN_MINUTES = 2;
/** Below this many telemetry rows, the averages are not averages. */
export const MIN_SAMPLES = 8;
/** Below this share of the model's weight, we decline to state a score. */
export const MIN_CONFIDENCE = 0.4;

/** The contemplative practices — the ones a depth score is meaningful for. */
export type Practice = 'japa' | 'yoga' | 'meditation';

/**
 * Everything Soul Sync can record, including exercise.
 *
 * Exercise is DELIBERATELY excluded from depth scoring. Three of the five
 * components would be inverted for it: a good workout raises heart rate,
 * widens its variation and pushes it up over time, so a hard run would score
 * "Restless" and a half-hearted one would score better. That is not a
 * calibration problem to be fixed with different anchors — settling is simply
 * not what exercise is for, and a score measuring the wrong thing is worse
 * than no score. Exercise sessions are still recorded and still appear in the
 * history; they just carry no depth.
 */
export type SessionKind = Practice | 'exercise';

export const isScorablePractice = (k: SessionKind): k is Practice => k !== 'exercise';
export type BaselineSource = 'pre-session' | 'personal-30d' | 'none';

export interface DepthComponent {
  key: 'vagal' | 'settle' | 'steady' | 'traject' | 'sustain';
  label: string;
  /** What it means, in words a practitioner can act on. */
  plain: string;
  /** 0-100, or null when the measurement it needs is missing. */
  points: number | null;
  /** Share of the model this component carries. */
  weight: number;
  /** The measured figure behind the points, already formatted. */
  detail: string;
}

export interface SessionDepth {
  sessionId: string;
  practice: Practice | null;
  deityId: string | null;
  deityName: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  durationMin: number;

  /** 0-100, or null when too little was measured to say anything. */
  score: number | null;
  /** Fraction of the model's weight that had data behind it, 0-1. */
  confidence: number;
  components: DepthComponent[];

  baselineSource: BaselineSource;
  baselineBpm: number | null;
  baselineRmssd: number | null;
  baselineSpo2: number | null;
  baselineTempC: number | null;
  sessionBpm: number | null;
  sessionRmssd: number | null;
  sessionSpo2: number | null;
  sessionTempC: number | null;
  hrCv: number | null;
  hrDrift: number | null;
  telemetryN: number;

  /** One sentence the practitioner can act on. Never congratulatory noise. */
  note: string;
  /** Why there is no score, when there is none. Empty string otherwise. */
  whyBlank: string;
}

// ── Component scoring curves ───────────────────────────────────────────────
//
// Each maps a measured change onto 0-100 with 50 meaning "no change from
// baseline". Anchors come from the ranges reported in the literature cited in
// the header; between anchors the mapping is linear because the sources are
// tables of thresholds, not curves, and inventing a curve through them would
// claim precision the evidence does not carry.

/** RMSSD gain in ms. +30 ms is a trained practitioner's vagal response. */
export const scoreVagal = (deltaMs: number): number =>
  piecewise(deltaMs, [[-20, 0], [-10, 25], [0, 50], [10, 70], [20, 85], [30, 100]]);

/** Heart-rate drop in bpm. Benson's relaxation response is 4-15 bpm. */
export const scoreSettle = (dropBpm: number): number =>
  piecewise(dropBpm, [[-8, 0], [-4, 25], [0, 50], [4, 70], [9, 85], [15, 100]]);

/**
 * Within-session steadiness, from the coefficient of variation of heart rate.
 *
 * TWO-SIDED, WHICH IS THE WHOLE POINT
 *
 * The obvious curve is "less variation is better", and it is wrong at the
 * bottom end. A test sitting with a heart rate of exactly 70 bpm for
 * forty-five minutes scored 100 here — and then 100 on duration too, which
 * between them bought a respectable total for a sitting in which NOTHING
 * measurable happened: no settling, no vagal lift, no deepening.
 *
 * A living resting heart rate is never perfectly flat. The SR16 reports
 * averaged heart rate at 1 bpm resolution every half-minute or so, so a
 * dead-flat trace is at least as likely to be quantisation, or a stale value
 * being repeated, as it is to be profound stillness — and it is never evidence
 * of it. Awarding a fifth of the score to sensor resolution is precisely the
 * kind of free number this model exists to remove.
 *
 * So the curve peaks over the band a still body actually occupies — roughly
 * 2-4% — and falls away on both sides: toward restlessness above it, and
 * toward "this reading is not telling us anything" below it.
 *
 * Reference: resting heart-rate CV in a seated, still adult runs about 3-5%;
 * sustained movement or repeated arousal pushes it into double figures.
 */
const scoreSteady = (cvPct: number): number =>
  piecewise(cvPct, [
    [0, 35], [1, 55], [2, 90], [3, 95],       // rising into the plausible band
    [4.5, 85], [6, 68], [8, 48], [11, 28], [15, 10], [19, 0],   // and out of it
  ]);

/** Heart rate in the final third minus the first third. Negative is settling. */
const scoreTrajectory = (driftBpm: number): number =>
  piecewise(driftBpm, [[-8, 100], [-4, 85], [-1, 65], [0, 50], [3, 30], [6, 0]]);

/** Duration. Gains develop over minutes and plateau around twenty (Tang 2007). */
const scoreSustained = (minutes: number): number =>
  piecewise(minutes, [[2, 15], [5, 40], [10, 65], [15, 85], [20, 100]]);

// ── Band words ─────────────────────────────────────────────────────────────

export const depthBand = (score: number): { label: string; emoji: string; color: string } => {
  if (score >= 85) return { label: 'Profound', emoji: '✨', color: '#3ddc84' };
  if (score >= 70) return { label: 'Deep', emoji: '🌟', color: '#7ee787' };
  if (score >= 55) return { label: 'Settled', emoji: '🙂', color: '#FFD54F' };
  if (score >= 40) return { label: 'Light', emoji: '🌱', color: '#FFB800' };
  return { label: 'Restless', emoji: '🌿', color: '#ff8c42' };
};

/**
 * One actionable sentence. Built from the WEAKEST scored component rather than
 * the total, because "you scored 58" tells a practitioner nothing they can do
 * differently, and the lowest component is the one thing that would move next
 * time.
 */
const noteFor = (score: number, components: DepthComponent[]): string => {
  const scored = components.filter((c) => c.points != null) as (DepthComponent & { points: number })[];
  if (!scored.length) return 'Nothing was measured during this sitting.';
  const weakest = scored.reduce((a, b) => (b.points < a.points ? b : a));
  const band = depthBand(score);

  const advice: Record<DepthComponent['key'], string> = {
    vagal: 'Your heart-rate variability barely lifted. Lengthening the out-breath — longer out than in — is the fastest way to raise it.',
    settle: 'Your heart rate stayed near its usual level. Sitting still for a minute before starting gives the body a chance to come down.',
    steady: 'Your heart rate moved around a lot during this sitting, which usually means posture shifts or interruptions rather than a wandering mind.',
    traject: 'You started and finished at about the same depth. Sittings that deepen tend to begin slower than they end.',
    sustain: 'This was a short sitting. The body needs several minutes before the settling response shows up at all.',
  };

  if (score >= 70) {
    return `${band.emoji} ${band.label} sitting — the body clearly settled into it.`;
  }
  return `${band.emoji} ${band.label}. ${advice[weakest.key]}`;
};

// ── Statistics ─────────────────────────────────────────────────────────────

const mean = (xs: number[]): number => xs.reduce((a, b) => a + b, 0) / xs.length;

/** Coefficient of variation as a percentage — standard deviation over mean. */
const cvPct = (xs: number[]): number | null => {
  if (xs.length < 4) return null;
  const m = mean(xs);
  if (m <= 0) return null;
  const varc = xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1);
  return (Math.sqrt(varc) / m) * 100;
};

/** Final third minus first third. Null when there is too little to split. */
const drift = (xs: number[]): number | null => {
  if (xs.length < 9) return null;
  const n = Math.floor(xs.length / 3);
  return mean(xs.slice(-n)) - mean(xs.slice(0, n));
};

const round1 = (n: number): number => Math.round(n * 10) / 10;

// ── The baseline ───────────────────────────────────────────────────────────

interface Baseline {
  source: BaselineSource;
  bpm: number | null;
  rmssd: number | null;
  spo2: number | null;
  tempC: number | null;
}

/**
 * The body this sitting should be compared against.
 *
 * The hour before the session is preferred and is asked for first. It is only
 * accepted with at least four readings behind it — one or two samples is an
 * instant, not a baseline, and comparing against an instant is how a score
 * ends up swinging on a single stray beat.
 */
async function baselineFor(startIso: string): Promise<Baseline> {
  const db = await getDB();
  try {
    const pre = await db.getFirstAsync<{
      bpm: number | null; rmssd: number | null;
      spo2: number | null; temp: number | null; n: number;
    }>(
      `SELECT AVG(NULLIF(ambient_bpm, 0))   AS bpm,
              AVG(NULLIF(ambient_rmssd, 0)) AS rmssd,
              AVG(NULLIF(spo2, 0))          AS spo2,
              AVG(NULLIF(skin_temp_c, 0))   AS temp,
              COUNT(*)                      AS n
         FROM ambient_baseline
        WHERE activity_state != 'sleep'
          AND timestamp <  ?
          AND timestamp >= datetime(?, '-60 minutes')`,
      [startIso, startIso]
    );
    if (pre && pre.n >= 4 && (pre.bpm != null || pre.rmssd != null)) {
      return {
        source: 'pre-session', bpm: pre.bpm, rmssd: pre.rmssd,
        spo2: pre.spo2, tempC: pre.temp,
      };
    }
  } catch { /* fall through to the personal baseline */ }

  try {
    const roll = await ambientBaselineRepo.normalcyBaseline(30);
    if (roll.n >= 10 && (roll.bpm > 0 || roll.rmssd > 0)) {
      return {
        source: 'personal-30d',
        bpm: roll.bpm > 0 ? roll.bpm : null,
        rmssd: roll.rmssd > 0 ? roll.rmssd : null,
        spo2: roll.spo2 > 0 ? roll.spo2 : null,
        tempC: roll.skinTempC > 0 ? roll.skinTempC : null,
      };
    }
  } catch { /* no history yet */ }

  return { source: 'none', bpm: null, rmssd: null, spo2: null, tempC: null };
}

// ── The computation ────────────────────────────────────────────────────────

interface SessionRow {
  session_id: string;
  start_time: string;
  end_time: string | null;
  practice: Practice | null;
  deity_id: string | null;
  deity_name: string | null;
}

/**
 * Score one sitting.
 *
 * Reads the session's own telemetry — never the day's — so two sittings on the
 * same day are scored independently, which is the entire point of moving this
 * off the daily aggregate.
 */
export async function computeSessionDepth(sessionId: string): Promise<SessionDepth> {
  const db = await getDB();

  const row = await db.getFirstAsync<SessionRow>(
    `SELECT session_id, start_time, end_time, practice, deity_id, deity_name
       FROM session_spiritual WHERE session_id = ?`,
    [sessionId]
  );

  const blank = (why: string, partial: Partial<SessionDepth> = {}): SessionDepth => ({
    sessionId,
    practice: row?.practice ?? null,
    deityId: row?.deity_id ?? null,
    deityName: row?.deity_name ?? null,
    startedAt: row?.start_time ? new Date(row.start_time) : null,
    endedAt: row?.end_time ? new Date(row.end_time) : null,
    durationMin: 0,
    score: null,
    confidence: 0,
    components: [],
    baselineSource: 'none',
    baselineBpm: null, baselineRmssd: null, baselineSpo2: null, baselineTempC: null,
    sessionBpm: null, sessionRmssd: null, sessionSpo2: null, sessionTempC: null,
    hrCv: null, hrDrift: null, telemetryN: 0,
    note: 'Nothing was measured during this sitting.',
    whyBlank: why,
    ...partial,
  });

  if (!row) return blank('That session is no longer stored.');

  const startMs = new Date(row.start_time).getTime();
  const endMs = row.end_time ? new Date(row.end_time).getTime() : Date.now();
  const durationMin = Math.max(0, (endMs - startMs) / 60_000);

  // Telemetry, in order. The series matters, not just the averages — steadiness
  // and trajectory are properties of the shape of the sitting.
  const tele = await db.getAllAsync<{
    bpm: number; rmssd_ms: number | null; spo2: number | null; skin_temp_c: number | null;
  }>(
    `SELECT bpm, rmssd_ms, spo2, skin_temp_c FROM session_telemetry
      WHERE session_id = ? ORDER BY timestamp`,
    [sessionId]
  );

  const bpms = tele.map((t) => t.bpm).filter((b) => b > 0);
  const rmssds = tele.map((t) => t.rmssd_ms).filter((r): r is number => r != null && r > 0);
  const spo2s = tele.map((t) => t.spo2).filter((s): s is number => s != null && s > 0);
  const temps = tele.map((t) => t.skin_temp_c).filter((s): s is number => s != null && s > 0);

  const sessionBpm = bpms.length ? round1(mean(bpms)) : null;
  const sessionRmssd = rmssds.length ? round1(mean(rmssds)) : null;
  const sessionSpo2 = spo2s.length ? round1(mean(spo2s)) : null;
  const sessionTempC = temps.length ? round1(mean(temps)) : null;
  const hrCv = cvPct(bpms);
  const hrDrift = drift(bpms);

  if (durationMin < MIN_MINUTES) {
    return blank(
      `This sitting lasted ${durationMin < 1 ? 'under a minute' : `${Math.round(durationMin)} minutes`}. ` +
      `The settling response takes at least ${MIN_MINUTES} minutes to appear, so there is nothing to score yet.`,
      { durationMin, telemetryN: tele.length, sessionBpm, sessionRmssd, sessionSpo2, sessionTempC, hrCv, hrDrift }
    );
  }
  if (tele.length < MIN_SAMPLES) {
    return blank(
      `The ring sent ${tele.length} reading${tele.length === 1 ? '' : 's'} during this sitting, ` +
      `which is too few to average. Keeping the ring snug on the finger usually fixes this.`,
      { durationMin, telemetryN: tele.length, sessionBpm, sessionRmssd, sessionSpo2, sessionTempC, hrCv, hrDrift }
    );
  }

  const base = await baselineFor(row.start_time);

  // ── Components ───────────────────────────────────────────────────────
  const vagalDelta = sessionRmssd != null && base.rmssd != null ? sessionRmssd - base.rmssd : null;
  const settleDrop = sessionBpm != null && base.bpm != null ? base.bpm - sessionBpm : null;

  const components: DepthComponent[] = [
    {
      key: 'vagal', label: 'Vagal lift', weight: 0.35,
      plain: 'How much your heart-rate variability rose above your usual — the clearest sign the body switched into rest.',
      points: vagalDelta != null ? scoreVagal(vagalDelta) : null,
      detail: vagalDelta != null
        ? `${vagalDelta >= 0 ? '+' : ''}${round1(vagalDelta)} ms vs ${round1(base.rmssd as number)} ms baseline`
        : 'No HRV reading to compare',
    },
    {
      key: 'settle', label: 'Cardiac settling', weight: 0.25,
      plain: 'How far your heart rate came down from its usual level while you sat.',
      points: settleDrop != null ? scoreSettle(settleDrop) : null,
      detail: settleDrop != null
        ? `${round1(settleDrop)} bpm below your ${round1(base.bpm as number)} bpm baseline`
        : 'No heart-rate baseline to compare',
    },
    {
      key: 'steady', label: 'Steadiness', weight: 0.20,
      plain: 'How narrow a band your heart rate held. A settled body stays level; interruptions and posture shifts show up here.',
      points: hrCv != null ? scoreSteady(hrCv) : null,
      detail: hrCv != null ? `${round1(hrCv)}% variation across the sitting` : 'Too few readings to measure',
    },
    {
      key: 'traject', label: 'Deepening', weight: 0.10,
      plain: 'Whether you went deeper as the sitting went on, comparing the last third with the first.',
      points: hrDrift != null ? scoreTrajectory(hrDrift) : null,
      detail: hrDrift != null
        ? `${hrDrift <= 0 ? 'fell' : 'rose'} ${Math.abs(round1(hrDrift))} bpm from start to finish`
        : 'Too short to compare start with finish',
    },
    {
      key: 'sustain', label: 'Sustained', weight: 0.10,
      plain: 'How long you sat. The smallest part of the score on purpose — it is the one thing you can raise without settling.',
      points: scoreSustained(durationMin),
      detail: `${Math.round(durationMin)} minutes`,
    },
  ];

  // Renormalise over what was actually measured. A missing component is
  // dropped, NOT scored zero — "the ring wasn't reading" and "your body did
  // not respond" are opposite statements and must not render alike.
  const available = components.filter((c) => c.points != null);
  const weightHad = available.reduce((a, c) => a + c.weight, 0);
  const confidence = Math.round(weightHad * 100) / 100;

  if (weightHad < MIN_CONFIDENCE) {
    return blank(
      base.source === 'none'
        ? 'There is no baseline to compare this sitting against yet. Wear the ring through an ordinary day or two and the score appears from then on.'
        : 'Too little of this sitting was measured to give it a score.',
      {
        durationMin, telemetryN: tele.length, components, confidence,
        sessionBpm, sessionRmssd, sessionSpo2, sessionTempC, hrCv, hrDrift,
        baselineSource: base.source, baselineBpm: base.bpm, baselineRmssd: base.rmssd,
        baselineSpo2: base.spo2, baselineTempC: base.tempC,
      }
    );
  }

  const score = Math.round(
    available.reduce((a, c) => a + (c.points as number) * c.weight, 0) / weightHad
  );

  return {
    sessionId,
    practice: row.practice,
    deityId: row.deity_id,
    deityName: row.deity_name,
    startedAt: new Date(row.start_time),
    endedAt: row.end_time ? new Date(row.end_time) : null,
    durationMin,
    score,
    confidence,
    components,
    baselineSource: base.source,
    baselineBpm: base.bpm != null ? round1(base.bpm) : null,
    baselineRmssd: base.rmssd != null ? round1(base.rmssd) : null,
    baselineSpo2: base.spo2 != null ? round1(base.spo2) : null,
    baselineTempC: base.tempC != null ? round1(base.tempC) : null,
    sessionBpm, sessionRmssd, sessionSpo2, sessionTempC,
    hrCv: hrCv != null ? round1(hrCv) : null,
    hrDrift: hrDrift != null ? round1(hrDrift) : null,
    telemetryN: tele.length,
    note: noteFor(score, components),
    whyBlank: '',
  };
}

/**
 * Score a finished sitting and write the result onto its own row.
 *
 * Called once, when the session ends. The score is stored rather than
 * recomputed on every read for two reasons: telemetry is pruned eventually and
 * a score whose inputs are gone must not silently become a different number;
 * and a score shown in the history tab should mean what it meant on the day,
 * not what today's baseline would make of it.
 */
export async function finaliseSessionDepth(
  sessionId: string,
  meta: { practice: SessionKind; deityId?: string | null; deityName?: string | null },
): Promise<SessionDepth | null> {
  const db = await getDB();

  // Stamp the identity first so `computeSessionDepth` reads it back and the
  // returned snapshot carries the practice and deity for the popup.
  await db.runAsync(
    `UPDATE session_spiritual SET practice = ?, deity_id = ?, deity_name = ? WHERE session_id = ?`,
    [meta.practice, meta.deityId ?? null, meta.deityName ?? null, sessionId]
  );

  // Recorded, not scored. See SessionKind for why exercise gets no depth.
  if (!isScorablePractice(meta.practice)) return null;

  const d = await computeSessionDepth(sessionId);

  const pts = (k: DepthComponent['key']) => d.components.find((c) => c.key === k)?.points ?? null;

  await db.runAsync(
    `UPDATE session_spiritual SET
       depth_score = ?, depth_confidence = ?,
       depth_vagal_pts = ?, depth_settle_pts = ?, depth_steady_pts = ?,
       depth_traject_pts = ?, depth_sustain_pts = ?,
       baseline_bpm = ?, baseline_rmssd = ?, baseline_source = ?,
       baseline_spo2 = ?, baseline_temp_c = ?, session_temp_c = ?,
       session_rmssd = ?, session_hr_cv = ?, session_hr_drift = ?,
       telemetry_n = ?, duration_min = ?
     WHERE session_id = ?`,
    [
      d.score, d.confidence,
      pts('vagal'), pts('settle'), pts('steady'), pts('traject'), pts('sustain'),
      d.baselineBpm, d.baselineRmssd, d.baselineSource,
      d.baselineSpo2, d.baselineTempC, d.sessionTempC,
      d.sessionRmssd, d.hrCv, d.hrDrift,
      d.telemetryN, Math.round(d.durationMin * 10) / 10,
      sessionId,
    ]
  );

  return d;
}

// ── Historical reporting ───────────────────────────────────────────────────

export interface StoredSession {
  session_id: string;
  start_time: string;
  end_time: string | null;
  practice: Practice | null;
  deity_id: string | null;
  deity_name: string | null;
  depth_score: number | null;
  depth_confidence: number | null;
  duration_min: number | null;
  mala_count: number;
  baseline_source: string | null;
}

/**
 * Every scored sitting in a date range, newest last.
 *
 * Sessions with a null `depth_score` are returned too. They are real sittings
 * that happened and they belong in the count of what the practitioner did —
 * only the AVERAGE excludes them, because averaging in a session that could
 * not be scored would drag the figure toward nothing measured.
 */
export async function sessionsInRange(fromIso: string, toIso: string): Promise<StoredSession[]> {
  const db = await getDB();
  try {
    return await db.getAllAsync<StoredSession>(
      `SELECT session_id, start_time, end_time, practice, deity_id, deity_name,
              depth_score, depth_confidence, duration_min, mala_count, baseline_source
         FROM session_spiritual
        WHERE date(start_time) BETWEEN ? AND ?
        ORDER BY start_time`,
      [fromIso, toIso]
    );
  } catch {
    return [];
  }
}

export interface DepthAggregate {
  /** Mean depth across the SCORED sittings only. Null when none were scored. */
  avgScore: number | null;
  /** Best single sitting in the window. */
  bestScore: number | null;
  bestAt: Date | null;
  /** Sittings that happened, and how many of them carry a score. */
  sessions: number;
  scored: number;
  totalMinutes: number;
  /** Days in the window on which at least one sitting happened. */
  activeDays: number;
}

export const aggregateDepth = (rows: StoredSession[]): DepthAggregate => {
  const scored = rows.filter((r) => r.depth_score != null);
  const best = scored.reduce<StoredSession | null>(
    (b, r) => (b == null || (r.depth_score as number) > (b.depth_score as number) ? r : b), null
  );
  return {
    avgScore: scored.length
      ? Math.round(scored.reduce((a, r) => a + (r.depth_score as number), 0) / scored.length)
      : null,
    bestScore: best?.depth_score ?? null,
    bestAt: best ? new Date(best.start_time) : null,
    sessions: rows.length,
    scored: scored.length,
    totalMinutes: Math.round(rows.reduce((a, r) => a + (r.duration_min ?? 0), 0)),
    activeDays: new Set(rows.map((r) => r.start_time.slice(0, 10))).size,
  };
};

export interface DeityDepth {
  deityId: string;
  deityName: string;
  avgScore: number | null;
  sessions: number;
  scored: number;
  minutes: number;
  malas: number;
}

/**
 * The deity breakdown. Sittings with no deity — yoga and meditation — are
 * grouped under the practice they belong to rather than being dropped, so the
 * rows add up to the total above them. A breakdown that does not reconcile
 * with its own header is worse than no breakdown.
 */
export const depthByDeity = (rows: StoredSession[]): DeityDepth[] => {
  const by = new Map<string, DeityDepth & { sum: number }>();
  for (const r of rows) {
    const id = r.deity_id ?? `practice:${r.practice ?? 'other'}`;
    const name = r.deity_name
      ?? (r.practice === 'yoga' ? 'Yoga' : r.practice === 'meditation' ? 'Meditation' : 'Unattributed');
    let e = by.get(id);
    if (!e) {
      e = { deityId: id, deityName: name, avgScore: null, sessions: 0, scored: 0, minutes: 0, malas: 0, sum: 0 };
      by.set(id, e);
    }
    e.sessions++;
    e.minutes += Math.round(r.duration_min ?? 0);
    e.malas += r.mala_count ?? 0;
    if (r.depth_score != null) { e.scored++; e.sum += r.depth_score; }
  }
  return [...by.values()]
    .map(({ sum, ...e }) => ({ ...e, avgScore: e.scored ? Math.round(sum / e.scored) : null }))
    .sort((a, b) => b.sessions - a.sessions);
};

/** Per-day mean depth across a range, for the trend chart. */
export const depthByDay = (rows: StoredSession[]): { date: string; score: number | null; sessions: number }[] => {
  const by = new Map<string, { sum: number; scored: number; sessions: number }>();
  for (const r of rows) {
    const d = r.start_time.slice(0, 10);
    const e = by.get(d) ?? { sum: 0, scored: 0, sessions: 0 };
    e.sessions++;
    if (r.depth_score != null) { e.sum += r.depth_score; e.scored++; }
    by.set(d, e);
  }
  return [...by.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, e]) => ({
      date,
      score: e.scored ? Math.round(e.sum / e.scored) : null,
      sessions: e.sessions,
    }));
};

/**
 * Rebuild a stored sitting's report from its own row.
 *
 * NOT a recomputation. The score was settled when the session ended, against
 * the baseline that existed then, and it must not drift afterwards as the
 * practitioner's rolling normal moves — a sitting that read 72 in March has to
 * still read 72 in June. Every figure the report shows was written to the row
 * at the time precisely so this can be rebuilt without touching telemetry,
 * which is pruned.
 */
const rebuildStored = (r: StoredDepthRow): SessionDepth => {
  const round1x = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10);
  const dur = r.duration_min ?? 0;

  const comp = (
    key: DepthComponent['key'], label: string, weight: number, plain: string,
    points: number | null, detail: string,
  ): DepthComponent => ({ key, label, weight, plain, points, detail });

  const components: DepthComponent[] = [
    comp('vagal', 'Vagal lift', 0.35,
      'How much your heart-rate variability rose above your usual — the clearest sign the body switched into rest.',
      r.depth_vagal_pts,
      r.session_rmssd != null && r.baseline_rmssd != null
        ? `${r.session_rmssd - r.baseline_rmssd >= 0 ? '+' : ''}${round1x(r.session_rmssd - r.baseline_rmssd)} ms vs ${round1x(r.baseline_rmssd)} ms baseline`
        : 'No HRV reading to compare'),
    comp('settle', 'Cardiac settling', 0.25,
      'How far your heart rate came down from its usual level while you sat.',
      r.depth_settle_pts,
      r.session_avg_bpm != null && r.baseline_bpm != null
        ? `${round1x(r.baseline_bpm - r.session_avg_bpm)} bpm below your ${round1x(r.baseline_bpm)} bpm baseline`
        : 'No heart-rate baseline to compare'),
    comp('steady', 'Steadiness', 0.20,
      'How narrow a band your heart rate held. A settled body stays level; interruptions and posture shifts show up here.',
      r.depth_steady_pts,
      r.session_hr_cv != null ? `${round1x(r.session_hr_cv)}% variation across the sitting` : 'Too few readings to measure'),
    comp('traject', 'Deepening', 0.10,
      'Whether you went deeper as the sitting went on, comparing the last third with the first.',
      r.depth_traject_pts,
      r.session_hr_drift != null
        ? `${r.session_hr_drift <= 0 ? 'fell' : 'rose'} ${Math.abs(round1x(r.session_hr_drift) as number)} bpm from start to finish`
        : 'Too short to compare start with finish'),
    comp('sustain', 'Sustained', 0.10,
      'How long you sat. The smallest part of the score on purpose — it is the one thing you can raise without settling.',
      r.depth_sustain_pts, `${Math.round(dur)} minutes`),
  ];

  return {
    sessionId: r.session_id,
    practice: r.practice,
    deityId: r.deity_id,
    deityName: r.deity_name,
    startedAt: new Date(r.start_time),
    endedAt: r.end_time ? new Date(r.end_time) : null,
    durationMin: dur,
    score: r.depth_score,
    confidence: r.depth_confidence ?? 0,
    components,
    baselineSource: (r.baseline_source as BaselineSource) ?? 'none',
    baselineBpm: round1x(r.baseline_bpm),
    baselineRmssd: round1x(r.baseline_rmssd),
    baselineSpo2: round1x(r.baseline_spo2),
    baselineTempC: round1x(r.baseline_temp_c),
    sessionBpm: round1x(r.session_avg_bpm),
    sessionRmssd: round1x(r.session_rmssd),
    sessionSpo2: round1x(r.avg_spo2 ?? null),
    sessionTempC: round1x(r.session_temp_c),
    hrCv: round1x(r.session_hr_cv),
    hrDrift: round1x(r.session_hr_drift),
    telemetryN: r.telemetry_n ?? 0,
    note: r.depth_score != null ? noteFor(r.depth_score, components) : 'This sitting was not scored.',
    whyBlank: r.depth_score != null ? '' : 'This sitting was too short, or too little of it was measured, to score.',
  };
};

interface StoredDepthRow extends StoredSession {
  depth_vagal_pts: number | null;
  depth_settle_pts: number | null;
  depth_steady_pts: number | null;
  depth_traject_pts: number | null;
  depth_sustain_pts: number | null;
  baseline_bpm: number | null;
  baseline_rmssd: number | null;
  baseline_spo2: number | null;
  baseline_temp_c: number | null;
  session_temp_c: number | null;
  session_rmssd: number | null;
  session_avg_bpm: number | null;
  session_hr_cv: number | null;
  session_hr_drift: number | null;
  telemetry_n: number | null;
  avg_spo2: number | null;
}

const STORED_COLS = `session_id, start_time, end_time, practice, deity_id, deity_name,
  depth_score, depth_confidence, duration_min, mala_count, baseline_source,
  depth_vagal_pts, depth_settle_pts, depth_steady_pts, depth_traject_pts, depth_sustain_pts,
  baseline_bpm, baseline_rmssd, baseline_spo2, baseline_temp_c,
  session_rmssd, session_avg_bpm, session_temp_c,
  session_hr_cv, session_hr_drift, telemetry_n, avg_spo2`;

/** One stored sitting's report, rebuilt from its row. */
export async function storedSessionDepth(sessionId: string): Promise<SessionDepth | null> {
  const db = await getDB();
  try {
    const r = await db.getFirstAsync<StoredDepthRow>(
      `SELECT ${STORED_COLS} FROM session_spiritual WHERE session_id = ?`, [sessionId]
    );
    return r ? rebuildStored(r) : null;
  } catch {
    return null;
  }
}

/**
 * The most recent finished sitting of a practice. Drives the report at the
 * bottom of the Japa, Yoga and Meditation screens.
 */
export async function lastSessionDepth(practice: Practice): Promise<SessionDepth | null> {
  const db = await getDB();
  try {
    const r = await db.getFirstAsync<StoredDepthRow>(
      `SELECT ${STORED_COLS} FROM session_spiritual
        WHERE practice = ? AND end_time IS NOT NULL
        ORDER BY start_time DESC LIMIT 1`,
      [practice]
    );
    return r ? rebuildStored(r) : null;
  } catch {
    return null;
  }
}
