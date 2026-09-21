/**
 * SessionInsightsPopup — what the sitting did to the body, shown when it ends.
 *
 * WHY THIS AND NOT THE SCORE POPUP
 *
 * `SessionScorePopup` answers "how deep was that?" and only appears when there
 * is a depth score to show — which excludes every exercise and walk sitting by
 * design, since those are deliberately unscoreable. So the practices most
 * likely to be recorded automatically were also the ones that ended in
 * silence, with their vitals written to the database and never shown.
 *
 * This answers a different and simpler question, one every sitting can answer:
 * what were your vitals during it, and how does that compare with your resting
 * baseline?
 *
 * THE COMPARISON IS THE POINT
 *
 * An average heart rate of 68 means nothing on its own. Against a baseline of
 * 74 it means the practice settled the body, and that is the whole reason the
 * numbers are worth showing. Anything without both halves reads "—" rather
 * than implying a comparison that was never made.
 *
 * The row layout, the ▲ ▼ · glyphs and the good/bad colouring are taken
 * verbatim from SaadhanaScoreCard's MetricRow, which is the pattern the Home
 * tab's vitals table already uses — the arrow states the DIRECTION of change
 * and the colour states whether that direction was good, because the two are
 * not the same thing for every vital: a heart rate going down is good, HRV
 * going down is not.
 */

import React, { useEffect, useState } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';

import { COLORS, SPACING, BORDER_RADIUS } from '../../theme';
import { useTheme } from '../../ThemeContext';
import { getDB } from '../db/database';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import type { SessionDepth, SessionKind } from '../analytics/SadhanaDepth';

interface Props {
  visible: boolean;
  sessionId: string | null;
  practice: SessionKind | null;
  /** Present only for scoreable practices; the vitals show either way. */
  depth: SessionDepth | null;
  onClose: () => void;
  onViewInsights?: () => void;
}

interface VitalRow {
  emoji: string;
  label: string;
  unit: string;
  baseline: number | null;
  session: number | null;
  /** Whether a fall is the good direction for this vital. */
  lowerIsBetter?: boolean;
}

interface Loaded {
  durationMin: number;
  rows: VitalRow[];
}

const fmtVal = (v: number | null, unit: string): string => {
  if (v == null) return '—';
  if (unit === '°C' || unit === '%') return v.toFixed(1);
  return Math.round(v).toString();
};

