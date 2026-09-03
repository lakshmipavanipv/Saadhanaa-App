import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { buildEmotionalSummary, EmotionalSummarySnapshot, TriggerStats } from '../analytics/EmotionalSummary';
import { EmotionTrigger } from '../emotional/types';

const RANGES: { key: '7d' | '30d' | '90d'; label: string; days: number }[] = [
  { key: '7d',  label: '7d',  days: 7 },
  { key: '30d', label: '30d', days: 30 },
  { key: '90d', label: '90d', days: 90 },
];

const TRIGGER_META: Record<EmotionTrigger, { emoji: string; label: string; color: string }> = {
  anxiety:    { emoji: '🌀', label: 'Anxiety',    color: '#7EA1D8' },
  lethargy:   { emoji: '🌱', label: 'Lethargy',   color: '#4ade80' },
  aggression: { emoji: '⚡', label: 'Aggression', color: '#ff8c42' },
};

export const EmotionalSummaryCard: React.FC = () => {
  const [snap, setSnap] = useState<EmotionalSummarySnapshot | null>(null);
  const [rangeIdx, setRangeIdx] = useState(1);  // default 30d
  const range = RANGES[rangeIdx];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = await buildEmotionalSummary(range.days);
      if (!cancelled) setSnap(s);
    })();
    return () => { cancelled = true; };
  }, [range.days]);

  if (!snap) return null;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Emotional events</Text>
        <View style={styles.rangeRow}>
          {RANGES.map((r, i) => (
            <TouchableOpacity
              key={r.key}
              style={[styles.rangeBtn, i === rangeIdx && styles.rangeBtnActive]}
              onPress={() => setRangeIdx(i)}
            >
              <Text style={[styles.rangeText, i === rangeIdx && styles.rangeTextActive]}>{r.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {snap.totalEvents === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>
            🪷 No imbalances flagged in the last {range.label} — your nervous system has been settled.
          </Text>
        </View>
      ) : (
        <>
          <View style={styles.headlineRow}>
            <View style={styles.headlineBox}>
              <Text style={styles.headlineNum}>{snap.totalEvents}</Text>
              <Text style={styles.headlineLabel}>events</Text>
            </View>
            <View style={styles.headlineBox}>
              <Text style={[styles.headlineNum, { color: COLORS.leaf }]}>
                {Math.round(snap.overallSuccessRate * 100)}%
              </Text>
              <Text style={styles.headlineLabel}>resolved by sadhana</Text>
            </View>
          </View>

          {snap.byTrigger.map(t => (
            <TriggerRow key={t.trigger} stats={t} />
          ))}
        </>
      )}
    </View>
  );
};

const TriggerRow: React.FC<{ stats: TriggerStats }> = ({ stats }) => {
  const meta = TRIGGER_META[stats.trigger];
  return (
    <View style={styles.row}>
      <Text style={styles.rowIcon}>{meta.emoji}</Text>
      <View style={styles.rowMid}>
        <Text style={[styles.rowLabel, { color: meta.color }]}>{meta.label}</Text>
        <Text style={styles.rowSub}>
          {stats.total} flagged · {stats.resolved} resolved
          {stats.avgImprovementPct != null && stats.avgImprovementPct > 0 &&
            <Text style={styles.rowGood}> · +{Math.round(stats.avgImprovementPct)}% avg HRV gain</Text>}
        </Text>
      </View>
      <View style={styles.rowEnd}>
        <Text style={[styles.rowPct, { color: meta.color }]}>
          {stats.total > 0 ? Math.round(stats.successRate * 100) : 0}%
        </Text>
        <View style={[styles.rowBar, { backgroundColor: meta.color + '22' }]}>
          <View style={[styles.rowFill, {
            width: `${stats.total > 0 ? stats.successRate * 100 : 0}%`,
            backgroundColor: meta.color,
          }]} />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(214,224,64,0.12)',
  },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, color: '#d6e040', fontWeight: '700', letterSpacing: 0.5 },
  rangeRow: { flexDirection: 'row', gap: 4 },
  rangeBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6,
              borderWidth: 1, borderColor: COLORS.border },
  rangeBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  rangeText: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  rangeTextActive: { color: COLORS.deep },

  empty: { paddingVertical: SPACING.md, paddingHorizontal: SPACING.md, alignItems: 'center' },
  emptyText: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic', textAlign: 'center', lineHeight: 18 },

  headlineRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm, marginBottom: SPACING.md },
  headlineBox: { flex: 1, alignItems: 'center', paddingVertical: 12,
                 backgroundColor: 'rgba(214,224,64,0.06)', borderRadius: 10 },
  headlineNum: { fontSize: 26, color: '#d6e040', fontWeight: '700' },
  headlineLabel: { fontSize: 10, color: COLORS.muted, letterSpacing: 0.8, marginTop: 2, textTransform: 'uppercase', fontWeight: '600' },

  row: { flexDirection: 'row', alignItems: 'center', marginTop: SPACING.sm,
         paddingVertical: 6 },
  rowIcon: { fontSize: 18, width: 28 },
  rowMid: { flex: 1, marginLeft: 4 },
  rowLabel: { fontSize: 13, fontWeight: '700' },
  rowSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  rowGood: { color: COLORS.leaf, fontWeight: '700' },
  rowEnd: { width: 70, alignItems: 'flex-end' },
  rowPct: { fontSize: 14, fontWeight: '700' },
  rowBar: { width: 60, height: 4, borderRadius: 2, marginTop: 4, overflow: 'hidden' },
  rowFill: { height: '100%' },
});
