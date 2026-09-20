/**
 * SessionVitalsReport — what the last sitting actually measured.
 *
 * WHY THIS EXISTS
 *
 * Every Soul Sync session has always written a full per-sample time series to
 * `session_telemetry` — heart rate, HRV, SpO2 and skin temperature, one row per
 * decoded ring frame. Nothing ever read it back. `LiveVitalsTrends` drew the
 * numbers while the session ran and wiped its buffers the moment it stopped, so
 * the charts vanished at exactly the point they became worth keeping, and the
 * stored data sat in the table unseen.
 *
 * This is the other half: after a sitting ends, its averages and its shape.
 *
 * WHAT THE SHAPE HONESTLY IS
 *
 * Heart rate arrives as continuous notify frames, so its trace is real. HRV and
 * SpO2 are not streamed by this hardware at all — the ring measures them only
 * when asked, in windows the service cycles through, so each lands roughly
 * every 20 seconds. Their traces are therefore step functions with few points,
 * and they are drawn WITHOUT bezier smoothing and WITH dots, so what is a
 * measurement and what is a gap stays visible. Smoothing them would draw a
 * confident curve through numbers nothing measured.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';

import { COLORS, SPACING } from '../../theme';
import { getDB } from '../db/database';
import { telemetryRepo, type TelemetryRow } from '../db/telemetryRepo';
import { useChartWidth } from './useChartWidth';
import { useSoulsync } from '../SoulsyncContext';
import type { SessionKind } from '../analytics/SadhanaDepth';

interface Props {
  /** Which practice's most recent finished sitting to report on. */
  practice: SessionKind;
  /** Bump to re-read after a session ends. */
  refreshKey?: number;
}

interface Loaded {
  sessionId: string;
  startTime: string;
  durationMin: number;
  avgBpm: number | null;
  avgHrv: number | null;
  avgSpo2: number | null;
  avgTempC: number | null;
  bpm: number[];
  hrv: number[];
  spo2: number[];
}

const CHART_H = 120;

const mean = (xs: number[]): number | null =>
  xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null;

/** Readings only. 0 and null are both "the ring did not measure this". */
const readings = (rows: TelemetryRow[], pick: (r: TelemetryRow) => number | null | undefined): number[] =>
  rows.map(pick).filter((v): v is number => v != null && v > 0);

export const SessionVitalsReport: React.FC<Props> = ({ practice, refreshKey = 0 }) => {
  const [data, setData] = useState<Loaded | null>(null);
  // Measured, not guessed — the card pads SPACING.md on both sides.
  const { width: chartW, onLayout } = useChartWidth(SPACING.md * 2);

  /*
   * Re-read whenever ANY sitting ends, not only when the screen says so.
   *
   * `refreshKey` is bumped by the session bar's `onSessionEnd`, which fires
   * only for a sitting the user stopped by hand. Sessions now also end on
   * their own — the auto-starter closes one after five idle minutes, with no
   * screen involved — and those ended up invisible here: the card went on
   * showing the previous sitting until the tab was remounted.
   *
   * Watching `active` catches both, because every ending flips it to false.
   */
  const { state } = useSoulsync();
  const active = state.active;
  const [endEpoch, setEndEpoch] = useState(0);
  const wasActive = useRef(active);
  useEffect(() => {
    if (wasActive.current && !active) setEndEpoch((n) => n + 1);
    wasActive.current = active;
  }, [active]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDB();
        const row = await db.getFirstAsync<{
          session_id: string; start_time: string; end_time: string | null;
          session_avg_bpm: number | null; avg_spo2: number | null;
          avg_skin_temp_c: number | null; session_rmssd: number | null;
        }>(
          `SELECT session_id, start_time, end_time, session_avg_bpm,
                  avg_spo2, avg_skin_temp_c, session_rmssd
             FROM session_spiritual
            WHERE practice = ? AND end_time IS NOT NULL
            ORDER BY start_time DESC LIMIT 1`,
          [practice]
        );
        if (!row || cancelled) { if (!cancelled) setData(null); return; }

        const tele = await telemetryRepo.forSession(row.session_id);
        if (cancelled) return;

        const bpm = readings(tele, (t) => t.bpm);
        const hrv = readings(tele, (t) => t.rmssd_ms);
        const spo2 = readings(tele, (t) => t.spo2);
        const temps = readings(tele, (t) => t.skin_temp_c);

        const startMs = new Date(row.start_time).getTime();
        const endMs = row.end_time ? new Date(row.end_time).getTime() : startMs;

        setData({
          sessionId: row.session_id,
          startTime: row.start_time,
          durationMin: Math.max(0, Math.round((endMs - startMs) / 60_000)),
          // Stored averages are authoritative — they were computed when the
          // sitting ended, against the telemetry as it was. Fall back to the
          // series only when a column was never written.
          avgBpm: row.session_avg_bpm ?? mean(bpm),
          avgHrv: row.session_rmssd ?? mean(hrv),
          avgSpo2: row.avg_spo2 ?? mean(spo2),
          avgTempC: row.avg_skin_temp_c ?? mean(temps),
          bpm, hrv, spo2,
        });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [practice, refreshKey, endEpoch]);

  if (!data) return null;
  // A sitting with no readings at all has nothing to report. Say so rather
  // than drawing an empty frame — "the ring sent nothing" is information.
  const nothingMeasured = !data.bpm.length && !data.hrv.length && !data.spo2.length;

  const when = new Date(data.startTime);
  const stamp = when.toLocaleString(undefined, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
  });

  return (
    <View style={styles.card} onLayout={onLayout}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Last sitting</Text>
        <Text style={styles.stamp}>{stamp} · {data.durationMin} min</Text>
      </View>

      {nothingMeasured ? (
        <Text style={styles.empty}>
          The ring sent no readings during this sitting. Keeping it snug on the
          finger usually fixes that.
        </Text>
      ) : (
        <>
          <View style={styles.statsRow}>
            <Stat label="AVG HEART" value={data.avgBpm} unit="bpm" color="#FF6B8A" />
            <Stat label="AVG HRV" value={data.avgHrv} unit="ms" color="#B39BFF" />
            <Stat label="AVG SpO₂" value={data.avgSpo2} unit="%" color="#7CB1FF" />
            <Stat label="AVG TEMP" value={data.avgTempC} unit="°C" color="#8BD3C7" />
          </View>

          {/* Drawn only once the card has been measured — charting at a
              fallback width and snapping to the real one is a visible
              flicker on every mount. */}
          {chartW > 0 && (
            <>
              <Trace title="Heart rate" series={data.bpm} color="#FF6B8A" width={chartW} smooth />
              <Trace title="HRV" series={data.hrv} color="#B39BFF" width={chartW} />
              <Trace title="Blood oxygen" series={data.spo2} color="#7CB1FF" width={chartW} />
            </>
          )}
        </>
      )}
    </View>
  );
};

