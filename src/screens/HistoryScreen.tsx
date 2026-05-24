import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { useSadhana } from '../context';
import { WEEK_DAYS } from '../constants';
import { formatShortDate } from '../utils';
import { COLORS, SPACING } from '../theme';
import { MoodTimelineCard }      from '../soulsync/components/MoodTimelineCard';
import { MultiMetricTrendCard }  from '../soulsync/components/MultiMetricTrendCard';
import { StepsJapaCard }         from '../soulsync/components/StepsJapaCard';
import { EmotionalSummaryCard }  from '../soulsync/components/EmotionalSummaryCard';
import { AIInsightsCard }        from '../soulsync/components/AIInsightsCard';

type TrendRange = 'daily' | 'weekly' | 'monthly' | 'yearly';

const RANGE_LABELS: Record<TrendRange, string> = {
  daily: 'Last 7 Days',
  weekly: 'Last 4 Weeks',
  monthly: 'Last 6 Months',
  yearly: 'Last 5 Years',
};

export const HistoryScreen = () => {
  const { history, deities, deityProgress, userProfile } = useSadhana();
  const inProgressJapas = Object.values(deityProgress).reduce(
    (s, p) => s + (p.count || 0), 0
  );
  const [range, setRange] = useState<TrendRange>('weekly');

  const trendData = useMemo(() => {
    const now = new Date();
    const buckets: { label: string; value: number }[] = [];

    if (range === 'daily') {
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setDate(d.getDate() - i);
        const ds = d.toISOString().split('T')[0];
        const malas = history
          .filter(h => h.date === ds)
          .reduce((s, h) => s + h.malas, 0);
        buckets.push({
          label: d.toLocaleDateString('en', { weekday: 'short' }),
          value: malas,
        });
      }
    } else if (range === 'weekly') {
      for (let i = 3; i >= 0; i--) {
        const start = new Date(now);
        start.setDate(start.getDate() - i * 7 - 6);
        const end = new Date(now);
        end.setDate(end.getDate() - i * 7);
        const malas = history
          .filter(h => {
            const d = new Date(h.date);
            return d >= start && d <= end;
          })
          .reduce((s, h) => s + h.malas, 0);
        buckets.push({ label: `W${4 - i}`, value: malas });
      }
    } else if (range === 'monthly') {
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const malas = history
          .filter(h => {
            const hd = new Date(h.date);
            return (
              hd.getFullYear() === d.getFullYear() &&
              hd.getMonth() === d.getMonth()
            );
          })
          .reduce((s, h) => s + h.malas, 0);
        buckets.push({
          label: d.toLocaleDateString('en', { month: 'short' }),
          value: malas,
        });
      }
    } else {
      for (let i = 4; i >= 0; i--) {
        const year = now.getFullYear() - i;
        const malas = history
          .filter(h => new Date(h.date).getFullYear() === year)
          .reduce((s, h) => s + h.malas, 0);
        buckets.push({ label: String(year), value: malas });
      }
    }
    return buckets;
  }, [history, range]);

  const maxValue = Math.max(...trendData.map(b => b.value), 1);

  const deityStats = useMemo(() => {
    const stats: Record<string, { malas: number; japas: number; deity: string; icon: string }> = {};
    history.forEach(h => {
      const deity = deities.find(d => d.id === h.deityId);
      const key = h.deityId || h.deity;
      if (!stats[key]) {
        stats[key] = {
          malas: 0,
          japas: 0,
          deity: h.deity,
          icon: deity?.icon || '🙏',
        };
      }
      stats[key].malas += h.malas;
      stats[key].japas += h.japas;
    });
    return Object.entries(stats).sort((a, b) => b[1].malas - a[1].malas);
  }, [history, deities]);

  const totalMalas = history.reduce((s, h) => s + h.malas, 0);
  // Total japas = completed-mala japas + currently in-progress bead taps
  const totalJapas = history.reduce((s, h) => s + h.japas, 0) + inProgressJapas;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Your Journey</Text>
          <Text style={styles.subtitle}>
            {totalMalas.toLocaleString()} malas · {totalJapas.toLocaleString()} japas
          </Text>
        </View>

        {/* Soulsync — 24h mood timeline + multi-metric trends + emotional summary + AI retrospective */}
        <MoodTimelineCard />
        <MultiMetricTrendCard />
        <StepsJapaCard days={30} />
        <EmotionalSummaryCard />
        <AIInsightsCard userName={userProfile?.name} mode="retrospective" />

        {/* Lifetime Stats */}
        <View style={styles.lifetimeCard}>
          <View style={styles.lifetimeStat}>
            <Text style={styles.lifetimeValue}>{totalMalas.toLocaleString()}</Text>
            <Text style={styles.lifetimeLabel}>Total Malas</Text>
          </View>
          <View style={styles.lifetimeDivider} />
          <View style={styles.lifetimeStat}>
            <Text style={styles.lifetimeValue}>{totalJapas.toLocaleString()}</Text>
            <Text style={styles.lifetimeLabel}>Total Japas</Text>
          </View>
          <View style={styles.lifetimeDivider} />
          <View style={styles.lifetimeStat}>
            <Text style={styles.lifetimeValue}>{history.length}</Text>
            <Text style={styles.lifetimeLabel}>Sessions</Text>
          </View>
        </View>

        {/* Trend Range Selector */}
        <View style={styles.rangeTabs}>
          {(['daily', 'weekly', 'monthly', 'yearly'] as TrendRange[]).map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.rangeTab, range === r && styles.rangeTabActive]}
              onPress={() => setRange(r)}
            >
              <Text style={[styles.rangeTabText, range === r && styles.rangeTabTextActive]}>
                {r.charAt(0).toUpperCase() + r.slice(1)}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Trend Chart */}
        <View style={styles.chartCard}>
          <Text style={styles.chartTitle}>{RANGE_LABELS[range]} — Malas</Text>
          <View style={styles.barChart}>
            {trendData.map((bucket, i) => {
              const heightPx = (bucket.value / maxValue) * 140;
              return (
                <View key={i} style={styles.barWrap}>
                  {bucket.value > 0 && (
                    <Text style={styles.barValue}>{bucket.value}</Text>
                  )}
                  <View style={[styles.bar, { height: Math.max(heightPx, 4) }]} />
                  <Text style={styles.barDay}>{bucket.label}</Text>
                </View>
              );
            })}
          </View>
        </View>

        {/* Per-Deity Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Total Japas by Deity</Text>
          {deityStats.length === 0 ? (
            <Text style={styles.emptyText}>No sessions logged yet</Text>
          ) : (
            deityStats.map(([key, stat]) => {
              const pct = totalMalas > 0 ? (stat.malas / totalMalas) * 100 : 0;
              return (
                <View key={key} style={styles.deityCard}>
                  <Text style={styles.deityIcon}>{stat.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deityName}>{stat.deity}</Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${pct}%` }]} />
                    </View>
                    <Text style={styles.deitySub}>
                      {stat.malas.toLocaleString()} malas · {stat.japas.toLocaleString()} japas
                    </Text>
                  </View>
                  <Text style={styles.deityPct}>{pct.toFixed(0)}%</Text>
                </View>
              );
            })
          )}
        </View>

        {/* Recent Sessions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Recent Sessions</Text>
          {history.slice(0, 10).map((entry, i) => (
            <View key={entry.id || i} style={styles.historyEntry}>
              <View style={{ flex: 1 }}>
                <Text style={styles.historyDate}>{formatShortDate(entry.date)}</Text>
                <Text style={styles.historyDeity}>{entry.deity}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={styles.historyMalas}>{entry.malas} malas</Text>
                <Text style={styles.historyJapas}>{entry.japas} japas</Text>
              </View>
            </View>
          ))}
          {history.length === 0 && (
            <Text style={styles.emptyText}>Save your first japa session</Text>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.lg,
    paddingBottom: SPACING.xl,
  },
  header: { marginBottom: SPACING.lg },
  title: {
    fontSize: 24,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  subtitle: { fontSize: 13, color: COLORS.muted },
  lifetimeCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  lifetimeStat: { flex: 1, alignItems: 'center' },
  lifetimeValue: {
    fontSize: 22,
    color: COLORS.gold,
    fontWeight: '700',
  },
  lifetimeLabel: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  lifetimeDivider: {
    width: 1,
    height: 32,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
  },
  rangeTabs: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  rangeTab: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  rangeTabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  rangeTabText: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  rangeTabTextActive: { color: COLORS.deep },
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
    height: 180,
  },
  barWrap: { alignItems: 'center', flex: 1, gap: SPACING.xs },
  barValue: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
    minHeight: 16,
  },
  bar: {
    width: '60%',
    backgroundColor: COLORS.gold,
    borderRadius: 4,
    minWidth: 10,
  },
  barDay: { fontSize: 11, color: COLORS.muted, marginTop: SPACING.sm },
  section: { marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: SPACING.md,
  },
  deityCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  deityIcon: { fontSize: 28, marginRight: SPACING.md },
  deityName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderRadius: 3,
    marginVertical: 6,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 3,
  },
  deitySub: { fontSize: 11, color: COLORS.muted },
  deityPct: {
    fontSize: 16,
    color: COLORS.gold,
    fontWeight: '700',
    marginLeft: SPACING.sm,
  },
  historyEntry: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  historyDate: { fontSize: 11, color: COLORS.muted, fontWeight: '500' },
  historyDeity: {
    fontSize: 14,
    color: COLORS.cream,
    fontWeight: '500',
    marginTop: 2,
  },
  historyMalas: {
    fontSize: 14,
    color: COLORS.gold,
    fontWeight: '600',
  },
  historyJapas: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  emptyText: {
    color: COLORS.muted,
    fontStyle: 'italic',
    fontSize: 13,
    textAlign: 'center',
    paddingVertical: SPACING.lg,
  },
});
