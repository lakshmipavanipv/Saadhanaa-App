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
 TextInput as RNTextInput } from 'react-native';
import { PANCHANG_FESTIVALS, PanchangFestival } from '../festivalsData';
import { Storage } from '../storage';
import { getDaysUntil, formatShortDate } from '../utils';
import { COLORS, SPACING } from '../theme';
import { Calendar } from '../components/Calendar';
import { FamilyMembersCard } from '../components/FamilyMembersCard';
import { specialSadhanaRepo, SpecialSadhana, SpecialTrigger, isFestivalEntry } from '../services/specialSadhanaRepo';
import { getUserLocation, UserLocation } from '../services/location';
import { computeSunTimes, fmtHHMM, SunTimes } from '../services/sunTimes';
import { buildCalendar, CalendarItem } from '../services/calendarAggregator';
import { ReminderPicker, ReminderValue } from '../components/ReminderPicker';

type CheckedState = Record<string, boolean>;

type ReminderState = Record<string, {
  shopping: { enabled: boolean } & ReminderValue;
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
  const [checked, setChecked] = useState<CheckedState>({});
  const [reminders, setReminders] = useState<ReminderState>({});
  const [selected, setSelected] = useState<PanchangFestival | null>(null);
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  // Panchang top segment filter
  const [section, setSection] = useState<'tithi' | 'shradha' | 'festivals' | 'special'>('festivals');

  // ── Live data: user location, today's sunrise/sunset, merged calendar ──
  const [loc, setLoc] = useState<UserLocation | null>(null);
  const [sun, setSun] = useState<SunTimes | null>(null);
  const [calendar, setCalendar] = useState<CalendarItem[]>([]);

  useEffect(() => {
    Storage.get<CheckedState>('festChecked', {}).then(setChecked);
    Storage.get<ReminderState>('festReminders', {}).then(setReminders);
    (async () => {
      const l = await getUserLocation();
      setLoc(l);
      setSun(computeSunTimes(new Date(), l));
      try {
        const merged = await buildCalendar(l, 365);
        setCalendar(merged);
      } catch (e) { console.warn('[festival] calendar build failed:', e); }
    })();
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
        shopping: { enabled: false, date: '', time: '10:00', recurrence: 'once' as const },
        morning: { enabled: false, time: '06:00' },
        pooja: { enabled: false },
      };
      return { ...p, [festId]: { ...existing, ...updates } };
    });
  };

  // Convert tithi-shraddhas + eclipses into PanchangFestival-shaped
  // entries so they appear naturally in BOTH calendar and list views.
  const extraFestivals: PanchangFestival[] = React.useMemo(() => {
    const out: PanchangFestival[] = [];
    for (const item of calendar) {
      if (item.kind === 'festival') continue;   // already in PANCHANG_FESTIVALS

      if (item.kind === 'tithi-shraddha') {
        const m: any = item.payload;
        out.push({
          id: item.id,
          name: item.title,
          date: item.date,
          region: 'Hindu',
          deity: 'Pitru (ancestor)',
          deityIcon: '🕯️',
          tithi: m.lunarPaksha
            ? `${m.lunarPaksha} ${['Pratipada','Dwitiya','Tritiya','Chaturthi','Panchami','Shashthi','Saptami','Ashtami','Navami','Dashami','Ekadashi','Dwadashi','Trayodashi','Chaturdashi','Purnima/Amavasya'][(m.lunarTithiNumber || 1) - 1] || ''}`
            : '',
          paksha: m.lunarPaksha,
          vara: '',
          nakshatra: '',
          month: m.lunarMaas || '',
          significance: `Annual Tithi Shraddha for ${m.name} (${m.relation || ''}). Offer tarpana and pinda dana.`,
          whatToDo: [
            'Wake before sunrise, bathe, wear clean clothes',
            'Perform tarpana with sesame seeds + water',
            'Offer pinda dana facing south',
            'Feed Brahmins or donate food in their name',
            'Avoid arguments and travel — keep the day simple',
          ],
          timing: 'Madhyahnika (mid-day) is the traditional time',
          wish: `Remembering ${m.name} 🙏`,
          wishSub: 'May their soul rest in eternal peace',
          checklist: [
            { id: 1, text: 'Sesame seeds (til)', tag: '🌱' },
            { id: 2, text: 'Rice + barley', tag: '🍚' },
            { id: 3, text: 'Darbha grass', tag: '🌾' },
            { id: 4, text: 'Pure water', tag: '💧' },
            { id: 5, text: 'Cow ghee', tag: '🧈' },
          ],
        });
      }

      if (item.kind === 'eclipse') {
        const e: any = item.payload;
        const isLunar = e.type === 'lunar';
        out.push({
          id: item.id,
          name: item.title,
          date: item.date,
          region: 'Hindu',
          deity: isLunar ? 'Chandra (Moon)' : 'Surya (Sun)',
          deityIcon: isLunar ? '🌑' : '☀️',
          tithi: isLunar ? 'Purnima' : 'Amavasya',
          paksha: isLunar ? 'Shukla' : 'Krishna',
          vara: '',
          nakshatra: '',
          month: '',
          significance: e.visibleAtLocation
            ? 'Visible at your location. Sutak rules apply — abstain from food, cooking, and travel during the eclipse window.'
            : 'Not visible at your location. No sutak rules; standard observances optional.',
          whatToDo: e.visibleAtLocation ? [
            'Begin sutak ~12 hr before eclipse (lunar) / ~9 hr before (solar)',
            'Stop cooking and eating during the eclipse',
            'Bathe in cold water and chant your ishta mantra',
            'Donate after the eclipse ends (grain, clothes, sesame)',
            'Pregnant women: stay indoors, no sharp tools',
          ] : [
            'No sutak rules apply (not visible locally)',
            'Optionally chant Maha Mrityunjaya / Surya mantras',
            'Donate if you wish — multiplied effect during eclipses',
          ],
          timing: e.startTime && e.endTime
            ? `Eclipse window: ${e.startTime} – ${e.endTime}`
            : 'See Indian Ephemeris for exact timing',
          fromTime: e.startTime,
          toTime: e.endTime,
          wish: isLunar ? '🌑 Chandra Grahan today' : '☀️ Surya Grahan today',
          wishSub: 'Time for inner reflection and japa',
          checklist: [
            { id: 1, text: 'Pure water for bath', tag: '💧' },
            { id: 2, text: 'Tulsi leaves for food (post-eclipse)', tag: '🌿' },
            { id: 3, text: 'Darbha grass on stored food', tag: '🌾' },
          ],
        });
      }
    }
    return out;
  }, [calendar]);

  const filtered = React.useMemo(() => {
    const all = [
      ...PANCHANG_FESTIVALS.filter(f => f.region === 'Hindu'),
      ...extraFestivals,
    ];
    return all.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [extraFestivals]);

  const handleCalDate = (date: string, fests: PanchangFestival[]) => {
    if (fests.length > 0) setSelected(fests[0]);
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.title}>Panchang</Text>
          <Text style={styles.subtitle}>
            पञ्चाङ्ग · Hindu calendar · tithi · shradha · festivals · special sadhana
          </Text>
        </View>

        {/* ── Live sunrise / sunset for the user's location ── */}
        {sun && loc && (
          <View style={styles.sunCard}>
            <Text style={styles.sunCardLabel}>
              ☀️ Today · {loc.label || `${loc.lat.toFixed(2)}, ${loc.lng.toFixed(2)}`}
            </Text>
            <View style={styles.sunRow}>
              <SunStat icon="🌅" label="Sunrise"  time={fmtHHMM(sun.sunrise)} />
              <SunStat icon="🌞" label="Noon"     time={fmtHHMM(sun.solarNoon)} />
              <SunStat icon="🌇" label="Sunset"   time={fmtHHMM(sun.sunset)} />
            </View>
            <View style={styles.sunRow}>
              <SunStat icon="🌌" label="Brahma muhurta" time={fmtHHMM(sun.brahmaMuhurta)} compact />
              <SunStat icon="🪷" label="Pratah sandhya" time={`${fmtHHMM(sun.pratahSandhya.start)}–${fmtHHMM(sun.pratahSandhya.end)}`} compact />
              <SunStat icon="🕯️" label="Sayam sandhya"  time={`${fmtHHMM(sun.sayamSandhya.start)}–${fmtHHMM(sun.sayamSandhya.end)}`} compact />
            </View>
            <Text style={styles.sunHint}>
              Times computed locally from your device location · timezone {loc.tz}
            </Text>
          </View>
        )}

        {/* ── Top segmented filter — replaces flat festival list ── */}
        <View style={styles.segmentBar}>
          {([
            { id: 'tithi',     label: 'Tithi',     icon: '🌗' },
            { id: 'shradha',   label: 'Shradha',   icon: '🕯️' },
            { id: 'festivals', label: 'Festivals', icon: '🛕' },
            { id: 'special',   label: 'Special',   icon: '✨' },
          ] as const).map(s => (
            <TouchableOpacity
              key={s.id}
              style={[styles.segmentBtn, section === s.id && styles.segmentBtnActive]}
              onPress={() => setSection(s.id)}
            >
              <Text style={[styles.segmentLabel, section === s.id && styles.segmentLabelActive]}>
                {s.icon}  {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Shradha section ── */}
        {section === 'shradha' && (
          <>
            <FamilyMembersCard />
            <TimezoneNote />
          </>
        )}

        {/* ── Tithi section — upcoming Ekadashi / Pradosh / Purnima / Amavasya ── */}
        {section === 'tithi' && (() => {
          const KEY_TITHIS = ['Ekadashi','Pradosh','Purnima','Amavasya'];
          const upcoming = filtered.filter(f =>
            f.tithi && KEY_TITHIS.some(k => f.tithi!.includes(k))
          ).slice(0, 12);
          return (
            <View style={styles.tithiBox}>
              <Text style={styles.tithiHelper}>
                Key tithis — observe a fast / extra japa on these dates.
              </Text>
              {upcoming.length === 0 ? (
                <Text style={styles.emptyHint}>No upcoming key tithis loaded yet.</Text>
              ) : upcoming.map(t => (
                <TouchableOpacity
                  key={t.id}
                  style={styles.tithiRow}
                  onPress={() => setSelected(t)}
                >
                  <Text style={styles.tithiIcon}>🌗</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tithiName}>{t.name}</Text>
                    <Text style={styles.tithiSub}>{t.tithi}</Text>
                  </View>
                  <Text style={styles.tithiDate}>{formatShortDate(t.date)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          );
        })()}

        {/* ── Special Sadhana section — custom sadhanas tied to tithi/days/dates ── */}
        {section === 'special' && (
          <SpecialSadhanaBuilder />
        )}

        {/* ── Festivals section — original calendar/list ── */}
        {section === 'festivals' && (
        <>
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
        </>
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
              <View style={{ marginTop: SPACING.sm }}>
                <ReminderPicker
                  value={{
                    date: reminder.shopping.date,
                    time: reminder.shopping.time,
                    recurrence: reminder.shopping.recurrence || 'once',
                    endDate: reminder.shopping.endDate,
                  }}
                  onChange={v =>
                    onReminderChange({
                      shopping: { ...reminder.shopping, ...v },
                    })
                  }
                />
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
              <View style={{ marginTop: SPACING.sm }}>
                <ReminderPicker
                  value={{
                    date: fest.date,
                    time: reminder.morning.time,
                    recurrence: 'once',
                  }}
                  onChange={v =>
                    onReminderChange({
                      morning: { ...reminder.morning, time: v.time },
                    })
                  }
                />
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

const TimezoneNote: React.FC = () => {
  const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local';
  const localOffsetMin = -new Date().getTimezoneOffset(); // device offset
  const istOffsetMin = 330; // +5:30
  const diff = localOffsetMin - istOffsetMin;
  const diffHours = Math.abs(diff) / 60;
  const direction = diff === 0 ? 'same as' : diff > 0 ? 'ahead of' : 'behind';
  const sign = diff === 0 ? '' : diff > 0 ? '+' : '-';

  return (
    <View style={styles.tzNote}>
      <Text style={styles.tzNoteIcon}>📍</Text>
      <View style={{ flex: 1 }}>
        <Text style={styles.tzNoteTitle}>Dates follow Indian Panchang (IST)</Text>
        <Text style={styles.tzNoteBody}>
          {tzName} · {sign}{diffHours}h {direction} IST
          {diff !== 0 && '. Festival tithis are based on Indian astronomical time.'}
        </Text>
      </View>
    </View>
  );
};

const PanchangRow: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.panchangRow}>
    <Text style={styles.panchangRowLabel}>{label}</Text>
    <Text style={styles.panchangRowValue}>{value}</Text>
  </View>
);

// ── Small helper used by the new sunrise/sunset card ────────────
const SunStat: React.FC<{
  icon: string; label: string; time: string; compact?: boolean;
}> = ({ icon, label, time, compact }) => (
  <View style={{ flex: 1, alignItems: 'center' }}>
    <Text style={{ fontSize: compact ? 14 : 20 }}>{icon}</Text>
    <Text style={{ fontSize: compact ? 9 : 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 0.5, marginTop: 2, textAlign: 'center' }}>
      {label.toUpperCase()}
    </Text>
    <Text style={{ fontSize: compact ? 11 : 14, color: COLORS.cream, fontWeight: '600', marginTop: 2, textAlign: 'center' }}>
      {time}
    </Text>
  </View>
);

// ─── Special Sadhana Builder ─────────────────────────────────────
//
// Lets the user design a sadhana observed on a tithi (e.g. Ekadashi),
// specific weekdays, or fixed calendar dates. Saves to the
// specialSadhanaRepo.

const TITHI_OPTIONS = [
  'Ekadashi', 'Pradosh', 'Purnima', 'Amavasya',
  'Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashti',
  'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Dwadashi', 'Trayodashi', 'Chaturdashi',
];

const DAYS_LABEL = ['S','M','T','W','T','F','S'];

const SpecialSadhanaBuilder: React.FC = () => {
  const [items, setItems] = useState<SpecialSadhana[]>([]);
  const [creating, setCreating] = useState(false);
  // form state
  const [name, setName] = useState('');
  const [practice, setPractice] = useState('');
  const [duration, setDuration] = useState('30');
  const [time, setTime] = useState('');
  const [triggerKind, setTriggerKind] = useState<'tithi' | 'weekdays' | 'dates'>('tithi');
  const [tithi, setTithi] = useState('Ekadashi');
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [dates, setDates] = useState('');

  const refresh = async () => setItems((await specialSadhanaRepo.list()).filter(isFestivalEntry));
  useEffect(() => { refresh(); }, []);

  const reset = () => {
    setName(''); setPractice(''); setDuration('30'); setTime('');
    setTriggerKind('tithi'); setTithi('Ekadashi'); setWeekdays([]); setDates('');
  };

  const save = async () => {
    if (!name.trim()) return;
    let trigger: SpecialTrigger;
    if (triggerKind === 'tithi')       trigger = { kind: 'tithi', tithi };
    else if (triggerKind === 'weekdays') trigger = { kind: 'weekdays', days: weekdays.length > 0 ? weekdays : [1] };
    else trigger = { kind: 'dates', dates: dates.split(/[\s,]+/).filter(Boolean) };
    await specialSadhanaRepo.add({
      kind: 'festival',
      name: name.trim(),
      practice: practice.trim() || undefined,
      durationMin: parseInt(duration, 10) || undefined,
      time: time.trim() || undefined,
      trigger,
    });
    reset();
    setCreating(false);
    refresh();
  };

  const remove = async (id: string) => {
    await specialSadhanaRepo.remove(id);
    refresh();
  };

  const describeTrigger = (t: SpecialTrigger): string => {
    if (t.kind === 'tithi') return `Every ${t.tithi}`;
    if (t.kind === 'weekdays') return `Every ${t.days.map(d => DAYS_LABEL[d]).join('·')}`;
    return `On ${t.dates.slice(0, 3).join(', ')}${t.dates.length > 3 ? ` +${t.dates.length - 3}` : ''}`;
  };

  return (
    <View style={styles.specialBox}>
      <Text style={styles.specialIntro}>
        Special sadhanas observed on specific tithis, weekdays, or dates —
        e.g. &quot;Mahamrityunjaya on every Pradosh&quot; or &quot;108 names on Mondays&quot;.
      </Text>

      {/* List of saved special sadhanas */}
      {items.length > 0 && (
        <View style={{ marginBottom: SPACING.sm }}>
          {items.map(it => (
            <View key={it.id} style={styles.specialRow}>
              <Text style={styles.specialIcon}>✨</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.specialName}>{it.name}</Text>
                <Text style={styles.specialMeta}>
                  {describeTrigger(it.trigger)}
                  {it.practice && ` · ${it.practice}`}
                  {it.durationMin && ` · ${it.durationMin} min`}
                  {it.time && ` · ⏰ ${it.time}`}
                </Text>
              </View>
              <TouchableOpacity onPress={() => remove(it.id)}>
                <Text style={styles.specialDelete}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      {/* Add new */}
      {!creating ? (
        <TouchableOpacity style={styles.specialAddBtn} onPress={() => setCreating(true)}>
          <Text style={styles.specialAddText}>+ Add a special sadhana</Text>
        </TouchableOpacity>
      ) : (
        <View style={styles.specialForm}>
          <Text style={styles.specialFieldLabel}>Name</Text>
          <RNTextInput
            style={styles.specialInput}
            value={name}
            onChangeText={setName}
            placeholder='e.g. "Pradosh Shiva Sadhana"'
            placeholderTextColor={COLORS.muted}
          />
          <Text style={styles.specialFieldLabel}>Practice (deity / mantra / what to do)</Text>
          <RNTextInput
            style={styles.specialInput}
            value={practice}
            onChangeText={setPractice}
            placeholder='e.g. "Mahamrityunjaya 11 malas"'
            placeholderTextColor={COLORS.muted}
          />
          <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.specialFieldLabel}>Duration (min)</Text>
              <RNTextInput
                style={styles.specialInput}
                value={duration}
                onChangeText={setDuration}
                keyboardType="number-pad"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.specialFieldLabel}>Time (optional)</Text>
              <RNTextInput
                style={styles.specialInput}
                value={time}
                onChangeText={setTime}
                placeholder="HH:MM"
                placeholderTextColor={COLORS.muted}
              />
            </View>
          </View>

          <Text style={styles.specialFieldLabel}>When?</Text>
          <View style={styles.triggerRow}>
            {(['tithi','weekdays','dates'] as const).map(k => (
              <TouchableOpacity
                key={k}
                style={[styles.triggerChip, triggerKind === k && styles.triggerChipActive]}
                onPress={() => setTriggerKind(k)}
              >
                <Text style={[styles.triggerText, triggerKind === k && styles.triggerTextActive]}>
                  {k === 'tithi' ? '🌗 Tithi' : k === 'weekdays' ? '📅 Days' : '🗓 Dates'}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {triggerKind === 'tithi' && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: SPACING.sm }}>
              <View style={{ flexDirection: 'row', gap: 6, paddingHorizontal: 2 }}>
                {TITHI_OPTIONS.map(t => (
                  <TouchableOpacity
                    key={t}
                    style={[styles.tithiChip, tithi === t && styles.tithiChipActive]}
                    onPress={() => setTithi(t)}
                  >
                    <Text style={[styles.tithiChipText, tithi === t && styles.tithiChipTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          )}

          {triggerKind === 'weekdays' && (
            <View style={styles.weekdayRow}>
              {DAYS_LABEL.map((d, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.dayChip, weekdays.includes(i) && styles.dayChipActive]}
                  onPress={() =>
                    setWeekdays(p => p.includes(i) ? p.filter(x => x !== i) : [...p, i].sort())
                  }
                >
                  <Text style={[styles.dayChipText, weekdays.includes(i) && styles.dayChipTextActive]}>{d}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {triggerKind === 'dates' && (
            <RNTextInput
              style={styles.specialInput}
              value={dates}
              onChangeText={setDates}
              placeholder='YYYY-MM-DD list (comma or space separated)'
              placeholderTextColor={COLORS.muted}
            />
          )}

          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <TouchableOpacity style={styles.specialCancel} onPress={() => { setCreating(false); reset(); }}>
              <Text style={styles.specialCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.specialSave} onPress={save}>
              <Text style={styles.specialSaveText}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  // ── New sunrise/sunset hero card ──
  sunCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  sunCardLabel: { fontSize: 11, color: COLORS.gold, fontWeight: '700', letterSpacing: 0.5, marginBottom: SPACING.sm },
  sunRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  sunHint: { fontSize: 9, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', marginTop: 6 },

  // ── Upcoming calendar card ──
  upcomingCard: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  upcomingTitle: { fontSize: 12, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: SPACING.sm },
  upcomingRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  upcomingIcon: { fontSize: 22 },
  upcomingItemTitle: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  upcomingSub: { fontSize: 11, color: COLORS.muted, marginTop: 1 },
  upcomingDays: { fontSize: 13, color: COLORS.gold, fontWeight: '700' },
  upcomingDate: { fontSize: 10, color: COLORS.muted, marginTop: 1 },

  // ── (original styles below) ──
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingTop: SPACING.lg, paddingBottom: SPACING.xl },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600', marginBottom: 6 },
  subtitle: { fontSize: 12, color: COLORS.muted },
  tzNote: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderLeftWidth: 3,
    borderLeftColor: COLORS.saffron,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    borderRadius: 8,
    alignItems: 'center',
    gap: SPACING.sm,
  },
  tzNoteIcon: { fontSize: 18 },
  tzNoteTitle: { fontSize: 12, color: COLORS.saffron, fontWeight: '700' },
  tzNoteBody: { fontSize: 11, color: COLORS.muted, marginTop: 2, lineHeight: 15 },
  // Top segmented filter (Tithi / Shradha / Festivals / Special)
  segmentBar: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  segmentBtn: {
    flex: 1, minWidth: 78,
    paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
    alignItems: 'center',
  },
  segmentBtnActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  segmentLabel: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  segmentLabelActive: { color: COLORS.gold },

  // Tithi list
  tithiBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  tithiHelper: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', marginBottom: SPACING.sm },
  emptyHint: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', textAlign: 'center', paddingVertical: SPACING.md },
  tithiRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  tithiIcon: { fontSize: 22, marginRight: 10, width: 30 },
  tithiName: { color: COLORS.cream, fontSize: 13, fontWeight: '700' },
  tithiSub: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  tithiDate: { color: COLORS.gold, fontSize: 12, fontWeight: '700' },

  // Special Sadhana builder
  specialBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  specialIntro: { fontSize: 12, color: COLORS.cream, lineHeight: 17, marginBottom: SPACING.sm, fontStyle: 'italic' },
  specialRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  specialIcon: { fontSize: 20, marginRight: 10, width: 28 },
  specialName: { color: COLORS.cream, fontSize: 13, fontWeight: '700' },
  specialMeta: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  specialDelete: { color: COLORS.error, fontSize: 14, paddingHorizontal: 8 },
  specialAddBtn: {
    paddingVertical: 12, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderStyle: 'dashed', borderColor: COLORS.gold,
    backgroundColor: 'rgba(212,160,23,0.06)',
  },
  specialAddText: { color: COLORS.gold, fontWeight: '700', fontSize: 13 },
  specialForm: { marginTop: 4 },
  specialFieldLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 4 },
  specialInput: {
    backgroundColor: COLORS.deep, borderRadius: 10, padding: SPACING.sm,
    color: COLORS.cream, fontSize: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  triggerRow: { flexDirection: 'row', gap: 6, marginBottom: SPACING.sm },
  triggerChip: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.deep,
    alignItems: 'center',
  },
  triggerChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  triggerText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  triggerTextActive: { color: COLORS.gold },
  tithiChip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.deep,
  },
  tithiChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  tithiChipText: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },
  tithiChipTextActive: { color: COLORS.gold },
  weekdayRow: { flexDirection: 'row', gap: 4, marginBottom: SPACING.sm },
  dayChip: {
    width: 36, height: 36, borderRadius: 18,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.deep,
  },
  dayChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  dayChipText: { color: COLORS.muted, fontSize: 12, fontWeight: '700' },
  dayChipTextActive: { color: COLORS.gold },
  specialCancel: {
    flex: 1, paddingVertical: 10, borderRadius: 10,
    borderWidth: 1, borderColor: COLORS.border, alignItems: 'center',
  },
  specialCancelText: { color: COLORS.cream, fontWeight: '600', fontSize: 13 },
  specialSave: {
    flex: 2, paddingVertical: 10, borderRadius: 10,
    backgroundColor: COLORS.gold, alignItems: 'center',
  },
  specialSaveText: { color: COLORS.deep, fontWeight: '700', fontSize: 13 },

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
