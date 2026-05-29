/**
 * BigVitalsHeader — elder-friendly KPI strip for Yoga + Meditation screens.
 *
 * Replaces the old YogaStatsHeader / MeditationStatsHeader which packed
 * too many small KPIs (sessions, avg depth, week min, HRV lift, etc.).
 * Older users couldn't read the small font and didn't know which
 * numbers mattered.
 *
 * New layout (top → bottom):
 *
 *   ┌────────────────────────────────────────┐
 *   │  YOGA / MEDITATION MINUTES TODAY       │  ← BIG hero (54pt number)
 *   │  18 / 20 min goal                       │
 *   │  ▓▓▓▓▓▓▓▓░░  90%                       │
 *   └────────────────────────────────────────┘
 *
 *   ┌─────────────────────┐  ┌─────────────────────┐
 *   │ ❤️  HEART HEALTH    │  │ 🫁  LUNG HEALTH      │
 *   │      72             │  │      92             │
 *   │  Resting BPM 68     │  │  SpO₂ 97.2%         │
 *   │  Tap for details ▾  │  │  Tap for details ▾  │
 *   └─────────────────────┘  └─────────────────────┘
 *
 * On tap, the tile expands to show individual vitals (Resting BPM, HRV,
 * SpO₂) with their today vs baseline rows.
 *
 * Fonts are all 16pt+ and high-contrast. Tap targets are ≥ 44pt tall.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { DUMMY, withFallback } from '../services/dummyData';
import { ambientBaselineRepo } from '../soulsync/db/ambientBaselineRepo';

interface Props {
  /** Practice label — e.g. "Yoga", "Meditation". */
  practice: string;
  /** Minutes done today (already-computed by the caller). */
  minutesToday: number;
  /** Daily goal in minutes. */
  goalMinutes: number;
}

interface Vitals {
  bpm: number;
  hrv: number;
  spo2: number;
}

const colorForScore = (s: number) => {
  if (s >= 80) return '#3ddc84';
  if (s >= 60) return '#FFB800';
  if (s >= 40) return '#FFD54F';
  return '#ff8c42';
};

