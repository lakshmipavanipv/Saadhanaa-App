/**
 * SessionScorePopup — full-screen modal that appears when the user stops
 * a Soulsync session. Shows the freshly-computed Saadhana Score for today
 * (which reflects the just-ended session) and offers a shortcut into the
 * Insights tab for trend history.
 *
 * Triggered from JapaScreen after `soulsync.stop()` completes and the
 * post-session JapaEffect snapshot is calculated.
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { JapaEffectSnapshot } from '../analytics/JapaEffect';

interface Props {
  visible: boolean;
  snapshot: JapaEffectSnapshot | null;
  onClose: () => void;
  onViewInsights?: () => void;
}

const colorFor = (score: number): string => {
  if (score >= 80) return '#3ddc84';
  if (score >= 60) return '#FFB800';
  if (score >= 40) return '#FFD54F';
  return '#ff8c42';
};

const tierFor = (score: number): { label: string; emoji: string } => {
  if (score >= 90) return { label: 'PROFOUND',    emoji: '✨' };
  if (score >= 75) return { label: 'STRONG',      emoji: '🌟' };
  if (score >= 60) return { label: 'GOOD',        emoji: '🙂' };
  if (score >= 40) return { label: 'MILD',        emoji: '🌱' };
  if (score >= 20) return { label: 'RESTLESS',    emoji: '🌿' };
  return                  { label: 'BRIEF',       emoji: '🪷' };
};

export const SessionScorePopup: React.FC<Props> = ({ visible, snapshot, onClose, onViewInsights }) => {
  if (!snapshot) return null;
  const c = colorFor(snapshot.score);
  const tier = tierFor(snapshot.score);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Tier badge */}
          <View style={[styles.tierBadge, { backgroundColor: c + '22', borderColor: c }]}>
            <Text style={[styles.tierBadgeText, { color: c }]}>
              {tier.emoji} {tier.label}
            </Text>
          </View>

          <Text style={styles.label}>Saadhana Score</Text>

          {/* Big score */}
          <View style={styles.scoreRow}>
            <Text style={[styles.scoreBig, { color: c }]}>{snapshot.score}</Text>
            <Text style={styles.scoreOutOf}>/ 100</Text>
          </View>

          {/* Note */}
          <Text style={styles.note}>{snapshot.note}</Text>

          {/* Session summary */}
          <View style={styles.summaryRow}>
            <SummaryStat label="Sessions" value={String(snapshot.sessionCount)} />
            <View style={styles.summaryDivider} />
            <SummaryStat label="Minutes"  value={String(snapshot.japaMinutes)} />
            <View style={styles.summaryDivider} />
            <SummaryStat label="Logged"   value="✓ Insights" />
          </View>

          {/* Top 3 metric highlights (HRV / BPM / Duration) */}
          <View style={styles.highlightBlock}>
            {snapshot.metrics
              .filter(m => m.weight > 0)
              .slice(0, 3)
              .map(m => (
                <View key={m.label} style={styles.highlightRow}>
                  <Text style={styles.highlightEmoji}>{m.emoji}</Text>
                  <Text style={styles.highlightLabel}>{m.label}</Text>
                  <Text style={[styles.highlightPts, { color: colorFor(m.points) }]}>
                    {m.points}/100
                  </Text>
                </View>
              ))}
          </View>

          {/* Buttons */}
          <View style={styles.btnRow}>
            {onViewInsights && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onViewInsights}>
                <Text style={styles.secondaryBtnText}>📈 View in Insights</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryBtnText}>🙏 Continue</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.foot}>
            This score has been added to your daily progress in Insights.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const SummaryStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={styles.summaryValue}>{value}</Text>
    <Text style={styles.summaryLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: COLORS.darkBg,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 184, 0, 0.4)',
    alignItems: 'center',
  },
  tierBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: SPACING.md,
  },
  tierBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  label: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  scoreBig: { fontSize: 72, fontWeight: '700', lineHeight: 76 },
  scoreOutOf: { fontSize: 18, color: COLORS.muted, marginLeft: 6 },

  note: {
    fontSize: 13,
    color: COLORS.cream,
    fontStyle: 'italic',
    textAlign: 'center',
    lineHeight: 19,
    marginTop: SPACING.sm,
    marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },

  summaryRow: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    paddingVertical: SPACING.sm,
    marginTop: SPACING.sm,
  },
  summaryDivider: { width: 1, backgroundColor: 'rgba(255,255,255,0.08)' },
  summaryValue: { fontSize: 16, color: COLORS.gold, fontWeight: '700' },
  summaryLabel: {
    fontSize: 9, color: COLORS.muted, fontWeight: '600',
    letterSpacing: 0.8, textTransform: 'uppercase', marginTop: 2,
  },

  highlightBlock: {
    width: '100%',
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.06)',
  },
  highlightRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 4 },
  highlightEmoji: { fontSize: 14, width: 22 },
  highlightLabel: { flex: 1, fontSize: 12, color: COLORS.cream },
  highlightPts: { fontSize: 13, fontWeight: '700' },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, width: '100%' },
  secondaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  primaryBtnText: { color: COLORS.deep, fontSize: 13, fontWeight: '700' },

  foot: {
    fontSize: 10, color: COLORS.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.sm,
  },
});
