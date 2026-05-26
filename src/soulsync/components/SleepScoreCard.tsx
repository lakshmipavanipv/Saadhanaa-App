/**
 * SleepScoreCard — today's Samsung-style sleep score with a 30-day trend
 * line and 1st-week baseline comparison. Used on both Home (compact) and
 * Insights (full breakdown table).
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { computeSleepScore, SleepScoreSnapshot } from '../analytics/SleepScore';

const CHART_W = Dimensions.get('window').width - 64;

const colorFor = (score: number): string => {
  if (score >= 90) return '#3ddc84';
  if (score >= 80) return '#FFB800';
  if (score >= 50) return '#FFD54F';
  return '#ff8c42';
};

interface Props {
  /** 'compact' = home tab (number + delta only). 'full' = insights tab (table + chart). */
  variant?: 'compact' | 'full';
}

export const SleepScoreCard: React.FC<Props> = ({ variant = 'compact' }) => {
  const [snap, setSnap] = useState<SleepScoreSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await computeSleepScore();
        if (!cancelled) setSnap(s);
      } catch { /* soft fail */ }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!snap) {
    return (
      <View style={styles.card}>
        <Text style={styles.loading}>Calculating sleep score…</Text>
      </View>
    );
  }

  if (!snap.hasData) {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Sleep Score</Text>
        </View>
        <Text style={styles.empty}>
          🌙 No sleep data yet — wear the Saadhana Ring overnight to start tracking.
        </Text>
      </View>
    );
  }

  const c = colorFor(snap.score);
  const deltaColor = snap.delta > 0 ? '#3ddc84' : snap.delta < 0 ? '#ff8c42' : COLORS.muted;
  const deltaSign  = snap.delta > 0 ? '▲ +' : snap.delta < 0 ? '▼ ' : '• ';

  // Compact home variant — just the score + the 7-day vs 1st-week delta
  if (variant === 'compact') {
    return (
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Sleep Score</Text>
          <Text style={styles.subtitle}>Last night</Text>
        </View>
        <View style={styles.bigRow}>
          <Text style={[styles.bigNumber, { color: c }]}>{snap.score}</Text>
          <Text style={styles.bigOutOf}>/ 100 · {snap.label}</Text>
        </View>
        <Text style={styles.compactDelta}>
          7-day avg <Text style={{ color: c, fontWeight: '700' }}>{snap.weeklyAvg}</Text>
          {'  '}
          <Text style={{ color: deltaColor, fontWeight: '700' }}>
            {deltaSign}{Math.abs(snap.delta)} vs first-week baseline ({snap.firstWeekBaseline})
          </Text>
        </Text>
      </View>
    );
  }

  // Full insights variant — chart + breakdown table
  const chartData = snap.trend.map(t => t.score ?? 0);
  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Sleep Score · 30-day Trend</Text>
        <Text style={styles.subtitle}>
          Last night: <Text style={{ color: c, fontWeight: '700' }}>{snap.score}</Text>
          {'  '}·{'  '}
          7-day avg <Text style={{ color: c, fontWeight: '700' }}>{snap.weeklyAvg}</Text>
        </Text>
      </View>

      {snap.trend.length > 0 && (
        <LineChart
          data={{
            labels: snap.trend.filter((_, i) => i % 5 === 0).map(t => t.date.slice(5)),
            datasets: [
              { data: chartData, color: () => '#FFB800', strokeWidth: 2 },
              // Baseline reference line
              { data: chartData.map(() => snap.firstWeekBaseline), color: () => 'rgba(160,160,160,0.5)', strokeWidth: 1, withDots: false } as any,
            ],
          }}
          width={CHART_W}
          height={130}
          bezier
          withDots={false}
          withInnerLines={false}
          chartConfig={{
            backgroundGradientFrom: COLORS.darkBg,
            backgroundGradientTo: COLORS.cardBg,
            color: () => '#FFB800',
            labelColor: () => COLORS.muted,
            strokeWidth: 2,
            propsForBackgroundLines: { stroke: 'transparent' },
          }}
          style={{ borderRadius: 10, marginVertical: 4 }}
        />
      )}

      <Text style={styles.trendCaption}>
        {snap.delta > 0
          ? `▲ Sleep up ${snap.delta} pts since you started — your sadhana is helping you rest deeper.`
          : snap.delta < 0
            ? `▼ Sleep down ${Math.abs(snap.delta)} pts vs first week. Try a 5-min wind-down chant before bed.`
            : 'Sleep is steady at your starting baseline.'}
      </Text>

      {/* Deep sleep hours trend (separate sub-chart) */}
      {snap.deepSleepTrend.length > 0 && (
        <View style={styles.deepBlock}>
          <View style={styles.deepHeader}>
            <Text style={styles.deepTitle}>Deep Sleep Hours · 30 days</Text>
            <Text style={styles.deepBaseline}>
              baseline {snap.deepSleepBaseline} h
            </Text>
          </View>
          <LineChart
            data={{
              labels: snap.deepSleepTrend.filter((_, i) => i % 5 === 0).map(t => t.date.slice(5)),
              datasets: [
                { data: snap.deepSleepTrend.map(t => t.hours ?? 0), color: () => '#7e5bef', strokeWidth: 2 },
                { data: snap.deepSleepTrend.map(() => snap.deepSleepBaseline), color: () => 'rgba(160,160,160,0.5)', strokeWidth: 1, withDots: false } as any,
              ],
            }}
            width={CHART_W}
            height={100}
            bezier
            withDots={false}
            withInnerLines={false}
            chartConfig={{
              backgroundGradientFrom: COLORS.darkBg,
              backgroundGradientTo: COLORS.cardBg,
              color: () => '#7e5bef',
              labelColor: () => COLORS.muted,
              strokeWidth: 2,
              propsForBackgroundLines: { stroke: 'transparent' },
            }}
            style={{ borderRadius: 8, marginTop: 4 }}
          />
        </View>
      )}

      {/* Sub-component breakdown with baseline comparison */}
      <View style={styles.tableHeader}>
        <Text style={[styles.tableCellHead, { flex: 1.3 }]}>Component</Text>
        <Text style={[styles.tableCellHead, { flex: 1.1, textAlign: 'right' }]}>Last night</Text>
        <Text style={[styles.tableCellHead, { flex: 1.1, textAlign: 'right' }]}>Baseline</Text>
        <Text style={[styles.tableCellHead, { flex: 0.6, textAlign: 'right' }]}>Δ</Text>
        <Text style={[styles.tableCellHead, { flex: 0.5, textAlign: 'right' }]}>Pts</Text>
      </View>
      {snap.components.map(c => {
        const delta = (c.rawCurrent != null && c.rawBaseline != null)
          ? c.rawCurrent - c.rawBaseline
          : null;
        const good = delta != null
          ? (c.higherIsBetter ? delta > 0 : delta < 0)
          : null;
        const deltaColor = good == null ? COLORS.muted : good ? '#3ddc84' : '#ff8c42';
        const arrow = delta == null ? '·' : delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
        const deltaText = delta == null ? '—' : Math.abs(delta).toFixed(1);
        return (
          <View key={c.label} style={styles.tableRow}>
            <Text style={[styles.cell, { flex: 1.3 }]}>{c.label}</Text>
            <Text style={[styles.cell, { flex: 1.1, textAlign: 'right' }]}>{c.current ?? '—'}</Text>
            <Text style={[styles.cell, { flex: 1.1, textAlign: 'right', color: COLORS.muted }]}>
              {c.baseline ?? '—'}
            </Text>
            <Text style={[styles.cell, { flex: 0.6, textAlign: 'right', color: deltaColor, fontWeight: '700' }]}>
              {arrow}{deltaText}
            </Text>
            <Text style={[
              styles.cell,
              { flex: 0.5, textAlign: 'right', color: colorFor(c.points), fontWeight: '700' },
            ]}>{c.points}</Text>
          </View>
        );
      })}
      <Text style={styles.tableFootnote}>
        Δ = last night vs your first-week baseline. Green ▲ = improvement.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  loading: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },
  empty: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', lineHeight: 17 },

  headerRow: { marginBottom: SPACING.sm },
  title: {
    fontSize: 13, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
  },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  bigRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  bigNumber: { fontSize: 42, fontWeight: '700', lineHeight: 46 },
  bigOutOf: { fontSize: 13, color: COLORS.muted, marginLeft: 8 },

  compactDelta: { fontSize: 11, color: COLORS.cream, marginTop: 6 },

  trendCaption: {
    fontSize: 11, color: COLORS.cream, fontStyle: 'italic',
    textAlign: 'center', marginTop: 4, lineHeight: 16, paddingHorizontal: SPACING.sm,
  },

  tableHeader: {
    flexDirection: 'row', paddingVertical: 6, marginTop: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  tableCellHead: {
    fontSize: 9, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 0.5, textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 7,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  cell: { fontSize: 11, color: COLORS.cream },
  tableFootnote: {
    fontSize: 9, color: COLORS.muted, fontStyle: 'italic',
    marginTop: SPACING.sm, textAlign: 'center',
  },

  // Deep-sleep hours sub-chart
  deepBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  deepHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginBottom: 4,
  },
  deepTitle: { fontSize: 12, color: '#7e5bef', fontWeight: '700', letterSpacing: 0.5 },
  deepBaseline: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic' },
});