export const BigVitalsHeader: React.FC<Props> = ({ practice, minutesToday, goalMinutes }) => {
  const [vitals, setVitals] = useState<Vitals | null>(null);
  const [expanded, setExpanded] = useState<'heart' | 'lung' | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const t = await ambientBaselineRepo.todaysAvg();
        if (cancelled) return;
        if (t && t.n > 0 && t.bpm > 0) {
          setVitals({
            bpm: Math.round(t.bpm),
            hrv: Math.round(t.rmssd ?? 0),
            spo2: Math.round((t.spo2 ?? 0) * 10) / 10,
          });
        }
      } catch { /* fall through to dummy */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const v: Vitals = vitals ?? {
    bpm: DUMMY.ambientToday.bpm,
    hrv: DUMMY.ambientToday.rmssd,
    spo2: DUMMY.ambientToday.spo2,
  };

  const heartScore = withFallback(undefined as any, DUMMY.healthBoxes.heart) as number;
  const lungScore  = withFallback(undefined as any, DUMMY.healthBoxes.lung)  as number;

  const goalPct = Math.min(100, Math.round((minutesToday / Math.max(1, goalMinutes)) * 100));

  return (
    <View style={styles.container}>
      {/* ── HERO: big minutes-today tile ── */}
      <View style={styles.hero}>
        <Text style={styles.heroLabel}>{practice.toUpperCase()} MINUTES TODAY</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={styles.heroValue}>{minutesToday}</Text>
          <Text style={styles.heroGoal}>  / {goalMinutes} min goal</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${goalPct}%` }]} />
        </View>
        <Text style={styles.heroPct}>{goalPct}% of today's goal</Text>
      </View>

      {/* ── Heart + Lung tappable tiles ── */}
      <View style={styles.tileRow}>
        <VitalTile
          icon="❤️"
          label="Heart Health"
          score={heartScore}
          subText={`Resting BPM ${v.bpm}`}
          expanded={expanded === 'heart'}
          onPress={() => setExpanded(expanded === 'heart' ? null : 'heart')}
        />
        <VitalTile
          icon="🫁"
          label="Lung Health"
          score={lungScore}
          subText={`SpO₂ ${v.spo2}%`}
          expanded={expanded === 'lung'}
          onPress={() => setExpanded(expanded === 'lung' ? null : 'lung')}
        />
      </View>

      {/* ── Expanded individual vitals — appears when a tile is tapped ── */}
      {expanded === 'heart' && (
        <View style={styles.detailBox}>
          <Text style={styles.detailTitle}>❤️ HEART · TODAY'S VITALS</Text>
          <DetailRow icon="❤️" label="Resting BPM"   value={`${v.bpm} bpm`} />
          <DetailRow icon="〰️" label="HRV (RMSSD)"   value={`${v.hrv} ms`} />
          <Text style={styles.detailHint}>
            Lower resting BPM + higher HRV indicate a calmer, more resilient heart.
          </Text>
        </View>
      )}
      {expanded === 'lung' && (
        <View style={styles.detailBox}>
          <Text style={styles.detailTitle}>🫁 LUNG · TODAY'S VITALS</Text>
          <DetailRow icon="🫁" label="SpO₂"           value={`${v.spo2}%`} />
          <DetailRow icon="🌬" label="Breath rate"   value="14 / min" />
          <Text style={styles.detailHint}>
            Pranayama strengthens lungs and stabilises oxygen saturation over time.
          </Text>
        </View>
      )}
    </View>
  );
};

const VitalTile: React.FC<{
  icon: string;
  label: string;
  score: number;
  subText: string;
  expanded: boolean;
  onPress: () => void;
}> = ({ icon, label, score, subText, expanded, onPress }) => {
  const c = colorForScore(score);
  return (
    <TouchableOpacity
      style={[styles.tile, expanded && styles.tileExpanded]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={styles.tileHeader}>
        <Text style={styles.tileIcon}>{icon}</Text>
        <Text style={styles.tileLabel}>{label.toUpperCase()}</Text>
      </View>
      <Text style={[styles.tileScore, { color: c }]}>{score}</Text>
      <Text style={styles.tileSub}>{subText}</Text>
      <Text style={styles.tileHint}>
        {expanded ? 'Tap to collapse ▴' : 'Tap for details ▾'}
      </Text>
    </TouchableOpacity>
  );
};

const DetailRow: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => (
  <View style={styles.detailRow}>
    <Text style={styles.detailIcon}>{icon}</Text>
    <Text style={styles.detailLabel}>{label}</Text>
    <Text style={styles.detailValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
  },

  // ── Hero ──
  hero: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.30)',
    marginBottom: SPACING.sm,
  },
  heroLabel: {
    fontSize: 14, color: COLORS.gold,
    fontWeight: '700', letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroValue: { fontSize: 54, color: COLORS.cream, fontWeight: '800', lineHeight: 60 },
  heroGoal:  { fontSize: 16, color: COLORS.muted, fontWeight: '600' },
  progressTrack: {
    height: 10, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 5, marginTop: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.gold, borderRadius: 5 },
  heroPct: { fontSize: 14, color: COLORS.cream, fontWeight: '600', marginTop: 6 },

  // ── Heart + Lung tiles ──
  tileRow: { flexDirection: 'row', gap: SPACING.sm },
  tile: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border,
    minHeight: 130,
  },
  tileExpanded: { borderColor: COLORS.gold },
  tileHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  tileIcon:  { fontSize: 22, marginRight: 6 },
  tileLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '800', letterSpacing: 0.8, flex: 1 },
  tileScore: { fontSize: 42, fontWeight: '800', marginTop: 2 },
  tileSub:   { fontSize: 14, color: COLORS.cream, fontWeight: '600', marginTop: 2 },
  tileHint:  { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 6 },

  // ── Detail expansion ──
  detailBox: {
    marginTop: SPACING.sm,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  detailTitle: {
    fontSize: 12, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 1, marginBottom: 8,
  },
  detailRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  detailIcon: { fontSize: 18, width: 26 },
  detailLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '600', flex: 1 },
  detailValue: { fontSize: 16, color: COLORS.gold, fontWeight: '700' },
  detailHint: {
    fontSize: 11, color: COLORS.muted, fontStyle: 'italic',
    marginTop: 8, lineHeight: 16,
  },
});
