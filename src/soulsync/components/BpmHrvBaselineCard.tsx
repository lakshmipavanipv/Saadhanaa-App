/**
 * BpmHrvBaselineCard — compact strip used on the Japa screen showing
 * live BPM and HRV (RMSSD) compared to the user's day baseline.
 *
 *   ❤️ BPM   65  →  72  ▼ 9%  ("calming")
 *   〰️ HRV  31  →  47  ▲ 52% ("vagal activation")
 *
 * Visible during AND after an active Soulsync session — if no live
 * reading, falls back to averages of today's session telemetry.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { ambientBaselineRepo } from '../db/ambientBaselineRepo';
import { getDB } from '../db/database';

interface Props {
  /** Latest BPM streamed from the ring. */
  liveBpm: number | null;
  /** Latest RMSSD computed inside this session (ms). */
  liveRmssd: number | null;
  /** Whether a Soulsync session is currently recording. */
  isActive: boolean;
}

export const BpmHrvBaselineCard: React.FC<Props> = ({ liveBpm, liveRmssd, isActive }) => {
  const [baselineBpm,   setBaselineBpm]   = useState<number | null>(null);
  const [baselineRmssd, setBaselineRmssd] = useState<number | null>(null);
  const [todayJapaBpm,  setTodayJapaBpm]  = useState<number | null>(null);
  const [todayJapaRmssd, setTodayJapaRmssd] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const ambient = await ambientBaselineRepo.todaysAvg();
        if (!cancelled) {
          setBaselineBpm(ambient.bpm   > 0 ? Math.round(ambient.bpm)   : null);
          setBaselineRmssd(ambient.rmssd > 0 ? Math.round(ambient.rmssd) : null);
        }
        const db = await getDB();
        const today = new Date().toISOString().slice(0, 10);
        const row = await db.getFirstAsync<{ avg_bpm: number | null; avg_rmssd: number | null }>(
          `SELECT AVG(t.bpm) AS avg_bpm, AVG(t.rmssd_ms) AS avg_rmssd
           FROM session_telemetry t
           JOIN session_spiritual s ON s.session_id = t.session_id
           WHERE date(s.start_time) = ?`,
          [today]
        );
        if (!cancelled) {
          setTodayJapaBpm  (row?.avg_bpm   != null ? Math.round(row.avg_bpm)   : null);
          setTodayJapaRmssd(row?.avg_rmssd != null ? Math.round(row.avg_rmssd) : null);
        }
      } catch { /* soft fail */ }
    };
    refresh();
    const id = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Prefer live reading during an active session; else today's session avg
  const japaBpm   = isActive && liveBpm   != null ? liveBpm   : todayJapaBpm;
  const japaRmssd = isActive && liveRmssd != null ? liveRmssd : todayJapaRmssd;

  // Nothing meaningful to show yet
  if (japaBpm == null && japaRmssd == null && baselineBpm == null && baselineRmssd == null) {
    return null;
  }

  const bpmDelta = (baselineBpm != null && japaBpm != null) ? japaBpm - baselineBpm : null;
  const hrvDelta = (baselineRmssd != null && japaRmssd != null) ? japaRmssd - baselineRmssd : null;

  // For BPM, a DROP is good. For HRV, a RISE is good.
  const bpmGood = bpmDelta != null && bpmDelta < 0;
  const hrvGood = hrvDelta != null && hrvDelta > 0;

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Body vs Baseline</Text>
        <Text style={styles.sub}>
          {isActive ? '◉ Live' : 'Today\'s japa avg'}
        </Text>
      </View>

      <Row
        icon="❤️"
        label="BPM"
        baseline={baselineBpm}
        japa={japaBpm}
        unit=""
        good={bpmGood}
        deltaText={bpmDelta != null
          ? (bpmDelta < 0 ? `▼ ${Math.abs(bpmDelta)} bpm calming` : `▲ ${bpmDelta} bpm`)
          : '—'}
      />
      <Row
        icon="〰️"
        label="HRV (RMSSD)"
        baseline={baselineRmssd}
        japa={japaRmssd}
        unit="ms"
        good={hrvGood}
        deltaText={hrvDelta != null
          ? (hrvDelta > 0 ? `▲ +${hrvDelta} ms (vagal lift)` : `▼ ${Math.abs(hrvDelta)} ms`)
          : '—'}
      />
    </View>
  );
};

const Row: React.FC<{
  icon: string;
  label: string;
  baseline: number | null;
  japa: number | null;
  unit: string;
  good: boolean;
  deltaText: string;
}> = ({ icon, label, baseline, japa, unit, good, deltaText }) => {
  const deltaColor = good ? '#3ddc84' : '#FFD54F';
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{icon}</Text>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowVals}>
        <Text style={styles.rowBase}>{baseline ?? '—'}</Text>
        <Text style={styles.rowArrow}>→</Text>
        <Text style={styles.rowJapa}>
          {japa ?? '—'}{unit && <Text style={styles.rowUnit}> {unit}</Text>}
        </Text>
      </View>
      <Text style={[styles.rowDelta, { color: deltaColor }]}>{deltaText}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.18)',
  },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  title: { fontSize: 12, color: COLORS.gold, fontWeight: '700', letterSpacing: 0.8 },
  sub:   { fontSize: 10, color: COLORS.muted, fontStyle: 'italic' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  rowIcon:  { fontSize: 16, width: 24 },
  rowLabel: { flex: 1.1, fontSize: 12, color: COLORS.cream, fontWeight: '500' },
  rowVals:  { flex: 1.1, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 4 },
  rowBase:  { fontSize: 12, color: COLORS.muted },
  rowArrow: { fontSize: 11, color: COLORS.muted },
  rowJapa:  { fontSize: 15, color: COLORS.cream, fontWeight: '600' },
  rowUnit:  { fontSize: 10, color: COLORS.muted, fontWeight: '500' },
  rowDelta: { flex: 1.4, fontSize: 11, fontWeight: '700', textAlign: 'right' },
});
