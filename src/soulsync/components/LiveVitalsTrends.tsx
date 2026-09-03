/**
 * LiveVitalsTrends — shown DURING an active Soulsync session on the Yoga
 * and Meditation screens. Two stacked mini-charts:
 *
 *   ❤️ HEART · LIVE         current 66 bpm
 *      ──────  baseline 71 bpm  (dashed)
 *      ╱╲    ╱╲
 *     ╱  ╲__╱  ╲___    ← live BPM trace
 *
 *   🫁 LUNG (SpO₂) · LIVE   current 98.0%
 *      ──────  baseline 97.2%  (dashed)
 *      ▁▂▃▃▃▃▄▄▄▄▄  ← live SpO₂ trace
 *
 *   🌿 HRV · LIVE            current 42 ms
 *      ──────  baseline 38 ms (dashed)
 *      ▁▂▃▄▅▅▆▆▇▇▇  ← live HRV trace
 *
 * Why this exists:
 *   The old HRVWaveGraph only showed BPM and didn't surface the user's
 *   today-baseline as a reference line, so the user couldn't tell at a
 *   glance whether their practice was moving the needle. This component
 *   draws the baseline as a clear horizontal reference plus the live
 *   trace as a coloured bezier line — same UX for heart and lung so
 *   older users learn one mental model.
 *
 * SpO₂ / HRV note: the soulsync hook exposes each as a single current
 * number, so this component maintains its own rolling buffer locally,
 * sampled on a timer while the session is active.
 *
 * HRV here is the figure the RING measured, not an RMSSD computed from R-R
 * intervals — this hardware does not stream those. It refreshes on the ring
 * service's live measurement cycle rather than per heartbeat, so its trace
 * steps rather than flows. That is the real sampling rate, not a rendering
 * artefact, and flattering it with interpolation would be a lie about how
 * often the sensor actually ran.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { COLORS, SPACING } from '../../theme';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';

interface Props {
  /** Live BPM series from useSoulsyncSession.state.bpmSeries. */
  bpmSeries: number[];
  /** Latest single SpO₂ reading from useSoulsyncSession.state.liveSpo2. */
  liveSpo2: number | null;
  /**
   * Latest ring-measured HRV (ms) from useSoulsyncSession.state.liveHrv.
   * Optional so the screens that have not been given it yet still compile
   * and simply omit the third card.
   */
  liveHrv?: number | null;
  /** Whether the session is actively recording. */
  isActive: boolean;
}

const CHART_W = Dimensions.get('window').width - 32 - 24;   // page padding + card padding
const CHART_H = 130;

export const LiveVitalsTrends: React.FC<Props> = ({ bpmSeries, liveSpo2, liveHrv, isActive }) => {
  const [baselineBpm,  setBaselineBpm]  = useState<number | null>(null);
  const [baselineSpo2, setBaselineSpo2] = useState<number | null>(null);
  const [baselineHrv,  setBaselineHrv]  = useState<number | null>(null);

  // Local rolling buffers for SpO₂ and HRV — sampled while session is active
  const spo2BufferRef = useRef<number[]>([]);
  const [spo2Series, setSpo2Series] = useState<number[]>([]);
  const hrvBufferRef = useRef<number[]>([]);
  const [hrvSeries, setHrvSeries] = useState<number[]>([]);

  // Fetch today's baseline from ambient_baseline
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await ambientBaselineRepo.todaysAvg();
        if (cancelled) return;
        // Null until the ring has actually reported a baseline today.
        setBaselineBpm(t && t.bpm > 0 ? Math.round(t.bpm) : null);
        setBaselineSpo2(t && t.spo2 > 0 ? Math.round(t.spo2 * 10) / 10 : null);
        setBaselineHrv(t && t.rmssd > 0 ? Math.round(t.rmssd) : null);
      } catch {
        setBaselineBpm(null);
        setBaselineSpo2(null);
        setBaselineHrv(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Sample SpO₂ once per second while session is active
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      // Only chart a real reading — never hold the line flat with a stand-in.
      const v = liveSpo2 ?? baselineSpo2;
      if (v == null) return;
      spo2BufferRef.current.push(Number(v));
      if (spo2BufferRef.current.length > 60) spo2BufferRef.current.shift();
      setSpo2Series([...spo2BufferRef.current]);
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, liveSpo2, baselineSpo2]);

  // Sample HRV on the same tick. The ring only produces a new figure once a
  // measurement window closes, so most ticks re-chart the value already there
  // — that flat run IS the sampling rate and is left visible on purpose.
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      const v = liveHrv ?? baselineHrv;
      if (v == null) return;
      hrvBufferRef.current.push(Number(v));
      if (hrvBufferRef.current.length > 60) hrvBufferRef.current.shift();
      setHrvSeries([...hrvBufferRef.current]);
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, liveHrv, baselineHrv]);

  // Reset buffers when session ends
  useEffect(() => {
    if (!isActive) {
      spo2BufferRef.current = [];
      setSpo2Series([]);
      hrvBufferRef.current = [];
      setHrvSeries([]);
    }
  }, [isActive]);

  if (!isActive) return null;

  const liveBpm  = bpmSeries[bpmSeries.length - 1] ?? null;
  const liveSpo2Now = spo2Series[spo2Series.length - 1] ?? liveSpo2;
  const liveHrvNow  = hrvSeries[hrvSeries.length - 1] ?? liveHrv ?? null;

  return (
    <View style={{ marginHorizontal: SPACING.md, marginTop: SPACING.sm }}>
      <TrendCard
        title="❤️  HEART · LIVE TREND"
        live={liveBpm}
        baseline={baselineBpm}
        unit="bpm"
        series={bpmSeries}
        color="#ff6b8a"
        hint="Going DOWN as you settle is healthy — practice is calming the heart."
      />
      <TrendCard
        title="🫁  LUNG (SpO₂) · LIVE TREND"
        live={liveSpo2Now}
        baseline={baselineSpo2}
        unit="%"
        series={spo2Series}
        color="#7FE8C8"
        hint="Pranayama steady-state should sit at or above your baseline."
      />
      {liveHrvNow != null && (
        <TrendCard
          title="🌿  HRV · LIVE TREND"
          live={liveHrvNow}
          baseline={baselineHrv}
          unit="ms"
          series={hrvSeries}
          color="#C6A5FF"
          hint="Rising HRV means the nervous system is settling into the practice."
        />
      )}
    </View>
  );
};

