import React, { useEffect, useState } from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Rect, G } from 'react-native-svg';
import { COLORS, SPACING } from '../../theme';
import { buildBpmJourney, BpmJourneySnapshot, latestSessionId } from '../analytics/BpmJourney';

const CHART_W = Dimensions.get('window').width - 32;
const CHART_H = 200;
// react-native-chart-kit reserves ~64px on the left for Y-axis labels and
// ~16px on the right. The phase-band overlay must match the chart's actual
// plot area, otherwise bands appear shifted left of the line.
const PAD_LEFT = 64;
const PAD_RIGHT = 16;
const PAD_BOTTOM = 32;   // x-axis label area at the bottom

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

  // X-axis: normalized 0..1 across the point range
  const t0 = snap.points[0].t;
  const t1 = snap.points[snap.points.length - 1].t;
  const span = Math.max(1, t1 - t0);

  // Find phase boundaries in pixel-x space
  const phaseStart = (phase: 'pre' | 'during' | 'post'): number | null => {
    const p = snap.points.find(p => p.phase === phase);
    if (!p) return null;
    return (p.t - t0) / span;
  };
  const phaseEnd = (phase: 'pre' | 'during' | 'post'): number | null => {
    const idx = [...snap.points].reverse().findIndex(p => p.phase === phase);
    if (idx === -1) return null;
    const p = snap.points[snap.points.length - 1 - idx];
    return (p.t - t0) / span;
  };
  const innerW = CHART_W - PAD_LEFT - PAD_RIGHT;
  const xToPx = (n01: number): number => PAD_LEFT + n01 * innerW;

  const bands = (['pre', 'during', 'post'] as const).map(phase => {
    const s = phaseStart(phase);
    const e = phaseEnd(phase);
    if (s == null || e == null) return null;
    return { phase, x1: xToPx(s), x2: xToPx(e) };
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
        decorator={() => (
          <G>
            {bands.map(b => {
              const fill =
                b.phase === 'pre'    ? 'rgba(160, 160, 160, 0.10)' :
                b.phase === 'during' ? 'rgba(214, 224, 64, 0.10)' :
                                       'rgba(255, 140, 66, 0.08)';
              return (
                <Rect
                  key={b.phase}
                  x={b.x1}
                  y={0}
                  width={Math.max(2, b.x2 - b.x1)}
                  height={CHART_H - PAD_BOTTOM}
                  fill={fill}
                />
              );
            })}
          </G>
        )}
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
