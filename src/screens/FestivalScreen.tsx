import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Modal,
  Switch,
  TextInput,
} from 'react-native';
import { PANCHANG_FESTIVALS, REGIONS, PanchangFestival } from '../festivalsData';
import { Storage } from '../storage';
import { getDaysUntil, formatShortDate } from '../utils';
import { COLORS, SPACING } from '../theme';
import { Calendar } from '../components/Calendar';

type CheckedState = Record<string, boolean>;
type ReminderState = Record<string, {
  shopping: { enabled: boolean; date: string; time: string };
  morning: { enabled: boolean; time: string };
  pooja: { enabled: boolean };
}>;

const previousSundayBefore = (dateStr: string): string => {
  const [y, m, dd] = dateStr.split('-').map(Number);
  const d = new Date(y, m - 1, dd);
  while (d.getDay() !== 0) d.setDate(d.getDate() - 1);
  d.setDate(d.getDate() - 7);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const FestivalScreen = () => {
  const [region, setRegion] = useState<(typeof REGIONS)[number]>('All');
  const [checked, setChecked] = useState<CheckedState>({});
  const [reminders, setReminders] = useState<ReminderState>({});
  const [selected, setSelected] = useState<PanchangFestival | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');

  useEffect(() => {
    Storage.get<CheckedState>('festChecked', {}).then(setChecked);
    Storage.get<ReminderState>('festReminders', {}).then(setReminders);
  }, []);

  useEffect(() => {
    Storage.set('festChecked', checked);
  }, [checked]);

  useEffect(() => {
    Storage.set('festReminders', reminders);
  }, [reminders]);

  const toggle = (festId: string, itemId: number) => {
    const key = `${festId}-${itemId}`;
    setChecked(p => ({ ...p, [key]: !p[key] }));
  };

  const updateReminder = (festId: string, updates: Partial<ReminderState[string]>) => {
    setReminders(p => {
      const existing = p[festId] || {
        shopping: { enabled: false, date: '', time: '10:00' },
        morning: { enabled: false, time: '06:00' },
        pooja: { enabled: false },
      };
      return { ...p, [festId]: { ...existing, ...updates } };
    });
  };

  const filtered = PANCHANG_FESTIVALS
    .filter(f => region === 'All' || f.region === region)
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  const handleCalDate = (date: string, fests: PanchangFestival[]) => {
    if (fests.length > 0) setSelected(fests[0]);
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Festival Calendar</Text>
          <Text style={styles.subtitle}>Tap any date to view festival details</Text>
        </View>

        {/* View Toggle */}
        <View style={styles.viewToggle}>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'calendar' && styles.toggleBtnActive]}
            onPress={() => setView('calendar')}
          >
            <Text style={[styles.toggleText, view === 'calendar' && styles.toggleTextActive]}>
              📅 Calendar
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleBtn, view === 'list' && styles.toggleBtnActive]}
            onPress={() => setView('list')}
          >
            <Text style={[styles.toggleText, view === 'list' && styles.toggleTextActive]}>
              📋 List
            </Text>
          </TouchableOpacity>
        </View>

        {/* Region filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabsRow}>
          {REGIONS.map(r => (
            <TouchableOpacity
              key={r}
              style={[styles.tab, region === r && styles.tabActive]}
              onPress={() => setRegion(r)}
            >
              <Text style={[styles.tabText, region === r && styles.tabTextActive]}>{r}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {view === 'calendar' ? (
          <Calendar festivals={filtered} onDatePress={handleCalDate} />
        ) : (
          <View style={{ paddingHorizontal: SPACING.md }}>
            {filtered.map(fest => {
              const dl = getDaysUntil(fest.date);
              return (
                <TouchableOpacity
                  key={fest.id}
                  style={styles.listCard}
                  onPress={() => setSelected(fest)}
                >
                  <View style={styles.listIcon}>
                    <Text style={{ fontSize: 26 }}>{fest.deityIcon}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.listName}>{fest.name}</Text>
                    <Text style={styles.listDeity}>{fest.deity}</Text>
                    <Text style={styles.listDate}>{formatShortDate(fest.date)}</Text>
                  </View>
                  <Text
                    style={[
                      styles.listCount,
                      dl < 0 && { color: COLORS.muted },
                      dl >= 0 && dl <= 7 && { color: COLORS.saffron },
                    ]}
                  >
                    {dl < 0 ? '✓' : dl === 0 ? 'Today' : `${dl}d`}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

      <Modal visible={!!selected} animationType="slide" onRequestClose={() => setSelected(null)}>
        {selected && (
          <FestivalDetail
            fest={selected}
            checked={checked}
            onToggle={toggle}
            reminder={
              reminders[selected.id] || {
                shopping: {
                  enabled: false,
                  date: previousSundayBefore(selected.date),
                  time: '10:00',
                },
                morning: { enabled: false, time: '06:00' },
                pooja: { enabled: false },
              }
            }
            onReminderChange={updates => updateReminder(selected.id, updates)}
            onClose={() => setSelected(null)}
          />
        )}
      </Modal>
    </View>
  );
};

const FestivalDetail: React.FC<{
  fest: PanchangFestival;
  checked: CheckedState;
  onToggle: (festId: string, itemId: number) => void;
  reminder: ReminderState[string];
  onReminderChange: (updates: Partial<ReminderState[string]>) => void;
  onClose: () => void;
}> = ({ fest, checked, onToggle, reminder, onReminderChange, onClose }) => {
  const [_y, _m, _d] = fest.date.split('-').map(Number);
  const date = new Date(_y, _m - 1, _d);
  const bigDay = date.getDate();
  const monthShort = date.toLocaleDateString('en', { month: 'short' });
  const year = date.getFullYear();
  const dayOfWeek = date.toLocaleDateString('en', { weekday: 'long' });
  const done = fest.checklist.filter(x => checked[`${fest.id}-${x.id}`]).length;

  return (
    <View style={styles.detailContainer}>
      <ScrollView contentContainerStyle={styles.detailContent}>
        {/* Hero with big date */}
        <View style={styles.detailHero}>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.detailIcon}>{fest.deityIcon}</Text>

          <View style={styles.bigDateBlock}>
            <Text style={styles.bigDay}>{bigDay}</Text>
            <View>
              <Text style={styles.bigMonth}>{monthShort.toUpperCase()}</Text>
              <Text style={styles.bigYear}>{year}</Text>
            </View>
          </View>
          <Text style={styles.bigWeekday}>{dayOfWeek}</Text>

          <Text style={styles.detailName}>{fest.name}</Text>
          <Text style={styles.detailDeity}>{fest.deity}</Text>
        </View>

        {/* Festival Timing */}
        {(fest.fromTime || fest.toTime) && (
          <View style={styles.timeCard}>
            <Text style={styles.timeCardTitle}>⏰ Festival Timing</Text>
            <View style={styles.timeFromTo}>
              <View style={styles.timeBox}>
                <Text style={styles.timeBoxLabel}>FROM</Text>
                <Text style={styles.timeBoxValue}>{fest.fromTime || 'Sunrise'}</Text>
              </View>
              <Text style={styles.timeArrow}>→</Text>
              <View style={styles.timeBox}>
                <Text style={styles.timeBoxLabel}>TO</Text>
                <Text style={styles.timeBoxValue}>{fest.toTime || 'Sunset'}</Text>
              </View>
            </View>
          </View>
        )}

        {/* Pooja Timings */}
        {fest.poojaTimings && fest.poojaTimings.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Auspicious Pooja Muhurat</Text>
            {fest.poojaTimings.map((p, i) => (
              <View key={i} style={styles.poojaRow}>
                <Text style={styles.poojaLabel}>🕉️ {p.label}</Text>
                <Text style={styles.poojaTime}>{p.from} – {p.to}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Vrata Info */}
        {fest.vrataInfo && (
          <View style={styles.vrataCard}>
            <Text style={styles.vrataTitle}>🪔 Vrat / Fast Info</Text>
            <Text style={styles.vrataText}>{fest.vrataInfo}</Text>
          </View>
        )}

        {/* Panchang */}
        <View style={styles.panchangCard}>
          <Text style={styles.panchangTitle}>PANCHANG</Text>
          <PanchangRow label="Tithi" value={fest.tithi} />
          {fest.paksha && <PanchangRow label="Paksha" value={fest.paksha} />}
          <PanchangRow label="Vara" value={fest.vara} />
          <PanchangRow label="Nakshatra" value={fest.nakshatra} />
          <PanchangRow label="Maas" value={fest.month} />
        </View>

        {/* Significance */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Significance</Text>
          <Text style={styles.bodyText}>{fest.significance}</Text>
        </View>

        {/* What to do */}
        {fest.whatToDo.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>What to Do</Text>
            {fest.whatToDo.map((task, i) => (
              <View key={i} style={styles.taskRow}>
                <View style={styles.taskBullet}>
                  <Text style={styles.taskBulletText}>{i + 1}</Text>
                </View>
                <Text style={styles.taskText}>{task}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Reminders */}
        <View style={styles.remindersSection}>
          <Text style={styles.sectionTitle}>🔔 Reminders</Text>

          {/* Shopping reminder */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <Text style={styles.reminderIcon}>🛒</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Shopping Reminder</Text>
                <Text style={styles.reminderHint}>Buy checklist items</Text>
              </View>
              <Switch
                value={reminder.shopping.enabled}
                onValueChange={v =>
                  onReminderChange({
                    shopping: { ...reminder.shopping, enabled: v },
                  })
                }
                trackColor={{ false: COLORS.border, true: COLORS.gold }}
                thumbColor={reminder.shopping.enabled ? COLORS.cream : COLORS.muted}
              />
            </View>
            {reminder.shopping.enabled && (
              <View style={styles.reminderInputs}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inputLabel}>Date</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={reminder.shopping.date}
                    onChangeText={t =>
                      onReminderChange({
                        shopping: { ...reminder.shopping, date: t },
                      })
                    }
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
                <View style={{ width: 90 }}>
                  <Text style={styles.inputLabel}>Time</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={reminder.shopping.time}
                    onChangeText={t =>
                      onReminderChange({
                        shopping: { ...reminder.shopping, time: t },
                      })
                    }
                    placeholder="HH:MM"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Morning reminder */}
          <View style={styles.reminderCard}>
            <View style={styles.reminderHeader}>
              <Text style={styles.reminderIcon}>🌅</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.reminderTitle}>Festival Morning</Text>
                <Text style={styles.reminderHint}>On {fest.date}</Text>
              </View>
              <Switch
                value={reminder.morning.enabled}
                onValueChange={v =>
                  onReminderChange({
                    morning: { ...reminder.morning, enabled: v },
                  })
                }
                trackColor={{ false: COLORS.border, true: COLORS.gold }}
                thumbColor={reminder.morning.enabled ? COLORS.cream : COLORS.muted}
              />
            </View>
            {reminder.morning.enabled && (
              <View style={styles.reminderInputs}>
                <View style={{ width: 110 }}>
                  <Text style={styles.inputLabel}>Time</Text>
                  <TextInput
                    style={styles.timeInput}
                    value={reminder.morning.time}
                    onChangeText={t =>
                      onReminderChange({
                        morning: { ...reminder.morning, time: t },
                      })
                    }
                    placeholder="HH:MM"
                    placeholderTextColor={COLORS.muted}
                  />
                </View>
              </View>
            )}
          </View>

          {/* Pooja muhurat reminder */}
          {fest.poojaTimings && fest.poojaTimings.length > 0 && (
            <View style={styles.reminderCard}>
              <View style={styles.reminderHeader}>
                <Text style={styles.reminderIcon}>🕉️</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.reminderTitle}>Pooja Time</Text>
                  <Text style={styles.reminderHint}>
                    {fest.poojaTimings[0].from} – {fest.poojaTimings[0].to}
                  </Text>
                </View>
                <Switch
                  value={reminder.pooja.enabled}
                  onValueChange={v =>
                    onReminderChange({
                      pooja: { enabled: v },
                    })
                  }
                  trackColor={{ false: COLORS.border, true: COLORS.gold }}
                  thumbColor={reminder.pooja.enabled ? COLORS.cream : COLORS.muted}
                />
              </View>
            </View>
          )}

          <Text style={styles.reminderNote}>
            Note: System notifications need to be enabled in app settings.
          </Text>
        </View>

        {/* Checklist */}
        {fest.checklist.length > 0 && (
          <View style={styles.section}>
            <View style={styles.checklistHeader}>
              <Text style={styles.sectionTitle}>Shopping Checklist</Text>
              <Text style={styles.progressText}>
                {done}/{fest.checklist.length}
              </Text>
            </View>
            {fest.checklist.map(item => {
              const key = `${fest.id}-${item.id}`;
              const isChecked = !!checked[key];
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.checkRow}
                  onPress={() => onToggle(fest.id, item.id)}
                >
                  <View style={[styles.checkbox, isChecked && styles.checkboxChecked]}>
                    {isChecked && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={[styles.checkText, isChecked && styles.checkTextDone]}>
                    {item.text}
                  </Text>
                  <Text style={styles.checkTag}>{item.tag}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {/* Wish */}
        <View style={styles.wishCard}>
          <Text style={styles.wishMain}>{fest.wish}</Text>
          <Text style={styles.wishSub}>{fest.wishSub}</Text>
        </View>
      </ScrollView>
    </View>
  );
};

const PanchangRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.panchangRow}>
    <Text style={styles.panchangRowLabel}>{label}</Text>
    <Text style={styles.panchangRowValue}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600', marginBottom: 6 },
  subtitle: { fontSize: 12, color: COLORS.muted },
  viewToggle: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
    marginBottom: SPACING.md,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: SPACING.sm,
    borderRadius: 8,
    backgroundColor: COLORS.cardBg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  toggleBtnActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  toggleText: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  toggleTextActive: { color: COLORS.deep, fontWeight: '600' },
  tabsRow: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    flexGrow: 0,
  },
  tab: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 20,
    backgroundColor: COLORS.cardBg,
    marginRight: SPACING.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  tabActive: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  tabText: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  tabTextActive: { color: COLORS.deep, fontWeight: '600' },

  listCard: {
    flexDirection: 'row',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
    alignItems: 'center',
  },
  listIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  listName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  listDeity: { fontSize: 11, color: COLORS.gold, marginTop: 2 },
  listDate: { fontSize: 11, color: COLORS.muted, marginTop: 4 },
  listCount: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '600',
    minWidth: 40,
    textAlign: 'right',
  },

  detailContainer: { flex: 1, backgroundColor: COLORS.deep },
  detailContent: { paddingBottom: SPACING.xl },
  detailHero: {
    backgroundColor: COLORS.cardBg,
    paddingTop: 48,
    paddingBottom: SPACING.lg,
    paddingHorizontal: SPACING.md,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 160, 23, 0.2)',
  },
  closeBtn: {
    position: 'absolute',
    top: 48,
    right: SPACING.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: { color: COLORS.cream, fontSize: 16 },
  detailIcon: { fontSize: 64, marginBottom: SPACING.md },
  bigDateBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    marginBottom: 4,
  },
  bigDay: {
    fontSize: 64,
    color: COLORS.gold,
    fontWeight: '700',
    lineHeight: 64,
  },
  bigMonth: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '700',
    letterSpacing: 2,
  },
  bigYear: { fontSize: 14, color: COLORS.muted, marginTop: 2 },
  bigWeekday: {
    fontSize: 13,
    color: COLORS.saffron,
    marginBottom: SPACING.md,
    letterSpacing: 1,
  },
  detailName: {
    fontSize: 20,
    color: COLORS.cream,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 4,
  },
  detailDeity: { fontSize: 13, color: COLORS.gold },

  timeCard: {
    margin: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
  },
  timeCardTitle: {
    fontSize: 12,
    color: COLORS.saffron,
    fontWeight: '700',
    marginBottom: SPACING.sm,
    letterSpacing: 1,
  },
  timeFromTo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  timeBox: { flex: 1, alignItems: 'center' },
  timeBoxLabel: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 1,
    marginBottom: 4,
  },
  timeBoxValue: {
    fontSize: 16,
    color: COLORS.cream,
    fontWeight: '700',
  },
  timeArrow: { color: COLORS.saffron, fontSize: 22, marginHorizontal: SPACING.md },

  section: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  sectionTitle: {
    fontSize: 13,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },
  bodyText: { fontSize: 13, color: COLORS.cream, lineHeight: 20 },
  poojaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(212, 160, 23, 0.1)',
    padding: SPACING.sm,
    borderRadius: 8,
    marginBottom: 6,
  },
  poojaLabel: { fontSize: 13, color: COLORS.cream, flex: 1 },
  poojaTime: { fontSize: 13, color: COLORS.gold, fontWeight: '600' },
  vrataCard: {
    margin: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 10,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.leaf,
  },
  vrataTitle: { fontSize: 12, color: COLORS.leaf, fontWeight: '700', marginBottom: 4 },
  vrataText: { fontSize: 13, color: COLORS.cream, lineHeight: 19 },

  panchangCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  panchangTitle: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: SPACING.sm,
  },
  panchangRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  panchangRowLabel: { fontSize: 12, color: COLORS.muted },
  panchangRowValue: { fontSize: 13, color: COLORS.cream, fontWeight: '500' },

  taskRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.sm },
  taskBullet: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(212, 160, 23, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.sm,
    marginTop: 1,
  },
  taskBulletText: { fontSize: 11, color: COLORS.gold, fontWeight: '700' },
  taskText: { flex: 1, fontSize: 13, color: COLORS.cream, lineHeight: 20 },

  remindersSection: { paddingHorizontal: SPACING.md, marginBottom: SPACING.lg },
  reminderCard: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  reminderHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  reminderIcon: { fontSize: 24 },
  reminderTitle: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  reminderHint: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  reminderInputs: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.04)',
  },
  inputLabel: { fontSize: 10, color: COLORS.muted, marginBottom: 4, letterSpacing: 1 },
  timeInput: {
    backgroundColor: COLORS.deep,
    borderRadius: 6,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 8,
    color: COLORS.cream,
    fontSize: 13,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  reminderNote: {
    fontSize: 10,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginTop: SPACING.sm,
    textAlign: 'center',
  },

  checklistHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  progressText: { fontSize: 12, color: COLORS.leaf },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: COLORS.gold,
    marginRight: SPACING.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: { backgroundColor: COLORS.gold },
  checkmark: { color: COLORS.deep, fontSize: 12, fontWeight: 'bold' },
  checkText: { flex: 1, fontSize: 13, color: COLORS.cream },
  checkTextDone: { color: COLORS.muted, textDecorationLine: 'line-through' },
  checkTag: { fontSize: 16, marginLeft: SPACING.sm },

  wishCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  wishMain: {
    fontSize: 14,
    color: COLORS.cream,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 4,
  },
  wishSub: { fontSize: 12, color: COLORS.gold },
});