const TrendCard: React.FC<{
  title: string;
  live: number | null;
  baseline: number | null;
  unit: string;
  series: number[];
  color: string;
  hint: string;
}> = ({ title, live, baseline, unit, series, color, hint }) => {
  // chart-kit needs at least 2 points
  const data = series.length >= 2
    ? series
    : (series.length === 1 ? [series[0], series[0]] : [baseline ?? 70, baseline ?? 70]);
  const baselineLine = data.map(() => baseline ?? data[0]);

  // Format live + delta vs baseline
  const fmt = (v: number | null) => v == null
    ? '—'
    : (unit === '%' ? v.toFixed(1) : Math.round(v).toString());
  const delta = (live != null && baseline != null) ? live - baseline : null;
  const deltaStr = delta == null ? '—'
    : (delta > 0 ? `+${fmt(delta)}` : fmt(delta));

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.liveBadge}>◉ LIVE</Text>
      </View>

      <View style={styles.statsRow}>
        <View>
          <Text style={styles.statLabel}>NOW</Text>
          <Text style={[styles.statValue, { color }]}>
            {fmt(live)}<Text style={styles.statUnit}> {unit}</Text>
          </Text>
        </View>
        <View>
          <Text style={styles.statLabel}>BASELINE TODAY</Text>
          <Text style={styles.statBaseline}>
            {fmt(baseline)}<Text style={styles.statUnit}> {unit}</Text>
          </Text>
        </View>
        <View>
          <Text style={styles.statLabel}>Δ vs BASELINE</Text>
          <Text style={[styles.statValue, { color, fontSize: 22 }]}>{deltaStr}</Text>
        </View>
      </View>

      {/* Two-line chart: baseline (dashed grey) + live trace (color) */}
      <LineChart
        data={{
          labels: data.map(() => ''),
          datasets: [
            // Live trace (drawn last → on top)
            { data, color: () => color, strokeWidth: 3 },
            // Baseline as flat dashed line
            {
              data: baselineLine,
              color: () => 'rgba(255,255,255,0.45)',
              strokeWidth: 1.5,
              withDots: false,
            } as any,
          ],
        }}
        width={CHART_W}
        height={CHART_H}
        bezier
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={false}
        chartConfig={{
          backgroundGradientFrom: COLORS.cardBg,
          backgroundGradientTo: COLORS.cardBg,
          color: () => color,
          labelColor: () => COLORS.muted,
          strokeWidth: 2,
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        style={{ borderRadius: 10, marginVertical: 4, marginLeft: -16 }}
      />

      <Text style={styles.hint}>{hint}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.20)',
    marginBottom: SPACING.sm,
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 13, color: COLORS.gold, fontWeight: '800', letterSpacing: 0.6 },
  liveBadge: {
    fontSize: 10, color: '#ff6b8a', fontWeight: '800',
    letterSpacing: 1,
  },
  statsRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end',
    marginBottom: SPACING.sm,
  },
  statLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 0.6 },
  statValue: { fontSize: 26, fontWeight: '800', marginTop: 2 },
  statBaseline: { fontSize: 20, color: COLORS.cream, fontWeight: '700', marginTop: 2 },
  statUnit: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  hint: {
    fontSize: 11, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: 2, lineHeight: 16,
  },
});
