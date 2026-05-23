import React, { useEffect, useState } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { computeCalmDivergence, DivergenceSnapshot } from '../analytics/CalmDivergence';
import { buildSleepCorrelationMatrix, CorrelationMatrix } from '../analytics/SleepArchitecture';

const todayStr = () => new Date().toISOString().slice(0, 10);
const CHART_W = Dimensions.get('window').width - 64;

export const CalmDivergenceCard: React.FC = () => {
  const [div, setDiv] = useState<DivergenceSnapshot | null>(null);
  const [mat, setMat] = useState<CorrelationMatrix | null>(null);

  useEffect(() => {
    const refresh = () => {
      computeCalmDivergence(todayStr()).then(setDiv).catch(() => {});
      buildSleepCorrelationMatrix(30).then(setMat).catch(() => {});
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => clearInterval(id);
  }, []);

  if (!div) return null;

  const hours = Array.from({ length: 24 }, (_, h) => h);
  const lineA = hours.map(h => div.baselineSeries.find(x => x.hour === h)?.bpm ?? null);
  const lineB = hours.map(h => div.spiritualSeries.find(x => x.hour === h)?.bpm ?? null);

  // Replace nulls with last-known for chart-kit (which can't render holes)
  const fillForward = (arr: (number | null)[]): number[] => {
    let last = 70;
    return arr.map(v => {
      if (v != null) { last = v; return v; }
      return last;
    });
  };

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Calm Divergence</Text>
      <Text style={styles.subtitle}>
        Ambient baseline (gold) vs. Japa heart-rate (citron)
      </Text>

      {div.hasData ? (
        <LineChart
          data={{
            labels: hours.map(h => (h % 6 === 0 ? `${h}h` : '')),
            datasets: [
              { data: fillForward(lineA), color: () => COLORS.gold, strokeWidth: 2 },
              { data: fillForward(lineB), color: () => '#d6e040',   strokeWidth: 2 },
            ],
          }}
          width={CHART_W}
          height={170}
          bezier
          withDots={false}
          withInnerLines={false}
          chartConfig={{
            backgroundGradientFrom: COLORS.darkBg,
            backgroundGradientTo: COLORS.cardBg,
            color: () => COLORS.cream,
            labelColor: () => COLORS.muted,
            propsForBackgroundLines: { stroke: 'rgba(255,255,255,0.04)' },
          }}
          style={{ borderRadius: 10, marginVertical: SPACING.sm }}
        />
      ) : (
        <View style={styles.emptyChart}>
          <Text style={styles.emptyText}>
            Open Japa, start Soulsync, chant for a minute — your divergence will appear here.
          </Text>
        </View>
      )}

      <Text style={[styles.insight, !div.hasData && { color: COLORS.muted }]}>
        {div.message}
      </Text>

      {mat && (
        <View style={styles.sleepBlock}>
          <Text style={styles.sleepTitle}>30-day Sleep × Sadhana</Text>
          <View style={styles.sleepRow}>
            <Text style={styles.sleepLabel}>Correlation</Text>
            <Text style={styles.sleepValue}>r = {mat.pearsonR.toFixed(2)}</Text>
          </View>
          <Text style={styles.sleepInsight}>{mat.insightMessage}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.12)',
  },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  emptyChart: {
    height: 170,
    backgroundColor: COLORS.darkBg,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.04)',
    borderStyle: 'dashed',
  },
  emptyText: {
    fontSize: 12,
    color: COLORS.muted,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  insight: {
    fontSize: 13,
    color: COLORS.cream,
    fontStyle: 'italic',
    lineHeight: 18,
    marginTop: 4,
  },
  sleepBlock: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  sleepTitle: { fontSize: 13, color: COLORS.gold, fontWeight: '700', letterSpacing: 0.5 },
  sleepRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  sleepLabel: { fontSize: 11, color: COLORS.muted },
  sleepValue: { fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  sleepInsight: { fontSize: 12, color: COLORS.cream, marginTop: 4, lineHeight: 16, fontStyle: 'italic' },
});
