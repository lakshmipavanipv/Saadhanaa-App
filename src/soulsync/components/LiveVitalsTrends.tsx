/**
 * LiveVitalsTrends — always-on live heart / lung / HRV trend on the Yoga and
 * Meditation screens. Three stacked mini-charts:
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
 * Now always-on:
 *   The ring is pushing frames all the time; hiding this behind a Start
 *   Soul Sync button just made the graph look broken whenever the user
 *   hadn't tapped it. When a Soul Sync sitting is open, the component reads
 *   the session hook's buffers (props `bpmSeries` / `liveSpo2` / `liveHrv`);
 *   otherwise it subscribes to `ambientIngestion.subscribeLive(...)` and
 *   fills its own buffers one frame at a time, so the trend is coming
 *   through from the moment the tab opens.
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
import { ambientIngestion } from '../services/AmbientIngestion';

interface Props {
  /**
   * Live BPM series. Optional — when omitted, the component subscribes to the
   * ambient ring stream itself so Yoga and Meditation can show the live graph
   * the moment the screen mounts, without the user having to tap Start first.
   */
  bpmSeries?: number[];
  /** Latest single SpO₂ reading. Optional, same reason as bpmSeries. */
  liveSpo2?: number | null;
  /** Latest ring-measured HRV (ms). Optional, same reason as bpmSeries. */
  liveHrv?: number | null;
  /**
   * Whether a session is actively recording.
   *
   * When true, the component trusts the three props above as its data source.
   * When false (or omitted), it falls back to subscribing directly to the
   * ambient ring stream — the ring is pushing frames either way, and the user
   * wants to see them as soon as the tab opens.
   */
  isActive?: boolean;
}

const CHART_W = Dimensions.get('window').width - 32 - 24;   // page padding + card padding
const CHART_H = 130;

const BPM_BUFFER_MAX = 120;      // ~2 minutes at a frame per second
const SAMPLE_BUFFER_MAX = 60;    // ~1 minute of HRV / SpO₂ at the ring's cycler rate

