/**
 * ScoreTrendsCard — the "what is sadhana doing for me over time" view on
 * the Insights tab. Three trend lines (Japa Effect, Sleep, Calm) + KPI
 * tiles showing improvement vs first-week baseline and monthly delta.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { computeScoreTrends, ScoreTrendsSnapshot, TrendPoint, ScoreKPI } from '../analytics/ScoreTrends';

const CHART_W = Dimensions.get('window').width - 64;

interface ChartProps {
  title: string;
  color: string;
  data: TrendPoint[];
}

const TrendChart: React.FC<ChartProps> = ({ title, color, data }) => {
  const numeric = data.map(p => p.score ?? 0);
  if (numeric.every(v => v === 0)) {
    return (
      <View style={styles.chartCard}>
        <Text style={[styles.chartTitle, { color }]}>{title}</Text>
        <Text style={styles.empty}>Not enough data yet</Text>
      </View>
    );
  }
  return (
    <View style={styles.chartCard}>
      <Text style={[styles.chartTitle, { color }]}>{title}</Text>
      <LineChart
        data={{
          labels: data.filter((_, i) => i % 5 === 0).map(p => p.date.slice(5)),
          datasets: [{ data: numeric, color: () => color, strokeWidth: 2.2 }],
        }}
        width={CHART_W}
        height={110}
        bezier
        withDots={false}
        withInnerLines={false}
        chartConfig={{
          backgroundGradientFrom: COLORS.darkBg,
          backgroundGradientTo: COLORS.cardBg,
          color: () => color,
          labelColor: () => COLORS.muted,
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        style={{ borderRadius: 8, marginTop: 4 }}
      />
    </View>
  );
};

const KPITile: React.FC<{ kpi: ScoreKPI; color: string }> = ({ kpi, color }) => {
  const deltaColor = kpi.lifetimeDelta > 0 ? '#3ddc84' : kpi.lifetimeDelta < 0 ? '#ff8c42' : COLORS.muted;
  const sign = kpi.lifetimeDelta > 0 ? '▲ +' : kpi.lifetimeDelta < 0 ? '▼ ' : '• ';
  const monthSign = kpi.monthlyDelta > 0 ? '+' : '';
  return (
    <View style={styles.kpiTile}>
      <Text style={styles.kpiLabel}>{kpi.label}</Text>
      <Text style={[styles.kpiNow, { color }]}>{kpi.now}</Text>
      <Text style={styles.kpiDelta}>
        <Text style={{ color: deltaColor, fontWeight: '700' }}>
          {sign}{Math.abs(kpi.lifetimeDelta)}
        </Text>
        {' '}vs start ({kpi.baseline})
      </Text>
      <Text style={styles.kpiMonth}>
        Monthly: <Text style={{ color: kpi.monthlyDelta >= 0 ? '#3ddc84' : '#ff8c42', fontWeight: '700' }}>
          {monthSign}{kpi.monthlyDelta}
        </Text>
      </Text>
    </View>
  );
};

export const ScoreTrendsCard: React.FC = () => {
  const [snap, setSnap] = useState<ScoreTrendsSnapshot | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await computeScoreTrends();
        if (!cancelled) setSnap(s);
      } catch (e) {
        console.warn('[ScoreTrends] failed:', e);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!snap) {
    return (
      <View style={styles.card}>
        <Text style={styles.loading}>Loading trends…</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>How Sadhana Is Changing You</Text>
      <Text style={styles.cardSubtitle}>30-day trends · scores improving = practice working</Text>

      {/* KPI row */}
      <View style={styles.kpiRow}>
        <KPITile kpi={snap.kpis[0]} color="#FFB800" />
        <KPITile kpi={snap.kpis[1]} color="#4ea8de" />
        <KPITile kpi={snap.kpis[2]} color="#d6e040" />
      </View>

      {/* Two trend charts — Sleep gets its own full card below with the
          detailed breakdown + deep-sleep trend, so we don't duplicate it here. */}
      <TrendChart title="Japa Effect Score" color="#FFB800" data={snap.japa} />
      <TrendChart title="Calm Score"        color="#d6e040" data={snap.calm} />
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.2)',
  },
  loading: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center' },
  cardTitle: {
    fontSize: 14, color: COLORS.cream, fontWeight: '700',
    letterSpacing: 0.5,
  },
  cardSubtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.md },

  kpiRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  kpiTile: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.2)',
    padding: SPACING.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  kpiLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 0.8 },
  kpiNow: { fontSize: 24, fontWeight: '700', marginTop: 2 },
  kpiDelta: { fontSize: 9, color: COLORS.cream, marginTop: 2 },
  kpiMonth: { fontSize: 9, color: COLORS.cream, marginTop: 1 },

  chartCard: {
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  chartTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.5 },
  empty: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: SPACING.sm },
});
