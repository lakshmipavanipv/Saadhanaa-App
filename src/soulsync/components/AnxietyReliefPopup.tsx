/**
 * AnxietyReliefPopup — first-response modal that appears when the
 * AnxietyDetector fires. Shows up BEFORE the locked GroundingOverlay
 * so the user can:
 *
 *   • See a calming "we noticed" message
 *   • Pick a technique (box breath / 4-7-8 / mantra / grounding)
 *   • Or tap "I'm fine" to dismiss
 *
 * Choosing a technique navigates to the Meditation tab with the
 * technique pre-opened (via the openId route param).
 */

import React from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { EmotionalEvent } from '../emotional/types';

interface Props {
  event: EmotionalEvent | null;
  visible: boolean;
  onChooseTechnique: (techniqueId: string) => void;
  onDismiss: () => void;
}

const TECHNIQUE_OPTIONS = [
  { id: 'box-breath',         label: 'Box Breathing',   icon: '🟦', sub: '4-4-4-4 · 4 min · fastest reset' },
  { id: 'four-seven-eight',   label: '4-7-8 Breath',    icon: '🌬️', sub: 'natural sedative · 3 min' },
  { id: 'physiological-sigh', label: 'Physiological Sigh', icon: '😮‍💨', sub: 'drops cortisol in 90 sec' },
  { id: 'om-meditation',      label: 'Om Meditation',   icon: '🕉️', sub: 'vibration · grounding mantra' },
  { id: 'maha-mrityunjaya',   label: 'Maha Mrityunjaya', icon: '📿', sub: 'healing & protection mantra' },
];

export const AnxietyReliefPopup: React.FC<Props> = ({
  event, visible, onChooseTechnique, onDismiss,
}) => {
  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Buzz indicator */}
          <View style={styles.buzzBadge}>
            <Text style={styles.buzzText}>📳 Saadhana Ring buzzed</Text>
          </View>

          <Text style={styles.title}>Take a breath with me</Text>
          <Text style={styles.message}>
            We noticed your heart rate spiked
            {(event.baselineBpm ?? 0) > 0
              ? ` (${event.bpm} bpm vs your usual ${event.baselineBpm})`
              : ''}
            {'.\n'}Let's settle the body together.
          </Text>

          <Text style={styles.chooseLabel}>Choose what feels right now:</Text>

          {TECHNIQUE_OPTIONS.map(t => (
            <TouchableOpacity
              key={t.id}
              style={styles.techRow}
              onPress={() => onChooseTechnique(t.id)}
              activeOpacity={0.7}
            >
              <Text style={styles.techIcon}>{t.icon}</Text>
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text style={styles.techLabel}>{t.label}</Text>
                <Text style={styles.techSub}>{t.sub}</Text>
              </View>
              <Text style={styles.techArrow}>›</Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity style={styles.dismissBtn} onPress={onDismiss}>
            <Text style={styles.dismissText}>I'm fine — dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  card: {
    width: '100%', maxWidth: 440,
    backgroundColor: COLORS.darkBg, borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 2, borderColor: 'rgba(255, 184, 0, 0.4)',
  },
  buzzBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(78, 168, 222, 0.15)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
    marginBottom: SPACING.md,
  },
  buzzText: { color: '#4ea8de', fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  title: {
    fontSize: 22, color: COLORS.cream, fontWeight: '700',
    textAlign: 'center', marginBottom: 6,
  },
  message: {
    fontSize: 13, color: COLORS.cream, lineHeight: 19,
    textAlign: 'center', marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  chooseLabel: {
    fontSize: 11, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase',
    marginBottom: SPACING.sm, textAlign: 'center',
  },
  techRow: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.sm,
    backgroundColor: COLORS.cardBg, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    marginBottom: 6,
  },
  techIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  techLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  techSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  techArrow: { fontSize: 22, color: COLORS.gold, opacity: 0.6 },

  dismissBtn: {
    marginTop: SPACING.md, paddingVertical: 10,
    alignItems: 'center',
  },
  dismissText: {
    color: COLORS.muted, fontSize: 12,
    textDecorationLine: 'underline',
  },
});