export const SessionInsightsPopup: React.FC<Props> = ({
  visible, sessionId, practice, depth, onClose, onViewInsights,
}) => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const [data, setData] = useState<Loaded | null>(null);

  useEffect(() => {
    if (!visible || !sessionId) { setData(null); return; }
    let cancelled = false;
    (async () => {
      try {
        const db = await getDB();
        const row = await db.getFirstAsync<{
          start_time: string; end_time: string | null;
          session_avg_bpm: number | null; session_rmssd: number | null;
          avg_spo2: number | null; avg_skin_temp_c: number | null;
          baseline_bpm: number | null; baseline_rmssd: number | null;
          baseline_spo2: number | null; baseline_temp_c: number | null;
        }>(
          `SELECT start_time, end_time, session_avg_bpm, session_rmssd,
                  avg_spo2, avg_skin_temp_c,
                  baseline_bpm, baseline_rmssd, baseline_spo2, baseline_temp_c
             FROM session_spiritual WHERE session_id = ?`,
          [sessionId]
        );
        if (!row || cancelled) { if (!cancelled) setData(null); return; }

        /*
         * Baselines: the row's own, falling back to today's rolling average.
         *
         * `finaliseSessionDepth` stamps the baseline that was in force when the
         * sitting was scored, and that is the right number to judge it by. An
         * unscoreable sitting never gets those columns written, so for a walk
         * or a workout the fallback is the only source — and it is still the
         * correct comparison, just computed now rather than stored then.
         */
        let baseBpm = row.baseline_bpm ?? null;
        let baseHrv = row.baseline_rmssd ?? null;
        let baseSpo2 = row.baseline_spo2 ?? null;
        let baseTemp = row.baseline_temp_c ?? null;
        if (baseBpm == null && baseHrv == null && baseSpo2 == null) {
          try {
            const t = await ambientBaselineRepo.todaysAvg();
            if (t) {
              baseBpm = t.bpm > 0 ? Math.round(t.bpm) : null;
              baseHrv = t.rmssd > 0 ? Math.round(t.rmssd) : null;
              baseSpo2 = t.spo2 > 0 ? Math.round(t.spo2 * 10) / 10 : null;
            }
          } catch { /* no baseline yet — every row reads "—" */ }
        }
        if (cancelled) return;

        const startMs = new Date(row.start_time).getTime();
        const endMs = row.end_time ? new Date(row.end_time).getTime() : startMs;

        setData({
          durationMin: Math.max(0, Math.round((endMs - startMs) / 60_000)),
          rows: [
            { emoji: '〰️', label: 'HRV', unit: 'ms', baseline: baseHrv, session: row.session_rmssd ?? null },
            { emoji: '❤️', label: 'Heart rate', unit: 'bpm', baseline: baseBpm, session: row.session_avg_bpm ?? null, lowerIsBetter: true },
            { emoji: '🫁', label: 'Blood oxygen', unit: '%', baseline: baseSpo2, session: row.avg_spo2 ?? null },
            { emoji: '🌡️', label: 'Skin temp', unit: '°C', baseline: baseTemp, session: row.avg_skin_temp_c ?? null },
          ],
        });
      } catch {
        if (!cancelled) setData(null);
      }
    })();
    return () => { cancelled = true; };
  }, [visible, sessionId]);

  const measured = data?.rows.filter((r) => r.session != null) ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Your {practice ?? 'practice'} · insights</Text>
              <Text style={styles.subtitle}>
                {data ? `${data.durationMin} min · baseline vs this session` : 'Reading your session…'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Depth, when the practice has one. Exercise deliberately does
                not, and says so rather than showing a blank score. */}
            {depth != null && (
              <View style={styles.scoreRow}>
                <Text style={styles.scoreLabel}>Soul Sadhana Depth</Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.scoreBig}>
                    {depth.score == null ? '—' : Math.round(depth.score)}
                  </Text>
                  <Text style={styles.scoreOutOf}> / 100</Text>
                </View>
              </View>
            )}
            {depth?.note ? <Text style={styles.note}>{depth.note}</Text> : null}

            <Text style={styles.sectionHead}>BASELINE  →  THIS SESSION</Text>

            {measured.length === 0 ? (
              <Text style={styles.empty}>
                The ring sent no readings during this sitting, so there is nothing to
                compare. Keeping it snug on the finger usually fixes that.
              </Text>
            ) : (
              measured.map((m) => <VitalMetricRow key={m.label} m={m} styles={styles} />)
            )}

            <Text style={styles.footnote}>
              Baseline is your own resting average, not a population norm.
            </Text>

            {onViewInsights && (
              <TouchableOpacity style={styles.cta} onPress={() => { onClose(); onViewInsights(); }}>
                <Text style={styles.ctaTxt}>See all sessions in Insights →</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

/**
 * One vital, baseline → session, with a variance arrow.
 *
 * Arrow = direction of change. Colour = whether that direction was good for
 * THIS vital. Keeping them separate is deliberate and matches the Home tab:
 * collapsing both into one signal makes a falling heart rate and a falling
 * HRV look identical when they mean opposite things.
 */
const VitalMetricRow: React.FC<{
  m: VitalRow;
  styles: ReturnType<typeof makeStyles>;
}> = ({ m, styles }) => {
  const both = m.baseline != null && m.session != null;
  const deltaPct = both && m.baseline !== 0
    ? ((m.session! - m.baseline!) / Math.abs(m.baseline!)) * 100
    : null;
  const good = !both ? null : (m.lowerIsBetter ? m.session! < m.baseline! : m.session! > m.baseline!);

  const arrow = deltaPct == null ? '·'
    : deltaPct > 0.5 ? '▲'
    : deltaPct < -0.5 ? '▼' : '·';
  const pctText = deltaPct == null ? '—' : `${Math.abs(deltaPct).toFixed(0)}%`;
  const deltaColor = good == null ? COLORS.muted : good ? COLORS.leaf : COLORS.error;

  return (
    <View style={styles.metricRow}>
      <Text style={styles.metricEmoji}>{m.emoji}</Text>
      <Text style={styles.metricLabel}>{m.label}</Text>
      <View style={styles.metricVals}>
        <Text style={styles.metricBase}>{fmtVal(m.baseline, m.unit)}</Text>
        <Text style={styles.metricArrow}>→</Text>
        <Text style={styles.metricToday}>
          {fmtVal(m.session, m.unit)}
          {m.unit ? <Text style={styles.metricUnit}> {m.unit}</Text> : null}
        </Text>
      </View>
      <View style={styles.metricDelta}>
        <Text style={[styles.metricDeltaText, { color: deltaColor }]}>{arrow} {pctText}</Text>
      </View>
    </View>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: C.deep,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    maxHeight: '80%',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.lg,
  },
  handle: {
    width: 40, height: 4, backgroundColor: C.muted, borderRadius: 2,
    alignSelf: 'center', marginBottom: SPACING.sm,
  },
  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  title: { fontSize: 15, color: '#FFB800', fontWeight: '700', letterSpacing: 0.5, textTransform: 'capitalize' },
  subtitle: { fontSize: 11, color: C.muted, marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, alignItems: 'center', justifyContent: 'center',
    borderRadius: 16, backgroundColor: C.cardBg,
  },
  closeTxt: { color: C.cream, fontSize: 14, fontWeight: '700' },

  scoreRow: {
    flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between',
    marginTop: SPACING.sm,
  },
  scoreLabel: { fontSize: 13, color: C.cream, fontWeight: '600' },
  scoreBig: { fontSize: 36, fontWeight: '700', color: '#FFB800' },
  scoreOutOf: { fontSize: 13, color: C.muted, marginLeft: 4 },
  note: {
    fontSize: 12, color: C.cream, fontStyle: 'italic', lineHeight: 17,
    marginTop: 6, marginBottom: SPACING.sm,
  },

  sectionHead: {
    fontSize: 9, color: C.muted, letterSpacing: 0.8,
    marginTop: SPACING.md, marginBottom: 2,
  },
  empty: { fontSize: 12, color: C.muted, lineHeight: 18, marginTop: SPACING.sm },

  metricRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  metricEmoji: { fontSize: 18, marginRight: SPACING.sm, width: 24 },
  metricLabel: { flex: 1.2, fontSize: 13, color: C.cream, fontWeight: '500' },
  metricVals: {
    flex: 1.5, flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'flex-end', gap: 6,
  },
  metricBase: { fontSize: 12, color: C.muted },
  metricArrow: { fontSize: 11, color: C.muted },
  metricToday: { fontSize: 16, color: C.cream, fontWeight: '600' },
  metricUnit: { fontSize: 10, color: C.muted, fontWeight: '500' },
  metricDelta: { width: 58, alignItems: 'flex-end' },
  metricDeltaText: { fontSize: 12, fontWeight: '700' },

  footnote: {
    fontSize: 9, color: C.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.md,
  },
  cta: {
    marginTop: SPACING.md, paddingVertical: SPACING.sm,
    borderRadius: 12, backgroundColor: 'rgba(255, 184, 0, 0.12)', alignItems: 'center',
  },
  ctaTxt: { color: C.gold, fontSize: 13, fontWeight: '600' },
});
