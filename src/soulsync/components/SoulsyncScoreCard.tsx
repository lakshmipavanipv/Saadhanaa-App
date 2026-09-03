/**
 * SoulsyncScoreCard — the single primary "how am I doing?" card.
 *
 * Replaces the multi-card Bio-Spiritual Matrix + Health Dashboard pile-up
 * on the home tab. Shows one big number (Soulsync Score, 0-100) split into
 * two intuitive halves:
 *
 *   • Physical Score   — body state (HRV, resting BPM, SpO2, sleep)
 *   • Meditation Score — sadhana depth (peaks, HRV gain, session length)
 *
 * Language is intentionally simple — elderly users should understand at
 * a glance: bigger = better.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';
import { computeHealthDashboard } from '../analytics/HealthDashboard';

interface ScorePack {
  overall: number | null;      // 0-100, null until the ring has measured something
  dayBaseline: number | null;  // 0-100 — passive ambient state (not meditating)
  japaEffect: number;          // 0-100 — active state during/after sessions
  delta: number | null;        // japaEffect − dayBaseline; needs both to mean anything
  label: string;               // simple description ("Great today!" / "Take it easy")
  hasJapaToday: boolean;       // whether the user actually meditated today
}

/** Map a 0-100 score to an emoji + a one-line plain-English message. */
const labelFor = (score: number | null): string => {
  if (score == null) return '🪷 Wear your ring to see today’s score';
  if (score >= 80) return '🌟 You are doing great today';
  if (score >= 60) return '🙂 A good day overall';
  if (score >= 40) return '🌱 Room to grow today';
  if (score >= 20) return '🌿 Take it easy today';
  return '🪷 Begin slowly today';
};

/** Map a score to a warm color (red→amber→citrine→green). */
const colorFor = (score: number | null): string => {
  if (score == null) return COLORS.muted;
  if (score >= 80) return '#3ddc84';
  if (score >= 60) return '#FFB800';
  if (score >= 40) return '#FFD54F';
  return '#ff8c42';
};

export const computeScores = async (): Promise<ScorePack> => {
  const dash = await computeHealthDashboard();
  const [bpm, hrv, spo2, tempC] = dash.metrics;

  // ── DAY BASELINE: how the body is at rest TODAY (ambient/passive state)
  //    Source: ambient_baseline table — readings from non-session times only.
  //    A metric the ring never measured contributes nothing: it used to
  //    default to 50, which quietly manufactured a mid-range score out of
  //    an empty database (no ring data at all still rendered a confident
  //    "50/100"). Now each missing metric drops out and the surviving
  //    weights are renormalised, so the number always describes something
  //    that was actually measured — and stays null when nothing was.
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const parts: { score: number; weight: number }[] = [];
  const add = (raw: number, score: () => number, weight: number) => {
    if (raw > 0) parts.push({ score: clamp(score()), weight });
  };

  add(hrv.today,   () => (hrv.today / 60) * 100, 0.4);              // 60ms = perfect
  add(bpm.today,   () => 100 - Math.max(0, bpm.today - 60) * 1.8, 0.3);
  add(spo2.today,  () => (spo2.today - 90) * 10, 0.2);              // 100% = perfect
  add(tempC.today, () => 100 - Math.abs(tempC.today - 36.6) * 30, 0.1);

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  const dayBaseline = weightSum > 0
    ? Math.round(parts.reduce((s, p) => s + p.score * p.weight, 0) / weightSum)
    : null;

  // ── JAPA EFFECT: how the body responds DURING / AFTER sadhana sessions.
  //    Source: session_spiritual table (depthScore) — completely separate
  //    from ambient data. Captures HRV gain, BPM drop, duration, SpO2
  //    stability while meditating.
  const hasJapaToday = dash.depthScore != null && dash.depthScoreSamples > 0;
  const japaEffect = hasJapaToday
    ? Math.round((dash.depthScore as number) * 10)
    : 0;   // 0 = "no japa yet today" — visually flat, prompts the user

  // ── DELTA: positive = japa is lifting you above your baseline.
  //    This is the real proof of practice impact, so it needs a real
  //    baseline to measure against — no baseline, no claim.
  const delta = hasJapaToday && dayBaseline != null
    ? japaEffect - dayBaseline
    : null;

  // ── OVERALL: balanced average. Tilts toward Japa Effect (the app's
  //    primary purpose) — 45% baseline + 55% japa. Whichever half the
  //    ring hasn't earned yet is left out rather than filled in.
  const overall =
    hasJapaToday && dayBaseline != null
      ? Math.round(dayBaseline * 0.45 + japaEffect * 0.55)
      : hasJapaToday
        ? japaEffect       // measured sadhana, no ambient reading yet
        : dayBaseline;     // before today's japa, overall = resting state (may be null)

  return { overall, dayBaseline, japaEffect, delta, hasJapaToday, label: labelFor(overall) };
};

