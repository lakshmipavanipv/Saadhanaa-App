import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Dimensions, ScrollView } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { METRICS, MetricInfo, MetricKey, buildMetricTrend } from '../analytics/MetricTrends';

/**
 * Fallback only. The chart is sized from the card's measured width via
 * onLayout; this covers the first frame before that measurement lands.
 *
 * The old approach used this value for real, which assumed exactly 64px of
 * horizontal chrome everywhere the card is mounted and never changed after
 * module load — so on a screen with different padding, or after a rotation or
 * split-screen resize, the chart drew wider than the card it sits in. That is
 * the trend line spilling past the border on the History tab.
 */
const CHART_W_FALLBACK = Dimensions.get('window').width - 64;

const RANGES: Array<{ key: '7d' | '30d' | '90d'; label: string; days: number }> = [
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

export const MultiMetricTrendCard: React.FC = () => {
  const [chartW, setChartW] = React.useState(CHART_W_FALLBACK);
  const [metricKey, setMetricKey] = useState<MetricKey>('rmssd');
  const [rangeIdx, setRangeIdx]   = useState(0);
  const [points, setPoints] = useState<Array<{ date: string; value: number | null }>>([]);

  const metric: MetricInfo = useMemo(
    () => METRICS.find(m => m.key === metricKey) || METRICS[0],
    [metricKey]
  );
  const range = RANGES[rangeIdx];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const pts = await buildMetricTrend(metricKey, range.days);
      if (!cancelled) setPoints(pts);
    })();
    return () => { cancelled = true; };
  }, [metricKey, range.days]);

  // Replace nulls with last-known so chart-kit can render
  const data = useMemo(() => {
    if (points.length === 0) return [0, 0];
    let last = 0;
    return points.map(p => {
      if (p.value != null) { last = p.value; return p.value; }
      return last;
    });
  }, [points]);

  const labels = points.map((p, i) =>
    i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2)
      ? p.date.slice(5) : ''
  );

  const latest = points.length > 0 ? points[points.length - 1].value : null;
  const earliest = points.length > 0 ? points.find(p => p.value != null)?.value ?? null : null;
  const delta = latest != null && earliest != null
    ? ((latest - earliest) / Math.max(earliest, 0.001)) * 100
    : null;

  return (
    <View
      style={styles.card}
      onLayout={(e) => {
        // Card width minus its own horizontal padding — the space the chart
        // may actually occupy.
        const inner = e.nativeEvent.layout.width - SPACING.md * 2;
        if (inner > 0 && Math.abs(inner - chartW) > 1) setChartW(inner);
      }}
    >
      <View style={styles.titleRow}>
        <Text style={styles.title}>Trends</Text>
        <View style={styles.rangeRow}>
          {RANGES.map((r, i) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeBtn, i === rangeIdx && styles.rangeBtnActive]}
              onPress={() => setRangeIdx(i)}
            >
              <Text style={[styles.rangeText, i === rangeIdx && styles.rangeTextActive]}>
                {r.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* Metric selector chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipRow}>
        {METRICS.map(m => {
          const active = m.key === metricKey;
          return (
            <TouchableOpacity
              key={m.key}
              style={[styles.chip, active && { borderColor: m.color, backgroundColor: m.color + '22' }]}
              onPress={() => setMetricKey(m.key)}
            >
              <Text style={styles.chipEmoji}>{m.emoji}</Text>
              <Text style={[styles.chipLabel, active && { color: m.color }]}>{m.label}</Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.valueRow}>
        <Text style={styles.valueLabel}>{metric.label}</Text>
        <Text style={[styles.valueNow, { color: metric.color }]}>
          {latest != null ? fmt(latest, metric.key) : '—'}{' '}
          <Text style={styles.valueUnit}>{metric.unit}</Text>
        </Text>
        {delta != null && (
          <Text style={[styles.delta, { color: delta > 0 ? COLORS.leaf : COLORS.error }]}>
            {delta > 0 ? '▲' : '▼'} {Math.abs(delta).toFixed(0)}%
          </Text>
        )}
      </View>

      {points.length === 0 ? (
        <View style={styles.empty}><Text style={styles.emptyText}>No data yet for this window.</Text></View>
      ) : (
        <LineChart
          data={{ labels, datasets: [{ data, color: () => metric.color, strokeWidth: 2 }] }}
          width={chartW}
          height={150}
          bezier
          withDots={false}
          withInnerLines={false}
          chartConfig={{
            backgroundGradientFrom: COLORS.darkBg,
            backgroundGradientTo: COLORS.cardBg,
            color: () => metric.color,
            labelColor: () => COLORS.muted,
            propsForBackgroundLines: { stroke: 'transparent' },
          }}
          style={{ borderRadius: 10, marginTop: 6, marginLeft: -16 }}
        />
      )}
    </View>
  );
};

const fmt = (v: number, key: MetricKey): string => {
  if (key === 'spo2' || key === 'skinTempC') return v.toFixed(1);
  return Math.round(v).toString();
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(214,224,64,0.12)',
    // Belt and braces: even with a measured width, a chart library rounding
    // up must not paint past the card's rounded border.
    overflow: 'hidden',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
              borderWidth: 1, borderColor: COLORS.border },
  rangeBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  rangeText: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  rangeTextActive: { color: COLORS.deep },
  chipRow: { flexDirection: 'row', marginTop: SPACING.sm, marginBottom: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 10, paddingVertical: 6, marginRight: 6,
          borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
          backgroundColor: 'rgba(255,255,255,0.04)' },
  chipEmoji: { fontSize: 13 },
  chipLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
              marginTop: SPACING.sm },
  valueLabel: { fontSize: 12, color: COLORS.muted, fontWeight: '600' },
  valueNow: { fontSize: 22, fontWeight: '700' },
  valueUnit: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  delta: { fontSize: 12, fontWeight: '700' },
  empty: { padding: SPACING.lg, alignItems: 'center' },
  emptyText: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic' },
});
