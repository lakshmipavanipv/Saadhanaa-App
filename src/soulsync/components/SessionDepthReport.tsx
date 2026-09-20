/**
 * SessionDepthReport — the Sadhana Depth Score for the sitting that just ended.
 *
 * WHERE THIS SITS AND WHY
 *
 * At the BOTTOM of the Japa, Yoga and Meditation screens, below the practice
 * itself. The score used to sit at the top, as a daily figure, above the bead
 * counter — which asked the reader to watch a number that nothing they were
 * about to do could move, and which mixed a focused morning sitting with a
 * distracted evening one into an average describing neither.
 *
 * Depth is a property of a sitting. It can only be known once the sitting has
 * ended, so it belongs after it, not before it.
 *
 * WHAT IT SHOWS
 *
 * The score, the band word, and every component with its measured figure — so
 * "62" is never a number the reader has to take on trust. The weakest
 * component drives one sentence of advice, because "you scored 62" tells a
 * practitioner nothing they can do differently.
 *
 * WHEN THERE IS NO SCORE it says why, in a full sentence, and what would fix
 * it. A blank with an explanation is a usable answer; a zero is a lie.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING } from '../../theme';
import {
  lastSessionDepth, depthBand,
  type Practice, type SessionDepth,
} from '../analytics/SadhanaDepth';

interface Props {
  practice: Practice;
  /** Change this to force a re-read — e.g. after a session ends. */
  refreshKey?: number | string;
}

const PRACTICE_WORD: Record<Practice, string> = {
  japa: 'japa', yoga: 'yoga', meditation: 'meditation',
};

const BASELINE_WORD: Record<string, string> = {
  'pre-session': 'the hour before you sat',
  'personal-30d': 'your usual day over the last month',
  none: 'no baseline yet',
};

