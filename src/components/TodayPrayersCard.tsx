/**
 * TodayPrayersCard — at-a-glance list of TODAY's scheduled prayer times.
 *
 * Replaces the verbose "Upcoming Schedule" feed with a clean compact strip:
 * just deity name + time + "in 35 min". Designed for older users — large
 * touch targets, simple language.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { DeityIcon } from './DeityIcon';
import { Deity } from '../types';

interface PrayerSlot {
  deity: Deity;
  /** Next occurrence as Date — used to compute "in X min". */
  when: Date;
  /** HH:MM string from deity.prayerAlarm */
  timeLabel: string;
}

interface Props {
  slots: PrayerSlot[];
  onSelect?: (deity: Deity) => void;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const timeUntil = (when: Date): string => {
  const ms = when.getTime() - Date.now();
  if (ms < 0) return 'past';
  const mins = Math.round(ms / 60_000);
  if (mins < 1)  return 'now';
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} h`;
  const days = Math.round(hrs / 24);
  return `in ${days}d`;
};

export const TodayPrayersCard: React.FC<Props> = ({ slots, onSelect }) => {
  if (slots.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Today&apos;s Sadhana Times</Text>
        <Text style={styles.empty}>
          No reminders set yet. Tap a deity from the &quot;Deities&quot; tab to schedule one.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Today&apos;s Sadhana Times</Text>
      {slots.slice(0, 5).map((s, i) => (
        <TouchableOpacity
          key={s.deity.id}
          style={[styles.row, i === slots.length - 1 && { borderBottomWidth: 0 }]}
          onPress={() => onSelect?.(s.deity)}
          activeOpacity={0.7}
        >
          <View style={styles.iconWrap}>
            <DeityIcon deityId={s.deity.id} icon={s.deity.icon} size={20} color={COLORS.gold} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.deityName}>{s.deity.name}</Text>
            <Text style={styles.deityTime}>{s.timeLabel}</Text>
          </View>
          <Text style={styles.untilLabel}>{timeUntil(s.when)}</Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  title: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
  },
  empty: {
    fontSize: 12,
    color: COLORS.muted,
    fontStyle: 'italic',
    lineHeight: 17,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
  },
  deityName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  deityTime: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  untilLabel: { fontSize: 12, color: COLORS.gold, fontWeight: '700' },
});
