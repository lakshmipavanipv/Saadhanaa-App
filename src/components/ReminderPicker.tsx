import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Modal,
  Pressable,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SPACING } from '../theme';

export type Recurrence = 'once' | 'daily' | 'weekly' | 'monthly';

export interface ReminderValue {
  date: string;       // YYYY-MM-DD
  time: string;       // HH:MM
  recurrence: Recurrence;
  endDate?: string;   // YYYY-MM-DD optional, for daily/weekly/monthly
}

interface Props {
  value: ReminderValue;
  onChange: (v: ReminderValue) => void;
  label?: string;
}

const RECURRENCE_OPTIONS: { value: Recurrence; label: string }[] = [
  { value: 'once', label: 'One-time' },
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
];

const parseDate = (s: string): Date => {
  if (!s) return new Date();
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};

const formatDate = (d: Date): string => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const parseTime = (s: string, baseDate?: Date): Date => {
  const base = baseDate || new Date();
  if (!s) return base;
  const [hh, mm] = s.split(':').map(Number);
  base.setHours(hh || 0, mm || 0, 0, 0);
  return base;
};

const formatTime = (d: Date): string => {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

const prettyDate = (s: string): string => {
  if (!s) return '—';
  const d = parseDate(s);
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
};

const prettyTime = (s: string): string => {
  if (!s) return '—';
  const [h, m] = s.split(':').map(Number);
  const dt = new Date();
  dt.setHours(h, m, 0, 0);
  return dt.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true });
};

export const ReminderPicker: React.FC<Props> = ({ value, onChange, label }) => {
  const [showDate, setShowDate] = useState(false);
  const [showTime, setShowTime] = useState(false);
  const [showEndDate, setShowEndDate] = useState(false);

  return (
    <View style={styles.container}>
      {label && <Text style={styles.label}>{label}</Text>}

      {/* Date row */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Date</Text>
        <TouchableOpacity style={styles.pill} onPress={() => setShowDate(true)}>
          <Text style={styles.pillText}>📅 {prettyDate(value.date)}</Text>
        </TouchableOpacity>
      </View>

      {/* Time row */}
      <View style={styles.row}>
        <Text style={styles.rowLabel}>Time</Text>
        <TouchableOpacity style={styles.pill} onPress={() => setShowTime(true)}>
          <Text style={styles.pillText}>⏰ {prettyTime(value.time)}</Text>
        </TouchableOpacity>
      </View>

      {/* Recurrence row */}
      <Text style={[styles.rowLabel, { marginTop: SPACING.sm, marginBottom: 6 }]}>Repeat</Text>
      <View style={styles.recurRow}>
        {RECURRENCE_OPTIONS.map(opt => (
          <TouchableOpacity
            key={opt.value}
            style={[
              styles.recurChip,
              value.recurrence === opt.value && styles.recurChipActive,
            ]}
            onPress={() =>
              onChange({
                ...value,
                recurrence: opt.value,
                // clear endDate if going back to one-time
                endDate: opt.value === 'once' ? undefined : value.endDate,
              })
            }
          >
            <Text
              style={[
                styles.recurChipText,
                value.recurrence === opt.value && styles.recurChipTextActive,
              ]}
            >
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* End-date for recurring reminders */}
      {value.recurrence !== 'once' && (
        <View style={[styles.row, { marginTop: SPACING.sm }]}>
          <Text style={styles.rowLabel}>Until</Text>
          <TouchableOpacity style={styles.pill} onPress={() => setShowEndDate(true)}>
            <Text style={styles.pillText}>
              {value.endDate ? '📅 ' + prettyDate(value.endDate) : '∞ Forever'}
            </Text>
          </TouchableOpacity>
          {value.endDate && (
            <TouchableOpacity onPress={() => onChange({ ...value, endDate: undefined })}>
              <Text style={styles.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* Native pickers (only render when open to avoid unintended events) */}
      {showDate && (
        <DateTimePicker
          value={parseDate(value.date)}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            setShowDate(false);
            if (selected) onChange({ ...value, date: formatDate(selected) });
          }}
        />
      )}
      {showTime && (
        <DateTimePicker
          value={parseTime(value.time)}
          mode="time"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          onChange={(_, selected) => {
            setShowTime(false);
            if (selected) onChange({ ...value, time: formatTime(selected) });
          }}
        />
      )}
      {showEndDate && (
        <DateTimePicker
          value={value.endDate ? parseDate(value.endDate) : new Date()}
          mode="date"
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
          minimumDate={parseDate(value.date)}
          onChange={(_, selected) => {
            setShowEndDate(false);
            if (selected) onChange({ ...value, endDate: formatDate(selected) });
          }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: 'rgba(0,0,0,0.15)',
    borderRadius: 10,
    padding: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  label: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    marginVertical: 4,
  },
  rowLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
    width: 50,
  },
  pill: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  pillText: { fontSize: 13, color: COLORS.cream, fontWeight: '500' },
  clearBtn: {
    fontSize: 14,
    color: COLORS.error,
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  recurRow: { flexDirection: 'row', gap: 4, flexWrap: 'wrap' },
  recurChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  recurChipActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  recurChipText: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  recurChipTextActive: { color: COLORS.deep, fontWeight: '700' },
});