export const SoulsyncScoreCard: React.FC = () => {
  const [scores, setScores] = useState<ScorePack | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const s = await computeScores();
        if (!cancelled) setScores(s);
      } catch {
        // soft-fail — keep previous
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!scores) {
    return (
      <View style={styles.card}>
        <Text style={styles.loading}>Calculating your score…</Text>
      </View>
    );
  }

  const overallColor = colorFor(scores.overall);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Commitment Score</Text>

      <View style={styles.bigRow}>
        <Text style={[styles.bigNumber, { color: overallColor }]}>
          {scores.overall ?? '—'}
        </Text>
        <Text style={styles.bigOutOf}>/ 100</Text>
      </View>
      <Text style={styles.bigLabel}>{scores.label}</Text>

      <View style={styles.barRow}>
        <ScoreBar label="Body Health Score" score={scores.dayBaseline} icon="❤️" />
        <ScoreBar label="Soul Sadhana Depth" score={scores.japaEffect} icon="🪷"
                  empty={!scores.hasJapaToday} />
      </View>

      {/* DELTA — only when there's been japa AND a baseline to compare it to */}
      {scores.hasJapaToday && scores.delta != null && (
        <View style={styles.deltaRow}>
          <Text style={styles.deltaLabel}>What japa did for you today:</Text>
          <Text style={[
            styles.deltaValue,
            { color: scores.delta > 0 ? '#3ddc84' : scores.delta < 0 ? '#ff8c42' : COLORS.muted },
          ]}>
            {scores.delta > 0 ? `+${scores.delta}` : scores.delta} pts
          </Text>
        </View>
      )}
      {!scores.hasJapaToday && (
        <Text style={styles.noJapaHint}>
          🪷 No japa session today yet — tap a deity to start and see your Japa Effect grow
        </Text>
      )}
    </View>
  );
};

const ScoreBar: React.FC<{
  label: string;
  score: number | null;
  icon: string;
  empty?: boolean;
}> = ({ label, score, icon, empty: emptyProp }) => {
  // An unmeasured score is empty for the same reason an explicitly empty
  // one is: there is nothing to draw a bar from.
  const empty = emptyProp || score == null;
  return (
  <View style={styles.barCol}>
    <View style={styles.barHeader}>
      <Text style={styles.barIcon}>{icon}</Text>
      <Text style={styles.barLabel}>{label}</Text>
      <Text style={[
        styles.barScore,
        { color: empty ? COLORS.muted : colorFor(score) },
      ]}>
        {empty ? '—' : score}
      </Text>
    </View>
    <View style={styles.barTrack}>
      {!empty && (
        <View
          style={[
            styles.barFill,
            { width: `${score}%`, backgroundColor: colorFor(score) },
          ]}
        />
      )}
    </View>
  </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  loading: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  title: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginBottom: 4,
  },

  bigRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 6 },
  bigNumber: { fontSize: 56, fontWeight: '700', lineHeight: 60 },
  bigOutOf: { fontSize: 16, color: COLORS.muted, marginLeft: 6, fontWeight: '500' },

  bigLabel: {
    fontSize: 14,
    color: COLORS.cream,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: SPACING.md,
  },

  barRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  barCol: { flex: 1 },
  barHeader: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  barIcon: { fontSize: 14 },
  barLabel: { flex: 1, fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  barScore: { fontSize: 14, fontWeight: '700' },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },

  deltaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  deltaLabel: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic' },
  deltaValue: { fontSize: 16, fontWeight: '700' },
  noJapaHint: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
    lineHeight: 16,
  },
});