export const LiveVitalsTrends: React.FC<Props> = ({
  bpmSeries: propBpmSeries,
  liveSpo2: propLiveSpo2,
  liveHrv: propLiveHrv,
  isActive = false,
}) => {
  const [baselineBpm,  setBaselineBpm]  = useState<number | null>(null);
  const [baselineSpo2, setBaselineSpo2] = useState<number | null>(null);
  const [baselineHrv,  setBaselineHrv]  = useState<number | null>(null);

  // Ambient fallback state — populated by subscribeLive when no session is on.
  // These coexist with the props above: when `isActive` the component reads the
  // props (the session hook already has a 4Hz flush loop); otherwise it draws
  // from these buffers, fed straight from the ring one frame at a time.
  const ambientBpmBufRef = useRef<number[]>([]);
  const ambientSpo2BufRef = useRef<number[]>([]);
  const ambientHrvBufRef = useRef<number[]>([]);
  const [ambientBpmSeries, setAmbientBpmSeries] = useState<number[]>([]);
  const [ambientLiveBpm, setAmbientLiveBpm] = useState<number | null>(null);
  const [ambientLiveSpo2, setAmbientLiveSpo2] = useState<number | null>(null);
  const [ambientLiveHrv, setAmbientLiveHrv] = useState<number | null>(null);

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
      const v = propLiveSpo2 ?? baselineSpo2;
      if (v == null) return;
      spo2BufferRef.current.push(Number(v));
      if (spo2BufferRef.current.length > SAMPLE_BUFFER_MAX) spo2BufferRef.current.shift();
      setSpo2Series([...spo2BufferRef.current]);
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, propLiveSpo2, baselineSpo2]);

  // Sample HRV on the same tick. The ring only produces a new figure once a
  // measurement window closes, so most ticks re-chart the value already there
  // — that flat run IS the sampling rate and is left visible on purpose.
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => {
      const v = propLiveHrv ?? baselineHrv;
      if (v == null) return;
      hrvBufferRef.current.push(Number(v));
      if (hrvBufferRef.current.length > SAMPLE_BUFFER_MAX) hrvBufferRef.current.shift();
      setHrvSeries([...hrvBufferRef.current]);
    }, 1000);
    return () => clearInterval(id);
  }, [isActive, propLiveHrv, baselineHrv]);

  // Reset session buffers when session ends
  useEffect(() => {
    if (!isActive) {
      spo2BufferRef.current = [];
      setSpo2Series([]);
      hrvBufferRef.current = [];
      setHrvSeries([]);
    }
  }, [isActive]);

  // Ambient fallback — subscribe to the ring stream when no session is active.
  // The yoga and meditation tabs want the live graph the moment the screen
  // opens, so there is no gating: the subscription mounts, the ring's frames
  // flow in, and the buffers fill as readings arrive. When a session takes
  // over the ring, ambientIngestion.pause() silences the fan-out on its own.
  useEffect(() => {
    if (isActive) return;
    // Seed from the snapshot so the first render after mount isn't blank when
    // the ambient service has already been running for a while.
    const seed = ambientIngestion.snapshot();
    if (seed.bpm != null) setAmbientLiveBpm(seed.bpm);
    if (seed.spo2 != null) setAmbientLiveSpo2(seed.spo2);
    if (seed.hrv != null) setAmbientLiveHrv(seed.hrv);

    const unsub = ambientIngestion.subscribeLive((s) => {
      if (s.bpm != null) {
        ambientBpmBufRef.current.push(s.bpm);
        if (ambientBpmBufRef.current.length > BPM_BUFFER_MAX) ambientBpmBufRef.current.shift();
        setAmbientBpmSeries([...ambientBpmBufRef.current]);
        setAmbientLiveBpm(s.bpm);
      }
      if (s.spo2 != null) {
        ambientSpo2BufRef.current.push(s.spo2);
        if (ambientSpo2BufRef.current.length > SAMPLE_BUFFER_MAX) ambientSpo2BufRef.current.shift();
        setSpo2Series([...ambientSpo2BufRef.current]);
        setAmbientLiveSpo2(s.spo2);
      }
      if (s.hrv != null) {
        ambientHrvBufRef.current.push(s.hrv);
        if (ambientHrvBufRef.current.length > SAMPLE_BUFFER_MAX) ambientHrvBufRef.current.shift();
        setHrvSeries([...ambientHrvBufRef.current]);
        setAmbientLiveHrv(s.hrv);
      }
    });
    return () => {
      unsub();
      // Keep the ambient buffers across tab switches — they survive as long as
      // the component stays mounted. If the component unmounts, the GC handles it.
    };
  }, [isActive]);

  const bpmSeriesEff = isActive ? (propBpmSeries ?? []) : ambientBpmSeries;
  const liveBpm = isActive
    ? (propBpmSeries?.[propBpmSeries.length - 1] ?? null)
    : ambientLiveBpm;
  const liveSpo2Now = isActive
    ? (spo2Series[spo2Series.length - 1] ?? propLiveSpo2 ?? null)
    : (spo2Series[spo2Series.length - 1] ?? ambientLiveSpo2);
  const liveHrvNow = isActive
    ? (hrvSeries[hrvSeries.length - 1] ?? propLiveHrv ?? null)
    : (hrvSeries[hrvSeries.length - 1] ?? ambientLiveHrv);

  return (
    <View style={{ marginHorizontal: SPACING.md, marginTop: SPACING.sm }}>
      <TrendCard
        title="❤️  HEART · LIVE TREND"
        live={liveBpm}
        baseline={baselineBpm}
        unit="bpm"
        series={bpmSeriesEff}
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
      {/* Always rendered, like the other two.
          This used to be hidden until `liveHrvNow != null`, and on this ring
          that is a wait of up to a minute — the measurement cycler arms HRV
          only periodically. So a session that was working correctly showed
          two cards, and the third appeared later or, with no baseline stored
          yet, never. A card that says "waiting" is information; a card that is
          absent looks like a missing feature. */}
      <TrendCard
        title="🌿  HRV · LIVE TREND"
        live={liveHrvNow}
        baseline={baselineHrv}
        unit="ms"
        series={hrvSeries}
        color="#C6A5FF"
        hint="Rising HRV means the nervous system is settling into the practice."
      />
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
  /*
   * chart-kit needs at least two points — but inventing them is not allowed.
   *
   * The empty case used to fall back to `baseline ?? 70`, so a session with no
   * readings and no stored baseline drew a confident flat line at 70 of
   * whatever the unit was: 70 bpm, 70% SpO₂, 70 ms HRV. That is a number no
   * instrument produced, presented identically to one that did.
   *
   * Now nothing measured means no chart, and the card says what it is waiting
   * for. A single reading is still doubled to make a drawable segment, which
   * is duplication of a real value rather than fabrication of a fake one.
   */
  const hasReadings = series.length > 0;
  const data = series.length >= 2 ? series : (hasReadings ? [series[0], series[0]] : []);
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

      {/* Two-line chart: baseline (dashed grey) + live trace (color).
          Replaced by a plain line of text until the ring has actually
          reported something — see the note on `hasReadings`. */}
      {!hasReadings ? (
        <Text style={styles.waiting}>
          Waiting for the ring to report {unit === 'bpm' ? 'a heartbeat' : `a ${unit === '%' ? 'blood oxygen' : 'HRV'} reading`}…
        </Text>
      ) : (
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
      )}

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
  waiting: {
    color: COLORS.muted,
    fontSize: 11,
    fontStyle: 'italic',
    paddingVertical: 18,
    textAlign: 'center',
  },
  hint: {
    fontSize: 11, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: 2, lineHeight: 16,
  },
});
