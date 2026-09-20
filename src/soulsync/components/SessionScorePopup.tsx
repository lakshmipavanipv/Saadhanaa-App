/**
 * SessionScorePopup — the report card shown the moment a Soul Sync sitting
 * ends.
 *
 * WHAT CHANGED
 *
 * It used to show `computeJapaEffect()`: everything that had happened TODAY,
 * pooled. So finishing a second sitting showed a number partly made of the
 * first one, and a strong evening practice could appear to have lowered the
 * score. It also always showed a number — a session with no HRV reading scored
 * zero on HRV, which is indistinguishable from a body that did not respond.
 *
 * It now shows the sitting that just ended, scored on its own, against the
 * body the practitioner brought to it. When it cannot be scored it says so and
 * says why.
 *
 * WHY THE COMPONENTS ARE ON THE POPUP
 *
 * A single number at the end of a practice is either believed or dismissed,
 * and neither is useful. Showing the measured parts beside it — each with the
 * figure behind it — lets the practitioner see WHICH part moved, which is the
 * only thing they can act on next time.
 */

import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { depthBand, type SessionDepth } from '../analytics/SadhanaDepth';

interface Props {
  visible: boolean;
  depth: SessionDepth | null;
  onClose: () => void;
  onViewInsights?: () => void;
}

export const SessionScorePopup: React.FC<Props> = ({ visible, depth, onClose, onViewInsights }) => {
  if (!depth) return null;

  const scored = depth.score != null;
  const band = scored ? depthBand(depth.score as number) : null;
  const accent = band?.color ?? COLORS.muted;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.card, { borderColor: accent + '66' }]}>
          {/* The breakdown makes this taller than the old single number, and a
              report whose bottom half is off-screen on a small phone is a
              report that does not exist. */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollBody}
            bounces={false}
          >
            {band && (
              <View style={[styles.tierBadge, { backgroundColor: accent + '22', borderColor: accent }]}>
                <Text style={[styles.tierBadgeText, { color: accent }]}>
                  {band.emoji} {band.label.toUpperCase()}
                </Text>
              </View>
            )}

            <Text style={styles.label}>Sadhana Depth</Text>

            {scored ? (
              <View style={styles.scoreRow}>
                <Text style={[styles.scoreBig, { color: accent }]}>{depth.score}</Text>
                <Text style={styles.scoreOutOf}>/ 100</Text>
              </View>
            ) : (
              <Text style={styles.noScore}>Not scored</Text>
            )}

            <Text style={styles.note}>{scored ? depth.note : depth.whyBlank}</Text>

            {/* What the sitting was, in facts rather than scores. True whether
                or not a score could be computed. */}
            <View style={styles.summaryRow}>
              <SummaryStat label="Minutes" value={String(Math.round(depth.durationMin))} />
              <View style={styles.summaryDivider} />
              <SummaryStat
                label="Avg BPM"
                value={depth.sessionBpm != null ? String(Math.round(depth.sessionBpm)) : '—'}
              />
              <View style={styles.summaryDivider} />
              <SummaryStat
                label="Avg HRV"
                value={depth.sessionRmssd != null ? `${Math.round(depth.sessionRmssd)}ms` : '—'}
              />
            </View>

            {scored && (
              <View style={styles.breakdown}>
                {depth.components.map((c) => {
                  const has = c.points != null;
                  const col = has ? depthBand(c.points as number).color : COLORS.muted;
                  return (
                    <View key={c.key} style={styles.compRow}>
                      <View style={styles.compHead}>
                        <Text style={styles.compLabel}>{c.label}</Text>
                        <Text style={[styles.compPts, { color: col }]}>
                          {has ? Math.round(c.points as number) : '—'}
                        </Text>
                      </View>
                      <View style={styles.track}>
                        <View style={[styles.fill, {
                          width: `${has ? (c.points as number) : 0}%`,
                          backgroundColor: has ? col : 'transparent',
                        }]} />
                      </View>
                      <Text style={styles.compDetail}>{c.detail}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {scored && depth.confidence < 0.999 && (
              <Text style={styles.confidence}>
                {Math.round(depth.confidence * 100)}% of the model had a reading behind it.
                Missing measures were left out, not counted as zero.
              </Text>
            )}
          </ScrollView>

          <View style={styles.btnRow}>
            {onViewInsights && (
              <TouchableOpacity style={styles.secondaryBtn} onPress={onViewInsights}>
                <Text style={styles.secondaryBtnText}>📈 Insights</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={onClose}>
              <Text style={styles.primaryBtnText}>🙏 Continue</Text>
            </TouchableOpacity>
          </View>

          <Text style={styles.foot}>
            Saved to this sitting. It will not change afterwards.
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
    maxHeight: '86%',
    backgroundColor: COLORS.darkBg,
    borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  scrollBody: { alignItems: 'center', paddingBottom: SPACING.sm },

  tierBadge: {
    paddingHorizontal: 12, paddingVertical: 4,
    borderRadius: 12, borderWidth: 1, marginBottom: SPACING.md,
  },
  tierBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },

  label: {
    fontSize: 11, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 2, textTransform: 'uppercase',
  },

  scoreRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4, gap: 6 },
  scoreBig: { fontSize: 62, fontWeight: '700', letterSpacing: -2 },
  scoreOutOf: { fontSize: 15, color: COLORS.muted, fontWeight: '600' },
  noScore: { fontSize: 22, color: COLORS.muted, fontWeight: '700', marginTop: 8 },

  note: {
    fontSize: 13, color: COLORS.cream, lineHeight: 19,
    textAlign: 'center', marginTop: SPACING.sm,
  },

  summaryRow: {
    flexDirection: 'row', alignItems: 'center',
    width: '100%', marginTop: SPACING.md,
    paddingVertical: SPACING.sm,
    borderTopWidth: 1, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  summaryDivider: { width: 1, height: 24, backgroundColor: COLORS.border },
  summaryValue: { color: COLORS.cream, fontSize: 16, fontWeight: '700' },
  summaryLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },

  breakdown: { width: '100%', marginTop: SPACING.md, gap: 11 },
  compRow: { width: '100%' },
  compHead: { flexDirection: 'row', alignItems: 'baseline' },
  compLabel: { color: COLORS.cream, fontSize: 12.5, fontWeight: '600', flex: 1 },
  compPts: { fontSize: 13, fontWeight: '700' },
  track: { height: 5, borderRadius: 3, backgroundColor: COLORS.border, marginTop: 5, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  compDetail: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: 4 },

  confidence: {
    color: COLORS.muted, fontSize: 10.5, lineHeight: 15,
    marginTop: SPACING.md, textAlign: 'center',
  },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md, width: '100%' },
  secondaryBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  primaryBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 12,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  primaryBtnText: { color: '#1a1206', fontSize: 13, fontWeight: '700' },

  foot: { color: COLORS.muted, fontSize: 10, marginTop: SPACING.sm, textAlign: 'center' },
});
