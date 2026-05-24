import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { buildMetricTrend, pearson } from '../analytics/MetricTrends';

const CHART_W = Dimensions.get('window').width - 64;

export const StepsJapaCard: React.FC<{ days?: number }> = ({ days = 30 }) => {
  const [steps, setSteps] = useState<number[]>([]);
  const [malas, setMalas] = useState<number[]>([]);
  const [dates, setDates] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [s, m] = await Promise.all([
        buildMetricTrend('steps', days),
        buildMetricTrend('malas', days),
      ]);
      if (cancelled) return;
      setDates(s.map(p => p.date));
      setSteps(s.map(p => p.value ?? 0));
      setMalas(m.map(p => p.value ?? 0));
    })();
    return () => { cancelled = true; };
  }, [days]);

  const r = pearson(steps, malas);
  const maxSteps = Math.max(1, ...steps);
  const maxMalas = Math.max(1, ...malas);
  // Normalise both to 0-100 so they share an axis
  const stepsNorm = steps.map(v => (v / maxSteps) * 100);
  const malasNorm = malas.map(v => (v / maxMalas) * 100);

  const totalSteps = steps.reduce((a, b) => a + b, 0);
  const totalMalas = malas.reduce((a, b) => a + b, 0);

  let insight: string;
  if (steps.filter(v => v > 0).length < 5) {
    insight = 'Keep the ring on a few more days — we need a bit more data to find the link.';
  } else if (r >= 0.5)  insight = 'Strong link — sadhana days are noticeably more active days.';
  else if (r >= 0.2)  insight = 'Mild positive trend — sadhana days tend to come with more movement.';
  else if (r <= -0.2) insight = 'Inverse pattern — your sadhana days are calmer & more sedentary (often intentional).';
  else                insight = 'No strong correlation yet — keep building consistency.';

  const labels = dates.map((d, i) =>
    i === 0 || i === dates.length - 1 ? d.slice(5) : ''
  );

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Steps × Sadhana</Text>
        <Text style={styles.rChip}>r = {r.toFixed(2)}</Text>
      </View>
      <Text style={styles.subtitle}>
        Daily steps vs daily malas — normalised so they share one axis
      </Text>

      {steps.length > 0 ? (
        <LineChart
          data={{
            labels,
            datasets: [
              { data: stepsNorm.length ? stepsNorm : [0],  color: () => '#4ade80', strokeWidth: 2 },
              { data: malasNorm.length ? malasNorm : [0], color: () => '#d4a017', strokeWidth: 2 },
            ],
            legend: ['Steps', 'Malas'],
          }}
          width={CHART_W}
          height={140}
          bezier
          withDots={false}
          withInnerLines={false}
          chartConfig={{
            backgroundGradientFrom: COLORS.darkBg,
            backgroundGradientTo: COLORS.cardBg,
            color: () => COLORS.cream,
            labelColor: () => COLORS.muted,
            propsForBackgroundLines: { stroke: 'transparent' },
          }}
          style={{ borderRadius: 10, marginTop: 6, marginLeft: -16 }}
        />
      ) : (
        <View style={styles.empty}><Text style={styles.emptyText}>No data yet for this window.</Text></View>
      )}

      <View style={styles.totalsRow}>
        <View style={styles.totalsBox}>
          <Text style={styles.totalsLabel}>STEPS · {days}d</Text>
          <Text style={[styles.totalsValue, { color: '#4ade80' }]}>{totalSteps.toLocaleString()}</Text>
        </View>
        <View style={styles.totalsBox}>
          <Text style={styles.totalsLabel}>MALAS · {days}d</Text>
          <Text style={[styles.totalsValue, { color: COLORS.gold }]}>{totalMalas}</Text>
        </View>
      </View>

      <Text style={styles.insight}>{insight}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(214,224,64,0.12)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  rChip: { backgroundColor: 'rgba(212,160,23,0.15)', borderRadius: 6,
           paddingHorizontal: 8, paddingVertical: 2,
           color: COLORS.gold, fontSize: 11, fontWeight: '700' },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  empty: { padding: SPACING.lg, alignItems: 'center' },
  emptyText: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic' },
  totalsRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  totalsBox: { flex: 1, paddingVertical: 8, alignItems: 'center',
               backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8 },
  totalsLabel: { fontSize: 9, color: COLORS.muted, letterSpacing: 1, fontWeight: '700' },
  totalsValue: { fontSize: 16, fontWeight: '700', marginTop: 2 },
  insight: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic',
             marginTop: SPACING.sm, lineHeight: 17 },
});
