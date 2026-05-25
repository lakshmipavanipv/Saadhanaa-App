import React, { useEffect, useState } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Rect, G } from 'react-native-svg';
import { COLORS, SPACING } from '../../theme';
import { buildBpmJourney, BpmJourneySnapshot, latestSessionId } from '../analytics/BpmJourney';

const CHART_W = Dimensions.get('window').width - 32;
const CHART_H = 200;

interface Props {
  sessionId?: string | null;        // pin to a specific session; defaults to latest
  refreshIntervalMs?: number;       // default 5000
}

export const BpmJourneyChart: React.FC<Props> = ({ sessionId: pinnedId, refreshIntervalMs = 5000 }) => {
  const [snap, setSnap] = useState<BpmJourneySnapshot | null>(null);
  const [resolvedId, setResolvedId] = useState<string | null | undefined>(pinnedId);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      let id = pinnedId ?? null;
      if (id === undefined || id === null) id = await latestSessionId();
      if (cancelled) return;
      setResolvedId(id);
      const s = await buildBpmJourney(id);
      if (!cancelled) setSnap(s);
    };
    refresh();
    const t = setInterval(refresh, refreshIntervalMs);
    return () => { cancelled = true; clearInterval(t); };
  }, [pinnedId, refreshIntervalMs]);

  if (!snap || snap.points.length === 0) {
    return (
      <View style={[styles.card, styles.empty]}>
        <Text style={styles.title}>BPM Journey</Text>
        <Text style={styles.subtle}>
          {snap?.message || 'Loading…'}
        </Text>
      </View>
    );
  }

  // X-axis: normalized 0..1 across the point range. The decorator receives
  // the chart's actual plot dimensions (paddingTop, paddingRight, width,
  // height) so we compute pixel-x at draw time instead of guessing it.
  const t0 = snap.points[0].t;
  const t1 = snap.points[snap.points.length - 1].t;
  const span = Math.max(1, t1 - t0);

  const phaseStart01 = (phase: 'pre' | 'during' | 'post'): number | null => {
    const p = snap.points.find(p => p.phase === phase);
    return p ? (p.t - t0) / span : null;
  };
  const phaseEnd01 = (phase: 'pre' | 'during' | 'post'): number | null => {
    const idx = [...snap.points].reverse().findIndex(p => p.phase === phase);
    if (idx === -1) return null;
    const p = snap.points[snap.points.length - 1 - idx];
    return (p.t - t0) / span;
  };

  const phases01 = (['pre', 'during', 'post'] as const).map(phase => {
    const s = phaseStart01(phase);
    const e = phaseEnd01(phase);
    if (s == null || e == null) return null;
    return { phase, s, e };
  }).filter((b): b is NonNullable<typeof b> => b !== null);

  const data = snap.points.map(p => p.bpm);

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>BPM Journey</Text>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <Legend color="rgba(160, 160, 160, 0.4)" label="Pre" />
          <Legend color="rgba(214, 224, 64, 0.4)" label="During" />
          <Legend color="rgba(255, 140, 66, 0.35)" label="Post" />
        </View>
      </View>

      <LineChart
        data={{ labels: data.map(() => ''), datasets: [{ data }] }}
        width={CHART_W}
        height={CHART_H}
        bezier
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={true}
        chartConfig={{
          backgroundGradientFrom: COLORS.darkBg,
          backgroundGradientTo: COLORS.cardBg,
          color: (o = 1) => `rgba(214,224,64,${o})`,
          labelColor: () => COLORS.muted,
          strokeWidth: 2.2,
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        style={{ borderRadius: 12, marginVertical: 4 }}
        decorator={(props: any) => {
          // react-native-chart-kit passes the actual plot geometry here.
          // paddingRight is the left-side padding for y-axis labels (it's
          // confusingly named — applies to BOTH sides). paddingTop is the
          // top inset. Compute the true plot area from these.
          const pTop   = props?.paddingTop   ?? 16;
          const pRight = props?.paddingRight ?? 64;   // ← actually paddingLeft for labels
          const plotW  = CHART_W - pRight * 2;        // line spans [pRight, width - pRight]
          const plotH  = CHART_H - pTop - 30;         // 30 = x-axis label band
          const xToPx = (n01: number) => pRight + n01 * plotW;
          return (
            <G>
              {phases01.map(b => {
                const fill =
                  b.phase === 'pre'    ? 'rgba(160, 160, 160, 0.10)' :
                  b.phase === 'during' ? 'rgba(214, 224, 64, 0.10)' :
                                         'rgba(255, 140, 66, 0.08)';
                const x1 = xToPx(b.s);
                const x2 = xToPx(b.e);
                return (
                  <Rect
                    key={b.phase}
                    x={x1}
                    y={pTop}
                    width={Math.max(2, x2 - x1)}
                    height={plotH}
                    fill={fill}
                  />
                );
              })}
            </G>
          );
        }}
      />

      {/* Phase summary row */}
      <View style={styles.statsRow}>
        <PhaseStat label="Pre"    bpm={snap.preAvgBpm}    color="rgba(245, 230, 211, 0.85)" />
        <PhaseStat label="During" bpm={snap.duringAvgBpm} color="#d6e040" />
        <PhaseStat label="Post"   bpm={snap.postAvgBpm}   color={COLORS.saffron} />
      </View>

      <Text style={styles.message}>{snap.message}</Text>
    </View>
  );
};

const Legend: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
    <View style={{ width: 8, height: 8, backgroundColor: color, borderRadius: 2 }} />
    <Text style={styles.legendText}>{label}</Text>
  </View>
);

const PhaseStat: React.FC<{ label: string; bpm: number | null; color: string }> = ({ label, bpm, color }) => (
  <View style={{ alignItems: 'center', flex: 1 }}>
    <Text style={styles.phaseLabel}>{label}</Text>
    <Text style={[styles.phaseBpm, { color }]}>
      {bpm != null ? Math.round(bpm) : '—'}<Text style={styles.bpmUnit}> bpm</Text>
    </Text>
  </View>
);

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginTop: 12,
    padding: SPACING.md,
    backgroundColor: 'rgba(15, 18, 41, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.15)',
  },
  empty: { paddingVertical: SPACING.lg },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 14, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  subtle: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: SPACING.sm },
  legendText: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
  },
  phaseLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '600', letterSpacing: 1.2 },
  phaseBpm: { fontSize: 18, fontWeight: '700', marginTop: 2 },
  bpmUnit: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  message: {
    fontSize: 12,
    color: COLORS.cream,
    textAlign: 'center',
    fontStyle: 'italic',
    marginTop: SPACING.sm,
    paddingHorizontal: SPACING.sm,
    lineHeight: 17,
  },
});
