import React from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSadhana } from '../context';
import { WEEK_DAYS } from '../constants';
import { formatShortDate } from '../utils';
import { COLORS, SPACING } from '../theme';

const { width } = Dimensions.get('window');

export const HistoryScreen = () => {
  const { history } = useSadhana();

  // Calculate weekly stats
  const weeklyMalas = WEEK_DAYS.map((_, i) =>
    history
      .filter(h => {
        const d = new Date(h.date);
        const dow = d.getDay();
        return (dow === 0 ? 6 : dow - 1) === i;
      })
      .reduce((s, e) => s + e.malas, 0)
  );

  const maxMalas = Math.max(...weeklyMalas, 1);

  // Calculate deity stats
  const deityStats: Record<string, number> = {};
  history.forEach(h => {
    deityStats[h.deity] = (deityStats[h.deity] || 0) + h.malas;
  });

  const totalMalas = history.reduce((s, h) => s + h.malas, 0);
  const totalJapas = totalMalas * 108;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Sadhana History</Text>
          <Text style={styles.subtitle}>
            {totalMalas} total malas · {totalJapas.toLocaleString()} japas
          </Text>
        </View>

        {/* Weekly Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>This Week — Malas per Day</Text>
          <View style={styles.barChart}>
            {weeklyMalas.map((v, i) => {
              const height = (v / maxMalas) * 120;
              return (
                <View key={i} style={styles.barWrap}>
                  {v > 0 && <Text style={styles.barValue}>{v}</Text>}
                  <View
                    style={[
                      styles.bar,
                      { height: Math.max(height, 4) },
                    ]}
                  />
                  <Text style={styles.barDay}>{WEEK_DAYS[i]}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* All-time Deity Stats */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>All Time by Deity</Text>
          {Object.entries(deityStats)
            .sort((a, b) => b[1] - a[1])
            .map(([deity, malas], i) => (
              <View key={i} style={styles.deityRow}>
                <Text style={styles.deityRowName}>{deity}</Text>
                <Text style={styles.deityRowMalas}>{malas} malas</Text>
              </View>
            ))}
        </View>

        {/* Recent Sessions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          {history.slice(0, 10).map((entry, i) => (
            <View key={entry.id || i} style={styles.historyEntry}>
              <View style={styles.historyLeft}>
                <Text style={styles.historyDate}>
                  {formatShortDate(entry.date)}
                </Text>
                <Text style={styles.historyDeity}>{entry.deity}</Text>
                <View style={styles.historyStats}>
                  <Text style={styles.historyMalas}>{entry.malas}</Text>
                  <Text style={styles.historyJapas}>
                    malas · {entry.japas} japas
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deep,
  },
  content: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  header: {
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: 24,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: 13,
    color: COLORS.muted,
  },
  chartCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  chartTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: SPACING.md,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 160,
  },
  barWrap: {
    alignItems: 'center',
    flex: 1,
    gap: SPACING.xs,
  },
  barValue: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
    minHeight: 16,
  },
  bar: {
    width: '70%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
    minWidth: 12,
  },
  barDay: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: SPACING.sm,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: SPACING.md,
  },
  deityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.05)',
  },
  deityRowName: {
    fontSize: 14,
    color: COLORS.cream,
  },
  deityRowMalas: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  historyEntry: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    flexDirection: 'row',
  },
  historyLeft: {
    flex: 1,
  },
  historyDate: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '500',
  },
  historyDeity: {
    fontSize: 14,
    color: COLORS.cream,
    fontWeight: '500',
    marginVertical: SPACING.xs,
  },
  historyStats: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  historyMalas: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  historyJapas: {
    fontSize: 11,
    color: COLORS.muted,
  },
});
