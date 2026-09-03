/**
 * JapaEffectCard — replaces the old SoulsyncScoreCard's "Mind" bar AND
 * the standalone Meditation Depth Score. ONE scientifically-grounded
 * card with:
 *
 *   • Big 0–100 score (Japa Effect)
 *   • Plain-English note about today's session quality
 *   • Comparison table: Baseline vs Japa vs Δ for each underlying metric
 *
 * The composite score is computed in analytics/JapaEffect.ts using
 * peer-reviewed thresholds (Benson, Lehrer, Tang, Bernardi).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { computeJapaEffect, JapaEffectSnapshot, MetricDelta } from '../analytics/JapaEffect';

const colorFor = (score: number, isZero: boolean): string => {
  if (isZero) return COLORS.muted;
  if (score >= 80) return '#3ddc84';
  if (score >= 60) return '#FFB800';
  if (score >= 40) return '#FFD54F';
  return '#ff8c42';
};

export const JapaEffectCard: React.FC = () => {
  const [snap, setSnap] = useState<JapaEffectSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const s = await computeJapaEffect();
        if (!cancelled) setSnap(s);
      } catch { /* soft fail */ }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!snap) {
    return (
      <View style={styles.card}>
        <Text style={styles.loading}>Calculating today&apos;s Japa Effect…</Text>
      </View>
    );
  }

  const c = colorFor(snap.score, !snap.hasJapaToday);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Japa Effect Score</Text>
        <Text style={styles.subtitle}>Today&apos;s session impact</Text>
      </View>

      <View style={styles.bigRow}>
        <Text style={[styles.bigNumber, { color: c }]}>
          {snap.hasJapaToday ? snap.score : '—'}
        </Text>
        <Text style={styles.bigOutOf}>/ 100</Text>
      </View>

      {/* Insight note — derived from the score */}
      <Text style={styles.note}>{snap.note}</Text>

      {/* Session summary chip */}
      {snap.hasJapaToday && (
        <View style={styles.sessionChip}>
          <Text style={styles.sessionChipText}>
            🕉️ {snap.sessionCount} session{snap.sessionCount !== 1 ? 's' : ''} · {snap.japaMinutes} min
          </Text>
        </View>
      )}

      {/* Comparison table */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHead, { flex: 1.6 }]}>Metric</Text>
        <Text style={[styles.tableCellHead, { flex: 1, textAlign: 'right' }]}>Baseline</Text>
        <Text style={[styles.tableCellHead, { flex: 1, textAlign: 'right' }]}>Japa</Text>
        <Text style={[styles.tableCellHead, { flex: 0.9, textAlign: 'right' }]}>Δ</Text>
        <Text style={[styles.tableCellHead, { flex: 0.7, textAlign: 'right' }]}>Pts</Text>
      </View>
      {snap.metrics.map(m => <Row key={m.label} m={m} />)}

      <Text style={styles.footnote}>
        Weighted: HRV 40% · BPM 30% · Duration 20% · SpO₂ 10%
      </Text>
    </View>
  );
};

const fmt = (v: number | null, unit: string): string => {
  if (v == null) return '—';
  if (unit === '%')   return v.toFixed(1) + '%';
  if (unit === 'ms')  return Math.round(v) + 'ms';
  if (unit === 'bpm') return Math.round(v).toString();
  if (unit === 'min') return Math.round(v) + 'm';
  return String(v);
};

const fmtDelta = (m: MetricDelta): string => {
  if (m.delta == null) return '—';
  const sign = m.delta > 0 ? '+' : '';
  if (m.unit === 'min')   return `${Math.round(m.delta)}m`;
  if (m.unit === 'ms')    return `${sign}${Math.round(m.delta)}ms`;
  if (m.unit === 'bpm')   return `${sign}${Math.round(m.delta)}`;
  if (m.unit === '%')     return `${sign}${m.delta.toFixed(1)}%`;
  return `${sign}${m.delta}`;
};

const Row: React.FC<{ m: MetricDelta }> = ({ m }) => {
  const ptsColor = colorFor(m.points, m.points === 0 && m.delta == null);
  const isPositiveDelta = m.delta != null && m.delta > 0;
  const isNegativeDelta = m.delta != null && m.delta < 0;
  return (
    <View style={styles.tableRow}>
      <View style={{ flex: 1.6 }}>
        <Text style={styles.metricLabel}>{m.label}</Text>
        <Text style={styles.metricWeight}>weight {Math.round(m.weight * 100)}%</Text>
      </View>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
        {fmt(m.baseline, m.unit)}
      </Text>
      <Text style={[styles.tableCell, { flex: 1, textAlign: 'right' }]}>
        {fmt(m.japa, m.unit)}
      </Text>
      <Text style={[
        styles.tableCell, { flex: 0.9, textAlign: 'right', fontWeight: '700' },
        isPositiveDelta && { color: '#3ddc84' },
        isNegativeDelta && { color: '#ff8c42' },
      ]}>
        {fmtDelta(m)}
      </Text>
      <Text style={[styles.tableCell, { flex: 0.7, textAlign: 'right', color: ptsColor, fontWeight: '700' }]}>
        {m.points}
      </Text>
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

  headerRow: { marginBottom: SPACING.sm },
  title: {
    fontSize: 13, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2, fontStyle: 'italic' },

  bigRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 4 },
  bigNumber: { fontSize: 56, fontWeight: '700', lineHeight: 60 },
  bigOutOf: { fontSize: 16, color: COLORS.muted, marginLeft: 6, fontWeight: '500' },

  note: {
    fontSize: 13,
    color: COLORS.cream,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 6,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },

  sessionChip: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: SPACING.md,
  },
  sessionChipText: { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  tableHeader: {
    flexDirection: 'row',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableCellHead: {
    fontSize: 10,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  metricLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  metricWeight: { fontSize: 9, color: COLORS.muted, marginTop: 1 },
  tableCell: { fontSize: 12, color: COLORS.cream },
  footnote: {
    fontSize: 9, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.sm,
  },
});
