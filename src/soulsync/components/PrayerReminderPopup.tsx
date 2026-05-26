/**
 * PrayerReminderPopup — full-screen "Do Japa Now" modal that appears
 * when a deity prayer-time notification fires (either while the app is
 * open OR when the user taps the system notification).
 *
 * Plays the deity's chosen alarm sound on mount (so even if the system
 * notification was silent, the user hears something).
 */

import React, { useEffect, useRef } from 'react';
import { Modal, View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useAudioPlayer } from 'expo-audio';
import { COLORS, SPACING } from '../../theme';
import { DeityIcon } from '../../components/DeityIcon';
import { Deity } from '../../types';
import { findSound } from '../../sounds';

interface Props {
  deity: Deity | null;
  visible: boolean;
  onStartJapa: () => void;
  onSnooze: () => void;
  onDismiss: () => void;
}

export const PrayerReminderPopup: React.FC<Props> = ({
  deity, visible, onStartJapa, onSnooze, onDismiss,
}) => {
  const sound = findSound(deity?.alarmSoundId);
  const source = deity?.alarmSoundId === 'custom' && deity.alarmSoundUri
    ? { uri: deity.alarmSoundUri }
    : sound?.module ?? null;

  const player = useAudioPlayer(source);
  const playedRef = useRef(false);

  // Play the alarm sound when the popup first opens.
  useEffect(() => {
    if (!visible || playedRef.current) return;
    if (player && source) {
      try {
        player.seekTo(0);
        player.play();
        playedRef.current = true;
      } catch { /* sound is optional */ }
    }
  }, [visible, player, source]);

  // Stop the sound when the popup closes.
  useEffect(() => {
    if (!visible && playedRef.current) {
      try { player?.pause(); } catch { /* ignore */ }
      playedRef.current = false;
    }
  }, [visible, player]);

  if (!deity) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Big deity icon */}
          <View style={styles.iconCircle}>
            <DeityIcon
              deityId={deity.id}
              icon={deity.icon}
              size={72}
              color={COLORS.gold}
            />
          </View>

          <Text style={styles.label}>PRAYER TIME</Text>
          <Text style={styles.deityName}>{deity.name}</Text>

          {deity.mantra && (
            <Text style={styles.mantra}>"{deity.mantra}"</Text>
          )}

          <Text style={styles.time}>⏰ {deity.prayerAlarm}</Text>

          {/* Big primary CTA */}
          <TouchableOpacity style={styles.startBtn} onPress={onStartJapa}>
            <Text style={styles.startBtnText}>🪷  Do Japa Now</Text>
          </TouchableOpacity>

          <View style={styles.secondaryRow}>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onSnooze}>
              <Text style={styles.secondaryBtnText}>Snooze 5 min</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onDismiss}>
              <Text style={styles.secondaryBtnText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  card: {
    width: '100%', maxWidth: 420,
    backgroundColor: COLORS.darkBg, borderRadius: 24,
    paddingVertical: SPACING.xl, paddingHorizontal: SPACING.lg,
    borderWidth: 2, borderColor: COLORS.gold,
    alignItems: 'center',
  },
  iconCircle: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 2, borderColor: COLORS.gold,
    justifyContent: 'center', alignItems: 'center',
    marginBottom: SPACING.md,
  },
  label: {
    fontSize: 11, color: COLORS.gold, fontWeight: '800',
    letterSpacing: 2.5, marginBottom: 6,
  },
  deityName: {
    fontSize: 26, color: COLORS.cream, fontWeight: '700',
    textAlign: 'center', marginBottom: SPACING.sm,
  },
  mantra: {
    fontSize: 14, color: COLORS.cream, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 20,
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  time: {
    fontSize: 16, color: COLORS.saffron, fontWeight: '600',
    marginBottom: SPACING.lg,
  },
  startBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: 16, paddingHorizontal: SPACING.xl,
    borderRadius: 12,
    width: '100%', alignItems: 'center',
    minHeight: 56,
    elevation: 4,
  },
  startBtnText: {
    color: COLORS.deep, fontSize: 18, fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryRow: {
    flexDirection: 'row', gap: SPACING.sm,
    marginTop: SPACING.md, width: '100%',
  },
  secondaryBtn: {
    flex: 1, paddingVertical: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  secondaryBtnText: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
});