export const SessionDepthReport: React.FC<Props> = ({ practice, refreshKey }) => {
  const [depth, setDepth] = useState<SessionDepth | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    void lastSessionDepth(practice).then((d) => {
      if (!alive) return;
      setDepth(d);
      setLoaded(true);
    });
    return () => { alive = false; };
  }, [practice]);

  useEffect(load, [load, refreshKey]);
  // Re-read on focus too: a session may have been ended from another tab.
  useFocusEffect(load);

  if (!loaded) return null;

  // ── Nothing recorded yet ────────────────────────────────────────────
  if (!depth) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>SADHANA DEPTH</Text>
        <Text style={styles.empty}>
          Start Soul Sync before you sit and this fills in when you stop. It
          measures what your {PRACTICE_WORD[practice]} did to your body —
          heart-rate variability, how far your pulse settled, how steady you
          held — against how you were beforehand.
        </Text>
        <Text style={styles.footnote}>
          Nothing appears here until a sitting has actually been measured. There
          is no score for a session that did not happen.
        </Text>
      </View>
    );
  }

  const when = depth.endedAt ?? depth.startedAt;
  const whenText = when
    ? when.toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : '';

  // ── A sitting happened but could not be scored ──────────────────────
  if (depth.score == null) {
    return (
      <View style={styles.card}>
        <Text style={styles.kicker}>SADHANA DEPTH · LAST SITTING</Text>
        <Text style={styles.when}>{whenText} · {Math.round(depth.durationMin)} min</Text>
        <Text style={styles.empty}>{depth.whyBlank}</Text>
      </View>
    );
  }

  const band = depthBand(depth.score);
  const scored = depth.components.filter((c) => c.points != null);

  return (
    <View style={[styles.card, { borderColor: band.color + '55' }]}>
      <Text style={styles.kicker}>SADHANA DEPTH · LAST SITTING</Text>
      <Text style={styles.when}>
        {whenText} · {Math.round(depth.durationMin)} min
        {depth.deityName ? ` · ${depth.deityName}` : ''}
      </Text>

      <View style={styles.heroRow}>
        <Text style={[styles.score, { color: band.color }]}>{depth.score}</Text>
        <View style={styles.heroText}>
          <Text style={[styles.bandWord, { color: band.color }]}>
            {band.emoji} {band.label}
          </Text>
          <Text style={styles.outOf}>out of 100</Text>
        </View>
      </View>

      <Text style={styles.note}>{depth.note}</Text>

      {/* Components. Always visible — the score is only trustworthy if the
          parts that made it are on the same screen. */}
      <View style={styles.components}>
        {depth.components.map((c) => {
          const has = c.points != null;
          return (
            <View key={c.key} style={styles.compRow}>
              <View style={styles.compHead}>
                <Text style={[styles.compLabel, !has && styles.dim]}>{c.label}</Text>
                <Text style={styles.compWeight}>{Math.round(c.weight * 100)}%</Text>
                <Text style={[styles.compPts, { color: has ? depthBand(c.points as number).color : COLORS.muted }]}>
                  {has ? Math.round(c.points as number) : '—'}
                </Text>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${has ? (c.points as number) : 0}%`,
                      backgroundColor: has ? depthBand(c.points as number).color : 'transparent',
                    },
                  ]}
                />
              </View>
              <Text style={styles.compDetail}>{c.detail}</Text>
            </View>
          );
        })}
      </View>

      {/* Confidence. A score built on two of five components is a different
          claim from one built on all five, and must not look identical. */}
      {depth.confidence < 0.999 && (
        <Text style={styles.confidence}>
          Built on {scored.length} of {depth.components.length} measures
          ({Math.round(depth.confidence * 100)}% of the model). The rest had no
          reading, so they were left out rather than scored zero.
        </Text>
      )}

      {/* ── Baseline against sadhana time ──
          The score is a summary; this is the evidence. Both sides of every
          reading the ring took, so the number above can be checked rather
          than taken on trust. Rows the score does not use are marked, because
          a row that looks scored but is not is worse than one that says so. */}
      {(() => {
        const vitals: {
          key: string; label: string; unit: string;
          base: number | null; during: number | null;
          lowerIsBetter: boolean; weight: number;
        }[] = [
          { key: 'hrv', label: 'HRV (RMSSD)', unit: 'ms',
            base: depth.baselineRmssd, during: depth.sessionRmssd,
            lowerIsBetter: false, weight: 35 },
          { key: 'hr', label: 'Heart rate', unit: 'bpm',
            base: depth.baselineBpm, during: depth.sessionBpm,
            lowerIsBetter: true, weight: 25 },
          { key: 'spo2', label: 'Blood oxygen', unit: '%',
            base: depth.baselineSpo2, during: depth.sessionSpo2,
            lowerIsBetter: false, weight: 0 },
          { key: 'temp', label: 'Skin temperature', unit: '°C',
            base: depth.baselineTempC, during: depth.sessionTempC,
            lowerIsBetter: true, weight: 0 },
        ];
        if (!vitals.some((v) => v.base != null || v.during != null)) return null;

        return (
          <>
            <Text style={styles.sectionHead}>BASELINE vs SADHANA TIME</Text>
            <View style={styles.vHead}>
              <Text style={[styles.vTh, styles.vName]}>Vital</Text>
              <Text style={styles.vTh}>Baseline</Text>
              <Text style={styles.vTh}>In sadhana</Text>
              <Text style={styles.vTh}>Change</Text>
            </View>
            {vitals.map((v) => {
              const delta = v.base != null && v.during != null
                ? Math.round((v.during - v.base) * 10) / 10
                : null;
              const better = delta == null || delta === 0 ? null
                : (v.lowerIsBetter ? delta < 0 : delta > 0);
              return (
                <View key={v.key} style={styles.vRow}>
                  <View style={styles.vName}>
                    <Text style={[styles.vLabel, v.weight === 0 && styles.dim]}>{v.label}</Text>
                    <Text style={styles.vWeight}>
                      {v.weight > 0 ? `${v.weight}% of the score` : 'context only'}
                    </Text>
                  </View>
                  <Text style={styles.vTd}>{v.base != null ? v.base : '—'}</Text>
                  <Text style={styles.vTd}>{v.during != null ? v.during : '—'}</Text>
                  <Text style={[
                    styles.vTd,
                    better === true && styles.vGood,
                    better === false && styles.vBad,
                  ]}>
                    {delta != null
                      ? `${delta > 0 ? '+' : delta < 0 ? '−' : ''}${Math.abs(delta)}${v.unit}`
                      : '—'}
                  </Text>
                </View>
              );
            })}
            <Text style={styles.vFoot}>
              Baseline is {BASELINE_WORD[depth.baselineSource] ?? 'no baseline yet'}.
            </Text>
          </>
        );
      })()}

      <TouchableOpacity onPress={() => setOpen((o) => !o)} activeOpacity={0.7}>
        <Text style={styles.moreLink}>
          {open ? 'Hide how this is measured ▴' : 'How is this measured? ▾'}
        </Text>
      </TouchableOpacity>

      {open && (
        <View style={styles.explain}>
          <Text style={styles.explainText}>
            Compared against {BASELINE_WORD[depth.baselineSource] ?? 'no baseline'}.
            {depth.baselineSource === 'personal-30d'
              ? ' The hour before you sat had too few readings, so your monthly normal was used instead — a weaker comparison, because the day you were having leaks into it.'
              : depth.baselineSource === 'pre-session'
                ? ' That is the strongest comparison available: it holds the day itself constant, so what changed can be attributed to the sitting.'
                : ''}
          </Text>
          {depth.components.map((c) => (
            <Text key={c.key} style={styles.explainText}>
              <Text style={styles.explainLabel}>{c.label} · {Math.round(c.weight * 100)}% — </Text>
              {c.plain}
            </Text>
          ))}
          <Text style={styles.explainText}>
            Your heart rate averaged {depth.sessionBpm ?? '—'} bpm during the
            sitting{depth.baselineBpm != null ? `, against ${depth.baselineBpm} bpm at baseline` : ''}.
            {depth.sessionRmssd != null ? ` HRV averaged ${depth.sessionRmssd} ms.` : ''}
            {' '}Measured from {depth.telemetryN} readings.
          </Text>
          <Text style={styles.explainFoot}>
            This is a wellness measure of how your body responded, not a
            judgement of the practice. A settled body and a distracted mind can
            both be true at once.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  kicker: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.6 },
  when: { color: COLORS.muted, fontSize: 11.5, marginTop: 4 },

  heroRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginTop: SPACING.sm },
  score: { fontSize: 52, fontWeight: '700', letterSpacing: -2 },
  heroText: { flex: 1 },
  bandWord: { fontSize: 17, fontWeight: '700' },
  outOf: { color: COLORS.muted, fontSize: 11.5, marginTop: 2 },

  note: { color: COLORS.cream, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },

  components: { marginTop: SPACING.md, gap: 12 },
  compRow: {},
  compHead: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  compLabel: { color: COLORS.cream, fontSize: 12.5, fontWeight: '600', flex: 1 },
  compWeight: { color: COLORS.muted, fontSize: 10 },
  compPts: { fontSize: 13, fontWeight: '700', minWidth: 28, textAlign: 'right' },
  dim: { color: COLORS.muted },
  track: {
    height: 5, borderRadius: 3, backgroundColor: COLORS.border,
    marginTop: 5, overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: 3 },
  compDetail: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 4 },

  confidence: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: SPACING.md },

  sectionHead: {
    color: COLORS.muted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.3, marginTop: SPACING.lg, marginBottom: 6,
  },
  vHead: {
    flexDirection: 'row', paddingBottom: 5,
    borderBottomWidth: 1, borderColor: COLORS.border,
  },
  vTh: {
    color: COLORS.muted, fontSize: 9, fontWeight: '800',
    flex: 1, textAlign: 'right', letterSpacing: 0.5,
  },
  vName: { flex: 2, textAlign: 'left' },
  vRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 7, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  vLabel: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  vWeight: { color: COLORS.muted, fontSize: 9, marginTop: 1 },
  vTd: { color: COLORS.cream, fontSize: 12, flex: 1, textAlign: 'right', fontWeight: '600' },
  vGood: { color: '#3ddc84' },
  vBad: { color: '#ff8c42' },
  vFoot: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },

  moreLink: { color: COLORS.gold, fontSize: 12, fontWeight: '600', marginTop: SPACING.md },
  explain: { marginTop: SPACING.sm, gap: 8 },
  explainText: { color: COLORS.muted, fontSize: 11, lineHeight: 16 },
  explainLabel: { color: COLORS.cream, fontWeight: '700' },
  explainFoot: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, fontStyle: 'italic', marginTop: 4 },

  empty: { color: COLORS.muted, fontSize: 12.5, lineHeight: 18, marginTop: SPACING.sm },
  footnote: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: SPACING.sm, opacity: 0.85 },
});