const Stat: React.FC<{ label: string; value: number | null; unit: string; color: string }> = ({
  label, value, unit, color,
}) => (
  <View style={styles.stat}>
    <Text style={styles.statLabel}>{label}</Text>
    <Text style={[styles.statValue, { color }]}>
      {value == null ? '—' : value}
      <Text style={styles.statUnit}> {unit}</Text>
    </Text>
  </View>
);

/**
 * One vital's trace over the sitting.
 *
 * `smooth` is for heart rate alone, which is sampled densely enough that a
 * bezier reads as the signal rather than as invention. HRV and SpO2 get
 * straight segments and visible dots — with a reading every ~20 s there are
 * often fewer than ten points in a whole sitting, and a smooth curve through
 * them would imply a continuity the ring never reported.
 */
const Trace: React.FC<{
  title: string; series: number[]; color: string; width: number; smooth?: boolean;
}> = ({ title, series, color, width, smooth }) => {
  // chart-kit needs at least two points to draw anything.
  if (series.length < 2) {
    return (
      <View style={styles.traceBlock}>
        <Text style={styles.traceTitle}>{title}</Text>
        <Text style={styles.traceEmpty}>
          {series.length === 1
            ? `One reading (${series[0]}) — too few to chart.`
            : 'Not measured during this sitting.'}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.traceBlock}>
      <View style={styles.traceHead}>
        <Text style={styles.traceTitle}>{title}</Text>
        <Text style={styles.traceMeta}>
          {series.length} readings · {Math.min(...series)}–{Math.max(...series)}
        </Text>
      </View>
      <LineChart
        data={{ labels: series.map(() => ''), datasets: [{ data: series, color: () => color, strokeWidth: 2 }] }}
        width={width}
        height={CHART_H}
        bezier={!!smooth}
        withDots={!smooth}
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
          propsForDots: { r: '3' },
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        style={{ borderRadius: 10, marginVertical: 2, marginLeft: -16 }}
      />
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  stamp: { color: COLORS.muted, fontSize: 11 },
  empty: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  stat: { flex: 1 },
  statLabel: { color: COLORS.muted, fontSize: 9, letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: 20, fontWeight: '700' },
  statUnit: { fontSize: 10, color: COLORS.muted, fontWeight: '400' },
  traceBlock: { marginTop: SPACING.xs },
  traceHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  traceTitle: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  traceMeta: { color: COLORS.muted, fontSize: 10 },
  traceEmpty: { color: COLORS.muted, fontSize: 11, marginTop: 2, marginBottom: 4 },
});
