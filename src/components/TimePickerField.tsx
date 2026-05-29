/**
 * TimePickerField — single, reusable time-picker control used everywhere
 * in the app (Plan tab reminders, Exercise reminder, Japa deity alarm,
 * Sandhya reminder, etc.).
 *
 * Behaviour:
 *   • Renders a tap-styled "input" showing 🕐  HH:MM (or a placeholder).
 *   • Tap → opens the native @react-native-community/datetimepicker on
 *     Android (clock-face) and iOS (spinner).
 *   • On web (where the native picker doesn't render at all) it falls
 *     back to an inline HH:MM TextInput so the user can still type a
 *     time. Normalises "6:30", "0630", "6.30" → "06:30".
 *
 * onChange returns the time as 'HH:MM' (24-hour) — caller passes it to
 * its own state and reminder-scheduling logic. No business logic lives
 * inside the picker itself.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, TextInput, StyleSheet, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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

const normalizeHHMM = (raw: string): string | null => {
  const m = raw.trim().match(/^(\d{1,2})[:.]?(\d{2})$/);
  if (!m) return null;
  const hh = Math.max(0, Math.min(23, parseInt(m[1], 10) || 0));
  const mm = Math.max(0, Math.min(59, parseInt(m[2], 10) || 0));
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
};

export const TimePickerField: React.FC<Props> = ({
  value, onChange, placeholder = 'Tap to set ⏰', label, compact,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [webText, setWebText] = useState(value || '');

  React.useEffect(() => { setWebText(value || ''); }, [value]);

  const handleNativeChange = (_e: any, selected?: Date) => {
    setShowPicker(false);
    if (!selected) return;
    const hh = String(selected.getHours()).padStart(2, '0');
    const mm = String(selected.getMinutes()).padStart(2, '0');
    onChange(`${hh}:${mm}`);
  };

  const handleWebText = (raw: string) => {
    setWebText(raw);
    const normalized = normalizeHHMM(raw);
    if (normalized) onChange(normalized);
  };

  return (
    <View style={compact ? undefined : { marginVertical: 4 }}>
      {!!label && <Text style={styles.label}>{label}</Text>}

      {Platform.OS === 'web' ? (
        // Web fallback — HH:MM TextInput (the native DateTimePicker
        // doesn't render on react-native-web).
        <TextInput
          style={styles.input}
          value={webText}
          onChangeText={handleWebText}
          placeholder="HH:MM   (e.g. 06:30)"
          placeholderTextColor={COLORS.muted}
          keyboardType="numeric"
          maxLength={5}
        />
      ) : (
        <>
          <TouchableOpacity style={styles.input} onPress={() => setShowPicker(true)}>
            <Text style={{ color: value ? COLORS.cream : COLORS.muted, fontSize: 16, fontWeight: '600' }}>
              🕐  {value || placeholder}
            </Text>
          </TouchableOpacity>
          {showPicker && (
            <DateTimePicker
              value={(() => {
                const d = new Date();
                if (value) {
                  const [h, m] = value.split(':');
                  d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
                } else { d.setHours(7, 0, 0, 0); }
                return d;
              })()}
              mode="time"
              is24Hour
              display={Platform.OS === 'ios' ? 'spinner' : 'clock'}
              onChange={handleNativeChange}
            />
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  input: {
    backgroundColor: COLORS.cardBg, borderRadius: 10,
    paddingVertical: SPACING.sm + 2, paddingHorizontal: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.cream, fontSize: 16, fontWeight: '600',
    minHeight: 44, justifyContent: 'center',
  },
});
