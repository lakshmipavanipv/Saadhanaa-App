import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { computeHealthDashboard, HealthDashboardSnapshot, MetricRow } from '../analytics/HealthDashboard';
import { computeCalmDivergence } from '../analytics/CalmDivergence';
import { buildSleepCorrelationMatrix, CorrelationMatrix } from '../analytics/SleepArchitecture';
import { sessionSpiritualRepo } from '../db/sessionSpiritualRepo';

const CHART_W = Dimensions.get('window').width - 64;
const todayStr = () => new Date().toISOString().slice(0, 10);

interface WeekTrendPoint { date: string; divergencePct: number }

const fmtMetric = (m: MetricRow): string => {
  if (m.unit === '°C') return m.today.toFixed(1);
  if (m.unit === '%')  return m.today.toFixed(1);
  return Math.round(m.today).toString();
};
const fmtBaseline = (m: MetricRow): string => {
  if (m.unit === '°C') return m.baseline.toFixed(1);
  if (m.unit === '%')  return m.baseline.toFixed(1);
  return Math.round(m.baseline).toString();
};

export const HealthDashboardCard: React.FC = () => {
  const [snap, setSnap] = useState<HealthDashboardSnapshot | null>(null);
  const [trend, setTrend] = useState<WeekTrendPoint[]>([]);
  const [mat, setMat] = useState<CorrelationMatrix | null>(null);
  const [todayDivergence, setTodayDivergence] = useState<number>(0);
  const [todayMessage, setTodayMessage] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [h, m, today] = await Promise.all([
          computeHealthDashboard(),
          buildSleepCorrelationMatrix(30),
          computeCalmDivergence(todayStr()),
        ]);
        if (cancelled) return;
        setSnap(h);
        setMat(m);
        setTodayDivergence(today.divergencePct);
        setTodayMessage(today.message);

        // 7-day Calm Divergence sparkline
        const pts: WeekTrendPoint[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
          const day = await computeCalmDivergence(d);
          pts.push({ date: d, divergencePct: day.divergencePct });
        }
        if (!cancelled) setTrend(pts);
      } catch (e) {
        // Soft-fail — keep showing previous state
      }
    };
    refresh();
    const id = setInterval(refresh, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!snap) return null;

  return (
    <View style={{ marginHorizontal: SPACING.md, marginVertical: SPACING.md, gap: SPACING.md }}>
      {/* ── Today vs your normal day ─── */}
      <View style={styles.card}>
        <Text style={styles.title}>Body Today vs Normal</Text>
        <Text style={styles.subtitle}>
          How your body is doing today compared to your usual
        </Text>

        {snap.metrics.map(m => (
          <View key={m.label} style={styles.metricRow}>
            <Text style={styles.metricEmoji}>{m.emoji}</Text>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <View style={styles.metricVals}>
              <Text style={styles.metricBase}>
                {fmtBaseline(m)}
              </Text>
              <Text style={styles.metricArrow}>→</Text>
              <Text style={styles.metricToday}>
                {fmtMetric(m)}<Text style={styles.metricUnit}> {m.unit}</Text>
              </Text>
            </View>
            <View style={styles.metricDelta}>
              <Text style={[styles.metricDeltaText, { color: m.good ? COLORS.leaf : m.direction === 'flat' ? COLORS.muted : COLORS.error }]}>
                {m.direction === 'up' ? '▲' : m.direction === 'down' ? '▼' : '·'} {Math.abs(m.deltaPct).toFixed(0)}%
              </Text>
            </View>
          </View>
        ))}

        {/* Meditation Depth Score removed — replaced by Saadhana Score
            on Home (uses the same scoring logic but scaled to 0-100). */}

        <Text style={styles.message}>{snap.message}</Text>
      </View>

      {/* Note: 7-day Calm Divergence trend + 30-day Sleep × Sadhana
          have moved to the Insights tab. Home keeps only "today" data. */}
    </View>
  );
};

const DepthBar: React.FC<{ score: number }> = ({ score }) => {
  const filled = Math.max(0, Math.min(10, Math.round(score)));
  return (
    <View style={styles.barRow}>
      {Array.from({ length: 10 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.barCell,
            { backgroundColor: i < filled ? '#d6e040' : 'rgba(214,224,64,0.15)' },
          ]}
        />
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.12)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  metricRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  metricEmoji: { fontSize: 18, marginRight: SPACING.sm, width: 24 },
  metricLabel: { flex: 1.2, fontSize: 13, color: COLORS.cream, fontWeight: '500' },
  metricVals: { flex: 1.5, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6 },
  metricBase: { fontSize: 12, color: COLORS.muted },
  metricArrow: { fontSize: 11, color: COLORS.muted },
  metricToday: { fontSize: 16, color: COLORS.cream, fontWeight: '600' },
  metricUnit: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  metricDelta: { width: 58, alignItems: 'flex-end' },
  metricDeltaText: { fontSize: 12, fontWeight: '700' },

  divider: { height: 1, backgroundColor: 'rgba(255,255,255,0.06)', marginVertical: SPACING.md },

  depthRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  depthLabel: { fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  depthValue: { fontSize: 22, color: '#d6e040', fontWeight: '700' },
  depthMax: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  barRow: { flexDirection: 'row', gap: 3, marginTop: 8 },
  barCell: { flex: 1, height: 10, borderRadius: 3 },
  depthHint: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginTop: 4 },

  message: {
    marginTop: SPACING.md,
    fontSize: 12,
    color: COLORS.cream,
    fontStyle: 'italic',
    lineHeight: 17,
  },

  todayChip: {
    backgroundColor: 'rgba(214, 224, 64, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: '#d6e040',
    fontSize: 11,
    fontWeight: '700',
  },
  rChip: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    color: COLORS.gold,
    fontSize: 11,
    fontWeight: '700',
  },
  weekMessage: { fontSize: 11, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },
  insight: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic', marginTop: 4, lineHeight: 17 },
});
