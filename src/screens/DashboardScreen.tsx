import React, { useEffect, useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSadhana } from '../context';
import { Storage } from '../storage';
import {
  todayStr,
  getGreeting,
  formatDate,
  getUpcoming,
  getUpcomingFestivals,
  getDaysUntil,
  getTodayFest,
  japasToSeconds,
  formatSadhanaTime,
  formatTimeUntil,
  nextOccurrenceOfTime,
  formatShortDate,
} from '../utils';
import { COLORS, SPACING } from '../theme';
import { CalmDivergenceCard } from '../soulsync/components/CalmDivergenceCard';

interface FestReminder {
  shopping?: { enabled: boolean; date: string; time: string; recurrence?: string };
  morning?: { enabled: boolean; time: string };
  pooja?: { enabled: boolean };
}

interface SandhyaSettings {
  times: Record<'pratah' | 'madhyahnika' | 'sayam', string>;
  reminders: Record<'pratah' | 'madhyahnika' | 'sayam', boolean>;
}

export const DashboardScreen = ({ navigation }: any) => {
  const { deities, history, setSelectedDeity, alarmQueue, dismissAlarm, deityProgress } = useSadhana();
  const [festReminders, setFestReminders] = useState<Record<string, FestReminder>>({});
  const [sandhyaSettings, setSandhyaSettings] = useState<SandhyaSettings | null>(null);
  const [_tick, setTick] = useState(0);   // refresh "in X mins" every minute

  useEffect(() => {
    Storage.get<Record<string, FestReminder>>('festReminders', {}).then(setFestReminders);
    Storage.get<SandhyaSettings | null>('sandhyaSettings', null).then(setSandhyaSettings);
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── KPIs ─────────────────────────────────────────────────────────
  // Include in-progress count from deityProgress so dashboards update
  // on every single bead tap, not just on full-mala completion.
  const inProgressJapas = useMemo(
    () => Object.values(deityProgress).reduce((s, p) => s + (p.count || 0), 0),
    [deityProgress]
  );
  const totalJapasHistorical = useMemo(
    () => history.reduce((s, h) => s + h.japas, 0),
    [history]
  );
  const totalJapas = totalJapasHistorical + inProgressJapas;
  const totalMalas = useMemo(
    () => history.reduce((s, h) => s + h.malas, 0),
    [history]
  );
  const sadhanaSeconds = japasToSeconds(totalJapas);
  const numDeitiesChanted = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => h.deityId && set.add(h.deityId));
    // include any deity with in-progress count > 0
    Object.entries(deityProgress).forEach(([id, p]) => {
      if ((p.count || 0) > 0 || (p.malas || 0) > 0) set.add(id);
    });
    return set.size;
  }, [history, deityProgress]);
  const todayFest = getTodayFest();
  const upcoming = getUpcoming();
  const todayCount = history.filter(h => h.date === todayStr()).reduce((s, h) => s + h.malas, 0);

  // ── Per-deity breakdown ──────────────────────────────────────────
  const perDeity = useMemo(() => {
    const m: Record<string, { name: string; icon: string; malas: number; japas: number; color: string }> = {};
    for (const h of history) {
      const d = deities.find(d => d.id === h.deityId);
      const key = h.deityId || h.deity;
      if (!m[key]) {
        m[key] = {
          name: h.deity,
          icon: d?.icon || '🙏',
          malas: 0,
          japas: 0,
          color: d?.malaColor || COLORS.gold,
        };
      }
      m[key].malas += h.malas;
      m[key].japas += h.japas;
    }
    // Add in-progress japas (current bead position) for any active deity
    for (const [id, p] of Object.entries(deityProgress)) {
      if ((p.count || 0) === 0) continue;
      const d = deities.find(d => d.id === id);
      if (!d) continue;
      if (!m[id]) {
        m[id] = { name: d.name, icon: d.icon, malas: 0, japas: 0, color: d.malaColor || COLORS.gold };
      }
      m[id].japas += p.count;
    }
    return Object.values(m).sort((a, b) => b.japas - a.japas);
  }, [history, deities, deityProgress]);
  const maxDeityMalas = Math.max(...perDeity.map(d => d.malas), 1);

  // ── Reminder feed (sorted chronologically) ───────────────────────
  type FeedItem = {
    when: Date;
    label: string;
    detail: string;
    icon: string;
    color: string;
  };
  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];

    // Deity japa alarms
    for (const d of deities) {
      if (!d.alarmOn) continue;
      items.push({
        when: nextOccurrenceOfTime(d.prayerAlarm),
        label: `${d.icon} ${d.name}`,
        detail: `Japa at ${d.prayerAlarm}`,
        icon: '⏰',
        color: COLORS.gold,
      });
    }

    // Sandhya Vandanam reminders
    if (sandhyaSettings) {
      const labels: Record<string, string> = {
        pratah: 'Pratah Sandhya 🌅',
        madhyahnika: 'Madhyahnika Sandhya ☀️',
        sayam: 'Sayam Sandhya 🌙',
      };
      for (const id of ['pratah', 'madhyahnika', 'sayam'] as const) {
        if (sandhyaSettings.reminders[id]) {
          const t = sandhyaSettings.times[id];
          items.push({
            when: nextOccurrenceOfTime(t),
            label: labels[id],
            detail: `at ${t}`,
            icon: '🪷',
            color: COLORS.saffron,
          });
        }
      }
    }

    // Festival reminders (shopping + morning)
    for (const [festId, r] of Object.entries(festReminders)) {
      const fest = [...require('../festivalsData').PANCHANG_FESTIVALS].find((f: any) => f.id === festId);
      const festName = fest?.name || festId;
      if (r.shopping?.enabled && r.shopping.date) {
        const [y, mo, d] = r.shopping.date.split('-').map(Number);
        const [h, mi] = (r.shopping.time || '10:00').split(':').map(Number);
        const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
        if (dt.getTime() > Date.now()) {
          items.push({
            when: dt,
            label: `🛒 ${festName}`,
            detail: `Shopping reminder · ${r.shopping.recurrence || 'once'}`,
            icon: '🛒',
            color: COLORS.leaf,
          });
        }
      }
      if (r.morning?.enabled && fest?.date) {
        const [y, mo, d] = fest.date.split('-').map(Number);
        const [h, mi] = (r.morning.time || '06:00').split(':').map(Number);
        const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
        if (dt.getTime() > Date.now()) {
          items.push({
            when: dt,
            label: `🌅 ${festName}`,
            detail: `Festival morning at ${r.morning.time}`,
            icon: '🌅',
            color: COLORS.saffron,
          });
        }
      }
    }

    items.sort((a, b) => a.when.getTime() - b.when.getTime());
    return items;
  }, [deities, sandhyaSettings, festReminders, _tick]);

  const nextJapa = feedItems.find(i => i.icon === '⏰');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.greeting}>{getGreeting()}</Text>
          <Text style={styles.tagline}>May your sadhana bring peace</Text>
          <Text style={styles.date}>{formatDate(todayStr())}</Text>
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

        {/* Soulsync — Calm Divergence + Sleep correlation */}
        <CalmDivergenceCard />

        {/* Today's festival banner */}
        {todayFest && (
          <View style={styles.todayFestCard}>
            <Text style={{ fontSize: 36 }}>{todayFest.deityIcon}</Text>
            <Text style={styles.todayFestName}>{todayFest.name}</Text>
            <Text style={styles.todayFestWish}>{todayFest.wish}</Text>
          </View>
        )}

        {/* Next Japa reminder strip */}
        {nextJapa && (
          <View style={styles.nextJapaCard}>
            <Text style={styles.nextJapaLabel}>NEXT JAPA</Text>
            <View style={styles.nextJapaRow}>
              <Text style={styles.nextJapaName}>{nextJapa.label}</Text>
              <Text style={styles.nextJapaWhen}>{formatTimeUntil(nextJapa.when)}</Text>
            </View>
            <Text style={styles.nextJapaDetail}>{nextJapa.detail}</Text>
          </View>
        )}

        {/* ───── CORE KPIs ───── */}
        <View style={styles.kpiCard}>
          <View style={styles.kpiCol}>
            <Text style={styles.kpiValue}>{formatSadhanaTime(sadhanaSeconds)}</Text>
            <Text style={styles.kpiLabel}>Sadhana</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiValue}>{totalMalas.toLocaleString()}</Text>
            <Text style={styles.kpiLabel}>Malas</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiCol}>
            <Text style={styles.kpiValue}>{numDeitiesChanted}</Text>
            <Text style={styles.kpiLabel}>Deities</Text>
          </View>
        </View>

        {/* Today's count strip */}
        <View style={styles.todayStrip}>
          <Text style={styles.todayStripText}>
            🔥 Today: {todayCount} mala{todayCount !== 1 ? 's' : ''} ·{' '}
            {formatSadhanaTime(japasToSeconds(todayCount * 108))} spent
          </Text>
        </View>

        {/* ───── Per-deity Breakdown ───── */}
        {perDeity.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Per-deity Breakdown</Text>
            {perDeity.map((d, i) => (
              <View key={i} style={styles.deityRow}>
                <Text style={styles.deityRowIcon}>{d.icon}</Text>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <View style={styles.deityRowHeader}>
                    <Text style={styles.deityRowName} numberOfLines={1}>
                      {d.name.split(' ').slice(-1)[0]}
                    </Text>
                    <Text style={styles.deityRowMalas}>{d.malas} malas</Text>
                  </View>
                  <View style={styles.deityBarTrack}>
                    <View
                      style={[
                        styles.deityBarFill,
                        {
                          width: `${(d.malas / maxDeityMalas) * 100}%`,
                          backgroundColor: d.color,
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.deityRowTime}>
                    {formatSadhanaTime(japasToSeconds(d.japas))} of sadhana
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ───── Reminder Feed ───── */}
        {feedItems.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Upcoming Schedule</Text>
            {feedItems.slice(0, 6).map((item, i) => (
              <View key={i} style={styles.feedRow}>
                <Text style={[styles.feedIcon, { color: item.color }]}>{item.icon}</Text>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.feedLabel}>{item.label}</Text>
                  <Text style={styles.feedDetail}>{item.detail}</Text>
                </View>
                <Text style={[styles.feedWhen, { color: item.color }]}>
                  {formatTimeUntil(item.when)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Quick Start deities */}
        {deities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Quick Start Japa</Text>
            <View style={styles.quickStartGrid}>
              {deities.slice(0, 4).map(d => (
                <TouchableOpacity
                  key={d.id}
                  style={styles.deityCard}
                  onPress={() => {
                    setSelectedDeity(d);
                    navigation?.navigate('Japa');
                  }}
                >
                  <Text style={styles.deityCardIcon}>{d.icon}</Text>
                  <Text style={styles.deityCardName} numberOfLines={1}>
                    {d.name.split(' ').slice(-1)[0]}
                  </Text>
                  <Text style={styles.deityCardMalas}>{d.totalMalas} malas</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* Next Festival info */}
        {upcoming && (
          <View style={styles.upcomingFest}>
            <View style={styles.upcomingTopRow}>
              <Text style={{ fontSize: 32 }}>{upcoming.deityIcon}</Text>
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text style={styles.upcomingLabel}>NEXT FESTIVAL</Text>
                <Text style={styles.upcomingName}>{upcoming.name}</Text>
                <Text style={styles.upcomingDays}>
                  {(() => {
                    const dl = getDaysUntil(upcoming.date);
                    if (dl === 0) return '🎊 Today!';
                    if (dl === 1) return '⏰ Tomorrow';
                    if (dl <= 7) return `⚡ In ${dl} days`;
                    return `📅 In ${dl} days · ${formatShortDate(upcoming.date)}`;
                  })()}
                </Text>
              </View>
            </View>
            <Text style={styles.upcomingDeity}>{upcoming.deity}</Text>
            {upcoming.checklist.length > 0 && (
              <View style={styles.checklistPreview}>
                {upcoming.checklist.slice(0, 3).map(it => (
                  <View key={it.id} style={styles.checklistItem}>
                    <Text style={styles.checklistTag}>{it.tag}</Text>
                    <Text style={styles.checklistText}>{it.text}</Text>
                  </View>
                ))}
                {upcoming.checklist.length > 3 && (
                  <Text style={styles.checklistMore}>
                    +{upcoming.checklist.length - 3} more in Festivals tab
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  scroll: { paddingBottom: 80 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: 'center',
  },
  greeting: { fontSize: 26, color: COLORS.cream, fontWeight: '600', marginBottom: 4 },
  tagline: { fontSize: 13, color: COLORS.muted, marginBottom: 6 },
  date: { fontSize: 12, color: COLORS.gold, fontWeight: '500' },

  alarmBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.15)',
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alarmTitle: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  alarmDetail: { fontSize: 12, color: COLORS.saffron, marginTop: 2 },
  alarmDismiss: { paddingHorizontal: SPACING.sm },

  todayFestCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  todayFestName: { fontSize: 18, color: COLORS.cream, fontWeight: '700', marginTop: 4 },
  todayFestWish: { fontSize: 13, color: COLORS.gold, marginTop: 4, textAlign: 'center', fontStyle: 'italic' },

  nextJapaCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  nextJapaLabel: {
    fontSize: 10,
    color: COLORS.gold,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  nextJapaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  nextJapaName: { fontSize: 16, color: COLORS.cream, fontWeight: '600', flex: 1 },
  nextJapaWhen: { fontSize: 13, color: COLORS.saffron, fontWeight: '600' },
  nextJapaDetail: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  kpiCard: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  kpiCol: { flex: 1, alignItems: 'center' },
  kpiValue: { fontSize: 22, color: COLORS.gold, fontWeight: '700' },
  kpiLabel: {
    fontSize: 10,
    color: COLORS.muted,
    marginTop: 4,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  kpiDivider: { width: 1, backgroundColor: 'rgba(212, 160, 23, 0.2)', marginVertical: 6 },

  todayStrip: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.08)',
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    marginBottom: SPACING.md,
  },
  todayStripText: { fontSize: 12, color: COLORS.saffron, fontWeight: '500', textAlign: 'center' },

  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },

  deityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  deityRowIcon: { fontSize: 26 },
  deityRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  deityRowName: { flex: 1, fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  deityRowMalas: { fontSize: 12, color: COLORS.gold, fontWeight: '600' },
  deityBarTrack: {
    height: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  deityBarFill: { height: '100%', borderRadius: 3 },
  deityRowTime: { fontSize: 10, color: COLORS.muted, marginTop: 4 },

  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  feedIcon: { fontSize: 18 },
  feedLabel: { fontSize: 13, color: COLORS.cream, fontWeight: '500' },
  feedDetail: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  feedWhen: { fontSize: 11, fontWeight: '600', marginLeft: SPACING.sm },

  quickStartGrid: { flexDirection: 'row', gap: SPACING.sm },
  deityCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  deityCardIcon: { fontSize: 26, marginBottom: 4 },
  deityCardName: { fontSize: 12, color: COLORS.cream, fontWeight: '500' },
  deityCardMalas: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  upcomingFest: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  upcomingTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  upcomingLabel: { fontSize: 10, color: COLORS.muted, letterSpacing: 1.5, fontWeight: '600' },
  upcomingName: { fontSize: 16, color: COLORS.cream, fontWeight: '700', marginTop: 2 },
  upcomingDays: { fontSize: 12, color: COLORS.gold, marginTop: 2 },
  upcomingDeity: { fontSize: 12, color: COLORS.saffron, fontStyle: 'italic', marginBottom: SPACING.sm },
  checklistPreview: { gap: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center' },
  checklistTag: { fontSize: 14, marginRight: SPACING.sm },
  checklistText: { fontSize: 12, color: COLORS.cream },
  checklistMore: { fontSize: 11, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },
});
