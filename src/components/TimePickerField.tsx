/**
 * TimePickerField — single, reusable time-picker control used everywhere
 * in the app (Plan tab reminders, Exercise reminder, Japa deity alarm,
 * Sandhya reminder, etc.).
 *
 * v47 rewrite — reliability + elderly UX:
 *
 *   • The previous version relied on @react-native-community/datetimepicker
 *     which has known issues with React Native's New Architecture (which
 *     this app has enabled). On some Android builds the dialog simply
 *     never appeared when the user tapped the field — silent failure.
 *
 *   • Replaced with an in-app Modal containing TWO scrollable wheels:
 *     hours 0-23 and minutes 00-55 (5-min steps). Big tap targets
 *     (52 pt rows), gold highlight on the currently-picked slot, and a
 *     clear "Done" / "Cancel" pair at the bottom.
 *
 *   • Same prop shape as before: { value, onChange, placeholder, label,
 *     compact }. Drop-in replacement — no caller changes required.
 *
 * Why a grid + Modal beats the native picker for this app's audience:
 *   1. The user can SEE both hours and minutes at once — no spinner
 *      swiping required.
 *   2. Works identically on Android / iOS / web — no platform branching.
 *   3. No native module dependency that can silently break with newArch.
 *   4. 52 pt tap targets pass WCAG accessibility (44 pt minimum).
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, TextInput, StyleSheet, Modal, ScrollView,
} from 'react-native';
import { COLORS, SPACING } from '../theme';

interface Props {
  value: string | null;             // 'HH:MM' or null
  onChange: (next: string) => void;
  placeholder?: string;
  /** Optional small label shown above the field. */
  label?: string;
  /** Render compactly inside an existing form row. */
  compact?: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');

const HOURS = Array.from({ length: 24 }, (_, i) => i);            // 0..23
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);      // 0,5,10,...,55

export const TimePickerField: React.FC<Props> = ({
  value, onChange, placeholder = 'Tap to set ⏰', label, compact,
}) => {
  const [showModal, setShowModal] = useState(false);

  // Parse current value into hour + minute for highlighting in the wheel.
  const [pickedHour,   setPickedHour]   = useState<number>(7);
  const [pickedMinute, setPickedMinute] = useState<number>(0);

  useEffect(() => {
    if (value) {
      const [h, m] = value.split(':');
      setPickedHour(parseInt(h, 10) || 0);
      // Snap minutes to the nearest 5-min step for the grid
      const mm = parseInt(m, 10) || 0;
      setPickedMinute(Math.round(mm / 5) * 5 % 60);
    }
  }, [value]);

  // Auto-scroll the columns to the picked rows when the modal opens
  const hoursRef   = useRef<ScrollView | null>(null);
  const minutesRef = useRef<ScrollView | null>(null);
  useEffect(() => {
    if (!showModal) return;
    const t = setTimeout(() => {
      hoursRef.current?.scrollTo({ y: Math.max(0, pickedHour - 2) * ROW_H, animated: false });
      const mi = MINUTES.indexOf(pickedMinute);
      minutesRef.current?.scrollTo({ y: Math.max(0, mi - 2) * ROW_H, animated: false });
    }, 50);
    return () => clearTimeout(t);
  }, [showModal]);

  const handleDone = () => {
    onChange(`${pad(pickedHour)}:${pad(pickedMinute)}`);
    setShowModal(false);
  };

  return (
    <View style={compact ? undefined : { marginVertical: 4 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      {/* Tap target — big, with clock icon + current time */}
      <TouchableOpacity
        style={styles.input}
        onPress={() => setShowModal(true)}
        activeOpacity={0.7}
      >
        <Text style={{ color: value ? COLORS.cream : COLORS.muted, fontSize: 16, fontWeight: '600' }}>
          🕐  {value || placeholder}
        </Text>
      </TouchableOpacity>

      {/* Modal with hour + minute wheels */}
      <Modal visible={showModal} transparent animationType="fade" onRequestClose={() => setShowModal(false)}>
        <View style={styles.overlay}>
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Pick a time</Text>
            <Text style={styles.cardHint}>Tap an hour and a minute.</Text>

            <View style={styles.wheelsRow}>
              {/* Hours wheel */}
              <View style={styles.wheelCol}>
                <Text style={styles.wheelHeader}>HOUR</Text>
                <ScrollView
                  ref={hoursRef}
                  style={styles.wheelScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {HOURS.map(h => (
                    <TouchableOpacity
                      key={h}
                      style={[styles.wheelRow, pickedHour === h && styles.wheelRowActive]}
                      onPress={() => setPickedHour(h)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.wheelText, pickedHour === h && styles.wheelTextActive]}>
                        {pad(h)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <Text style={styles.colon}>:</Text>

              {/* Minutes wheel (5-min steps) */}
              <View style={styles.wheelCol}>
                <Text style={styles.wheelHeader}>MIN</Text>
                <ScrollView
                  ref={minutesRef}
                  style={styles.wheelScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {MINUTES.map(m => (
                    <TouchableOpacity
                      key={m}
                      style={[styles.wheelRow, pickedMinute === m && styles.wheelRowActive]}
                      onPress={() => setPickedMinute(m)}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.wheelText, pickedMinute === m && styles.wheelTextActive]}>
                        {pad(m)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            </View>

            <View style={styles.previewRow}>
              <Text style={styles.previewLabel}>Selected</Text>
              <Text style={styles.previewTime}>{pad(pickedHour)}:{pad(pickedMinute)}</Text>
            </View>

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowModal(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
                <Text style={styles.doneText}>Done</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const ROW_H = 52;   // tap target height — passes WCAG 44 pt minimum

const styles = StyleSheet.create({
  label: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.cardBg, borderRadius: 10,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.cream, fontSize: 16, fontWeight: '600',
    minHeight: 52, justifyContent: 'center',
  },

  // ── Modal ──
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    padding: SPACING.md,
  },
  card: {
    width: '100%', maxWidth: 360,
    backgroundColor: COLORS.darkBg,
    borderRadius: 16, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.gold,
  },
  cardTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '700', textAlign: 'center' },
  cardHint:  { fontSize: 12, color: COLORS.muted, textAlign: 'center', marginTop: 4, marginBottom: SPACING.md },

  wheelsRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12,
  },
  wheelCol: { flex: 1, alignItems: 'center' },
  wheelHeader: {
    fontSize: 11, color: COLORS.gold, fontWeight: '800', letterSpacing: 1.5,
    marginBottom: 6,
  },
  wheelScroll: {
    maxHeight: ROW_H * 5,
    width: '100%',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
  },
  wheelRow: {
    height: ROW_H,
    alignItems: 'center', justifyContent: 'center',
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  wheelRowActive: { backgroundColor: 'rgba(212,160,23,0.20)' },
  wheelText:    { fontSize: 22, color: COLORS.cream, fontWeight: '600' },
  wheelTextActive: { color: COLORS.gold, fontWeight: '800' },
  colon: { fontSize: 28, color: COLORS.cream, fontWeight: '700', paddingHorizontal: 4 },

  previewRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginTop: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  previewLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1 },
  previewTime:  { fontSize: 28, color: COLORS.gold, fontWeight: '800' },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center',
  },
  cancelText: { color: COLORS.muted, fontSize: 15, fontWeight: '600' },
  doneBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    backgroundColor: COLORS.gold,
    alignItems: 'center',
  },
  doneText: { color: COLORS.deep, fontSize: 15, fontWeight: '800' },
});
