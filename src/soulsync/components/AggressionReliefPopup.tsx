/**
 * AggressionReliefPopup — first-response modal when AggressionDetector
 * fires (BVP spike + erratic hand movement). Parallel to AnxietyReliefPopup
 * but with COOLING techniques specifically targeting heat/rage states.
 *
 *   • Shitali / Sheetkari — physical cooling breaths (curl the tongue)
 *   • Chandra Bhedana    — left-nostril-only, activates parasympathetic
 *   • Cold water         — splash on face/wrists, an immediate reset
 *   • Forgiveness mantra — Ahimsa contemplation
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

const COOLING_OPTIONS = [
  { id: 'shitali-breath',   label: 'Shitali Cooling Breath', icon: '❄️', sub: 'Tongue-curl inhale · drops body heat in 2 min' },
  { id: 'chandra-bhedana',  label: 'Left Nostril Breathing', icon: '🌙', sub: 'Chandra Bhedana · activates calm nerve' },
  { id: 'cold-water-reset', label: 'Cold Water Reset',        icon: '💧', sub: 'Splash face / wrists · 30 sec · instant' },
  { id: 'physiological-sigh', label: 'Physiological Sigh',   icon: '😮‍💨', sub: 'Double inhale, long exhale · 90 sec' },
  { id: 'ahimsa-contemplation', label: 'Ahimsa Contemplation', icon: '🤲', sub: 'Forgive · loving-kindness · 5 min' },
];

export const AggressionReliefPopup: React.FC<Props> = ({
  event, visible, onChooseTechnique, onDismiss,
}) => {
  if (!event) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Buzz indicator */}
          <View style={styles.buzzBadge}>
            <Text style={styles.buzzText}>📳 Ring buzzed · agitation detected</Text>
          </View>

          <Text style={styles.title}>I&apos;m with you 💛</Text>
          <Text style={styles.message}>
            My dear friend, your body is carrying some heat right now —{'\n'}
            and that&apos;s okay. You&apos;re human. You&apos;re allowed to feel this.{'\n\n'}
            Relax for yourself. Not for anyone else. Just for <Text style={styles.messageEmphasis}>you</Text>.{'\n\n'}
            Step away for 2 minutes. The moment that triggered you{'\n'}
            will still be there — but you&apos;ll meet it with a clearer heart.
          </Text>

          <Text style={styles.chooseLabel}>A gentle cooling practice — pick one ♡</Text>

          {COOLING_OPTIONS.map(t => (
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
            <Text style={styles.dismissText}>I&apos;m okay now — thank you 🙏</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.78)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  card: {
    width: '100%', maxWidth: 440,
    backgroundColor: COLORS.darkBg, borderRadius: 20,
    padding: SPACING.lg,
    borderWidth: 2,
    // Cool blue border (aggression = heat; cooling color = blue)
    borderColor: 'rgba(78, 168, 222, 0.55)',
  },
  buzzBadge: {
    alignSelf: 'center',
    backgroundColor: 'rgba(255, 140, 66, 0.18)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4,
    marginBottom: SPACING.md,
  },
  buzzText: { color: COLORS.saffron, fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  title: {
    fontSize: 22, color: COLORS.cream, fontWeight: '700',
    textAlign: 'center', marginBottom: 6,
  },
  message: {
    fontSize: 13, color: COLORS.cream, lineHeight: 20,
    textAlign: 'center', marginBottom: SPACING.md,
    paddingHorizontal: SPACING.sm,
  },
  messageEmphasis: {
    color: COLORS.gold, fontWeight: '700', fontStyle: 'italic',
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
    borderWidth: 1, borderColor: 'rgba(78, 168, 222, 0.2)',
    marginBottom: 6,
  },
  techIcon: { fontSize: 22, width: 30, textAlign: 'center' },
  techLabel: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  techSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  techArrow: { fontSize: 22, color: '#4ea8de', opacity: 0.6 },

  dismissBtn: {
    marginTop: SPACING.md, paddingVertical: 10,
    alignItems: 'center',
  },
  dismissText: {
    color: COLORS.muted, fontSize: 12,
    textDecorationLine: 'underline',
  },
});
