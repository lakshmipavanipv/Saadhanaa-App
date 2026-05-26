/**
 * SaadhanaScoreCard — "Today vs Saadhana" table-style card.
 *
 * Replaces the old JapaEffectCard. Uses the same row UI as the previous
 * HealthDashboardCard ("Today vs your normal day") but the right column
 * shows JAPA values (during meditation) instead of today's averages.
 *
 * Composite score = "Saadhana Score" (0-100), weighted blend of HRV gain,
 * BPM drop, duration, SpO2 stability (per JapaEffect.ts scoring tables).
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

const fmtVal = (v: number | null, unit: string): string => {
  if (v == null) return '—';
  if (unit === '°C')  return v.toFixed(1);
  if (unit === '%')   return v.toFixed(1);
  if (unit === '/10') return v.toFixed(1);
  if (unit === 'ms')  return Math.round(v).toString();
  return Math.round(v).toString();
};

export const SaadhanaScoreCard: React.FC = () => {
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
        <Text style={styles.loading}>Calculating Saadhana Score…</Text>
      </View>
    );
  }

  const c = colorFor(snap.score, !snap.hasJapaToday);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Today vs Saadhana</Text>
        <Text style={styles.subtitle}>How your body responds during prayer</Text>
      </View>

      {/* Big Saadhana Score number */}
      <View style={styles.scoreRow}>
        <Text style={styles.scoreLabel}>Saadhana Score</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={[styles.scoreBig, { color: c }]}>
            {snap.hasJapaToday ? snap.score : '—'}
          </Text>
          <Text style={styles.scoreOutOf}>/ 100</Text>
        </View>
      </View>

      {/* Plain-English note — adapts to the score */}
      <Text style={styles.note}>{snap.note}</Text>

      {/* Session summary chip */}
      {snap.hasJapaToday && (
        <View style={styles.sessionChip}>
          <Text style={styles.sessionChipText}>
            🕉️ {snap.sessionCount} session{snap.sessionCount !== 1 ? 's' : ''} · {snap.japaMinutes} min today
          </Text>
        </View>
      )}

      {/* ─── Comparison table — old HealthDashboardCard row style ─── */}
      {snap.metrics.map(m => <MetricRow key={m.label} m={m} hasJapa={snap.hasJapaToday} />)}

      <Text style={styles.footnote}>
        Weighted score: HRV 40% · BPM 30% · Duration 20% · SpO₂ 10%
      </Text>
    </View>
  );
};

const MetricRow: React.FC<{ m: MetricDelta; hasJapa: boolean }> = ({ m, hasJapa }) => {
  const deltaColor = !hasJapa || m.good == null
    ? COLORS.muted
    : m.good ? COLORS.leaf : COLORS.error;
  const arrow = m.deltaPct == null ? '·'
    : m.deltaPct > 0.5 ? '▲'
    : m.deltaPct < -0.5 ? '▼' : '·';
  const pctText = m.deltaPct == null ? '—' : `${Math.abs(m.deltaPct).toFixed(0)}%`;

  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricEmoji}>{m.emoji}</Text>
      <Text style={styles.metricLabel}>{m.label}</Text>
      <View style={styles.metricVals}>
        <Text style={styles.metricBase}>{fmtVal(m.baseline, m.unit)}</Text>
        <Text style={styles.metricArrow}>→</Text>
        <Text style={styles.metricToday}>
          {fmtVal(m.japa, m.unit)}
          {m.unit && <Text style={styles.metricUnit}> {m.unit}</Text>}
        </Text>
      </View>
      <View style={styles.metricDelta}>
        <Text style={[styles.metricDeltaText, { color: deltaColor }]}>
          {arrow} {pctText}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  loading: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },

  headerRow: { marginBottom: SPACING.sm },
  title: { fontSize: 15, color: '#FFB800', fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  scoreLabel: { fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  scoreBig:   { fontSize: 36, fontWeight: '700' },
  scoreOutOf: { fontSize: 13, color: COLORS.muted, marginLeft: 4 },

  note: {
    fontSize: 12,
    color: COLORS.cream,
    fontStyle: 'italic',
    lineHeight: 17,
    marginTop: 6,
    marginBottom: SPACING.sm,
  },

  sessionChip: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 184, 0, 0.12)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    marginBottom: SPACING.sm,
  },
  sessionChipText: { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  // ── EXACT same row UI as the old HealthDashboardCard ────────────
  metricRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  metricEmoji: { fontSize: 18, marginRight: SPACING.sm, width: 24 },
  metricLabel: { flex: 1.2, fontSize: 13, color: COLORS.cream, fontWeight: '500' },
  metricVals: {
    flex: 1.5, flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'flex-end', gap: 6,
  },
  metricBase: { fontSize: 12, color: COLORS.muted },
  metricArrow: { fontSize: 11, color: COLORS.muted },
  metricToday: { fontSize: 16, color: COLORS.cream, fontWeight: '600' },
  metricUnit: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  metricDelta: { width: 58, alignItems: 'flex-end' },
  metricDeltaText: { fontSize: 12, fontWeight: '700' },

  footnote: {
    fontSize: 9, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.md,
  },
});
