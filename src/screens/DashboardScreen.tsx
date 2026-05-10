import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSadhana } from '../context';
import { todayStr, getGreeting, formatDate, getUpcoming, getDaysUntil, getTodayFest } from '../utils';
import { COLORS, SPACING, FONT_SIZES } from '../theme';

export const DashboardScreen = ({ navigation }: any) => {
  const { deities, history, selectedDeity, setSelectedDeity, alarmQueue, dismissAlarm } = useSadhana();
  const today = todayStr();
  const todayMalas = history.filter(h => h.date === today).reduce((s, h) => s + h.malas, 0);
  const upcoming = getUpcoming();
  const todayFest = getTodayFest();
  const dl = upcoming ? getDaysUntil(upcoming.date) : null;
  const dateStr = formatDate(today);

  const handleStartJapa = (deity: any) => {
    setSelectedDeity(deity);
    navigation?.navigate('Japa');
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tagline}>May your sadhana bring peace & liberation</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>

        {/* Alarm Banner */}
        {alarmQueue.length > 0 && (
          <View style={styles.alarmBanner}>
            <Text style={{ fontSize: 22 }}>⏰</Text>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.alarmTitle}>Prayer time — {alarmQueue[0].name}</Text>
              <Text style={styles.alarmDetail}>
                {alarmQueue[0].prayerAlarm} · {alarmQueue[0].mantra}
              </Text>
            </View>
            <TouchableOpacity onPress={dismissAlarm} style={styles.alarmDismiss}>
              <Text style={{ color: COLORS.cream }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Festival Wish */}
        {todayFest && (
          <View style={styles.wishBanner}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text style={styles.wishText}>{todayFest.wish}</Text>
            <Text style={styles.wishSub}>{todayFest.wishSub}</Text>
          </View>
        )}

        {/* Today's Stats */}
        <View style={styles.statsCard}>
          <Text style={styles.statsTitle}>Today's Sadhana</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{todayMalas}</Text>
              <Text style={styles.statLabel}>Malas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{todayMalas * 108}</Text>
              <Text style={styles.statLabel}>Japas</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{history.filter(h => h.date === today).length}</Text>
              <Text style={styles.statLabel}>Deities</Text>
            </View>
          </View>
          <Text style={styles.streak}>🔥 7 day streak — keep going!</Text>
        </View>

        {/* Quick Start */}
        <View style={styles.quickStartSection}>
          <Text style={styles.sectionTitle}>Quick Start Japa</Text>
          <View style={styles.quickStartGrid}>
            {deities.map(d => (
              <TouchableOpacity
                key={d.id}
                style={styles.deityCard}
                onPress={() => handleStartJapa(d)}
              >
                <Text style={styles.deityIcon}>{d.icon}</Text>
                <Text style={styles.deityCardName}>{d.name.split(' ').slice(-1)[0]}</Text>
                <Text style={styles.deityCardMalas}>{d.totalMalas} malas</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Upcoming Festival */}
        {upcoming && (
          <View style={styles.upcomingFest}>
            <View style={styles.upcomingHeader}>
              <Text style={styles.upcomingLabel}>Upcoming Festival</Text>
              <Text style={styles.upcomingName}>{upcoming.name}</Text>
              <Text style={styles.upcomingDays}>
                {dl === 0 ? '🎊 Today!' : dl === 1 ? '⏰ Tomorrow!' : dl && dl <= 7 ? `⚡ In ${dl} days` : `📅 In ${dl} days`}
              </Text>
            </View>
            <View style={styles.checklistPreview}>
              {upcoming.checklist.slice(0, 3).map(it => (
                <View key={it.id} style={styles.checklistItem}>
                  <View style={styles.checklistDot} />
                  <Text style={styles.checklistText}>{it.text}</Text>
                </View>
              ))}
              {upcoming.checklist.length > 3 && (
                <Text style={styles.checklistMore}>+{upcoming.checklist.length - 3} more items…</Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deep,
  },
  scrollContent: {
    paddingBottom: 100,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: 'center',
  },
  greeting: {
    fontSize: 28,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 12,
  },
  date: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '500',
  },
  alarmBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.15)',
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alarmTitle: {
    fontSize: 14,
    color: COLORS.cream,
    fontWeight: '600',
  },
  alarmDetail: {
    fontSize: 12,
    color: COLORS.saffron,
    marginTop: 2,
  },
  alarmDismiss: {
    paddingHorizontal: SPACING.sm,
  },
  wishBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  wishText: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '500',
    marginTop: 8,
    textAlign: 'center',
  },
  wishSub: {
    fontSize: 12,
    color: COLORS.gold,
    marginTop: 6,
  },
  statsCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
  },
  statsTitle: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  statsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: SPACING.md,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    color: COLORS.gold,
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 4,
  },
  streak: {
    textAlign: 'center',
    fontSize: 13,
    color: COLORS.saffron,
    fontWeight: '500',
  },
  quickStartSection: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 14,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  quickStartGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
  },
  deityCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
  },
  deityIcon: {
    fontSize: 32,
    marginBottom: SPACING.sm,
  },
  deityCardName: {
    fontSize: 12,
    color: COLORS.cream,
    fontWeight: '500',
  },
  deityCardMalas: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
  },
  upcomingFest: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
  },
  upcomingHeader: {
    marginBottom: SPACING.md,
  },
  upcomingLabel: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
    textTransform: 'uppercase',
  },
  upcomingName: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '600',
    marginVertical: 4,
  },
  upcomingDays: {
    fontSize: 13,
    color: COLORS.gold,
  },
  checklistPreview: {
    gap: SPACING.sm,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checklistDot: {
    width: 4,
    height: 4,
    backgroundColor: COLORS.gold,
    borderRadius: 2,
    marginRight: SPACING.sm,
  },
  checklistText: {
    fontSize: 12,
    color: COLORS.cream,
  },
  checklistMore: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 4,
    fontStyle: 'italic',
  },
});
