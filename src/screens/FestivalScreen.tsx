import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { FESTIVAL_DB, ALL_REGIONS } from '../constants';
import { Storage } from '../storage';
import { getDaysUntil, getTodayFest } from '../utils';
import { COLORS, SPACING } from '../theme';

type CheckedState = Record<string, boolean>;

export const FestivalScreen = () => {
  const [region, setRegion] = useState<'All' | 'Hindu' | 'Sikh' | 'Muslim' | 'Christian'>('Hindu');
  const [checked, setChecked] = useState<CheckedState>({});

  // Load checked state from storage
  useEffect(() => {
    const loadChecked = async () => {
      const saved = await Storage.get<CheckedState>('festChecked', {});
      setChecked(saved);
    };
    loadChecked();
  }, []);

  // Persist checked state
  useEffect(() => {
    Storage.set('festChecked', checked);
  }, [checked]);

  const toggle = (festId: string, itemId: number) => {
    const key = `${festId}-${itemId}`;
    setChecked(p => ({
      ...p,
      [key]: !p[key],
    }));
  };

  const festivals = (
    region === 'All'
      ? Object.values(FESTIVAL_DB).flat()
      : FESTIVAL_DB[region] || []
  ).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const todayFest = getTodayFest();

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Festival Calendar</Text>
          <Text style={styles.subtitle}>Checklists · Reminders · Wishes</Text>
        </View>

        {/* Region Tabs */}
        <View style={styles.tabsContainer}>
          {ALL_REGIONS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.tab, region === r && styles.tabActive]}
              onPress={() => setRegion(r as typeof region)}
            >
              <Text style={[styles.tabText, region === r && styles.tabTextActive]}>
                {r}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Today's Festival Banner */}
        {todayFest && (region === 'All' || region === todayFest.region) && (
          <View style={styles.wishBanner}>
            <Text style={{ fontSize: 32 }}>🎉</Text>
            <Text style={styles.wishText}>{todayFest.wish}</Text>
            <Text style={styles.wishSub}>{todayFest.wishSub}</Text>
          </View>
        )}

        {/* Festivals List */}
        {festivals.map((fest, i) => {
          const dl = getDaysUntil(fest.date);
          const isPast = dl < 0;
          const done = fest.checklist.filter(x => checked[`${fest.id}-${x.id}`]).length;

          return (
            <View key={fest.id} style={[styles.festCard, { opacity: isPast ? 0.55 : 1 }]}>
              {/* Festival Header */}
              <View style={styles.festHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.festName}>{fest.name}</Text>
                  <Text style={styles.festDate}>
                    {new Date(fest.date).toLocaleDateString('en-IN', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.festDays}>
                    {dl === 0
                      ? '🎊 Today!'
                      : isPast
                      ? '✓ Passed'
                      : dl === 1
                      ? '⏰ Tomorrow!'
                      : dl <= 7
                      ? `⚡ In ${dl} days`
                      : dl <= 14
                      ? `🔔 Coming up in ${dl} days`
                      : `📅 In ${dl} days`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={styles.festBadge}>{fest.region}</Text>
                  {done > 0 && (
                    <Text style={styles.festProgress}>
                      {done}/{fest.checklist.length} ready ✓
                    </Text>
                  )}
                </View>
              </View>

              {/* Checklist */}
              <View style={styles.checklistSection}>
                <Text style={styles.checklistTitle}>Shopping & Prep Checklist</Text>
                {fest.checklist.map(item => {
                  const key = `${fest.id}-${item.id}`;
                  const isChecked = !!checked[key];
                  return (
                    <TouchableOpacity
                      key={item.id}
                      style={styles.checklistItem}
                      onPress={() => toggle(fest.id, item.id)}
                    >
                      <View
                        style={[
                          styles.checkbox,
                          isChecked && styles.checkboxChecked,
                        ]}
                      >
                        {isChecked && (
                          <Text style={styles.checkmark}>✓</Text>
                        )}
                      </View>
                      <Text
                        style={[
                          styles.checklistText,
                          isChecked && styles.checklistTextDone,
                        ]}
                      >
                        {item.text}
                      </Text>
                      <Text style={styles.checklistTag}>{item.tag}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          );
        })}
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
  tabsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginBottom: SPACING.lg,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  tabText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '500',
  },
  tabTextActive: {
    color: COLORS.deep,
  },
  wishBanner: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    alignItems: 'center',
  },
  wishText: {
    fontSize: 15,
    color: COLORS.cream,
    fontWeight: '500',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },
  wishSub: {
    fontSize: 12,
    color: COLORS.gold,
    marginTop: SPACING.xs,
  },
  festCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  festHeader: {
    flexDirection: 'row',
    marginBottom: SPACING.md,
  },
  festName: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '600',
  },
  festDate: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.xs,
  },
  festDays: {
    fontSize: 12,
    color: COLORS.gold,
    marginTop: SPACING.xs,
  },
  festBadge: {
    fontSize: 11,
    color: COLORS.cream,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: SPACING.xs,
    borderRadius: 4,
  },
  festProgress: {
    fontSize: 10,
    color: COLORS.leaf,
    marginTop: SPACING.xs,
  },
  checklistSection: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: SPACING.md,
  },
  checklistTitle: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
    textTransform: 'uppercase',
    marginBottom: SPACING.sm,
    letterSpacing: 0.5,
  },
  checklistItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.gold,
    marginRight: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: COLORS.gold,
  },
  checkmark: {
    color: COLORS.deep,
    fontSize: 11,
    fontWeight: 'bold',
  },
  checklistText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.cream,
  },
  checklistTextDone: {
    color: COLORS.muted,
    textDecorationLine: 'line-through',
  },
  checklistTag: {
    fontSize: 14,
    marginLeft: SPACING.sm,
  },
});
