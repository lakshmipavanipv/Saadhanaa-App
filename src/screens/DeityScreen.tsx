import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Modal,
  TextInput,
  FlatList,
  Switch,
 Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useSadhana } from '../context';
import { COLORS, SPACING } from '../theme';
import { Deity } from '../types';
import { DeityCatalogPicker } from '../components/DeityCatalogPicker';
import { CatalogDeity, ALL_CATALOG_DEITIES } from '../deityCatalog';
import { AlarmSoundPicker } from '../components/AlarmSoundPicker';
import { DeityIcon } from '../components/DeityIcon';
import { rescheduleDeityReminders } from '../services/notifications';

export const DeityScreen = ({ navigation, route }: any) => {
  const { deities, setDeities, setSelectedDeity, showToast, notifGranted, requestNotif } = useSadhana();
  const [showAdd, setShowAdd] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Deity | null>(null);
  // ── T4: two-step selection — pending state held until "Add Deity" tapped
  const [pendingPicked, setPendingPicked] = useState<Set<string>>(new Set());
  const [pendingCustoms, setPendingCustoms] = useState<Deity[]>([]);
  // ── T6: separate modal for "+ Other Deity" custom entry
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customNameInput, setCustomNameInput] = useState('');
  const [customMantraInput, setCustomMantraInput] = useState('');
  // ── T5: origin tracking for Japa loop
  const originRef = React.useRef<string | undefined>(undefined);

  // Auto-open add modal when navigated with openAdd param (from Japa tab)
  React.useEffect(() => {
    if (route?.params?.openAdd) {
      originRef.current = route.params.origin;
      openAddModal();
      // clear param so it doesn't re-trigger
      navigation?.setParams?.({ openAdd: undefined, origin: undefined });
    }
  }, [route?.params?.openAdd]);

  const openAddModal = () => {
    setPendingPicked(new Set(deities.map(d => d.id)));
    setPendingCustoms([]);
    setShowAdd(true);
  };

  const commitSelection = () => {
    // Build new deities list from pending selection
    const fromCatalog: Deity[] = ALL_CATALOG_DEITIES
      .filter(c => pendingPicked.has(c.id))
      .map(c => {
        const existing = deities.find(d => d.id === c.id);
        if (existing) return existing;
        return {
          id: c.id,
          name: c.name,
          icon: c.icon,
          mantra: c.mantra,
          prayerAlarm: '06:00',
          alarmOn: false,
          totalMalas: 0,
          malaMaterial: c.malaMaterial,
          malaColor: c.malaColor,
          malaHighlight: c.malaHighlight,
        };
      });
    const fromCustom = pendingCustoms.filter(c => pendingPicked.has(c.id));
    // Keep any locally-edited deities that aren't in the catalog (custom-id'd ones)
    const keptCustom = deities.filter(
      d => !ALL_CATALOG_DEITIES.some(c => c.id === d.id) && pendingPicked.has(d.id)
    );
    const finalDeities = [...fromCatalog, ...keptCustom, ...fromCustom];

    setDeities(finalDeities);
    setShowAdd(false);

    // Show toast
    const added = finalDeities.length - deities.length;
    if (added > 0) showToast(`${added} deit${added === 1 ? 'y' : 'ies'} added`);

    // T5: route back to Japa tab if origin was Japa, with newest deity selected
    const justAdded =
      finalDeities.find(d => !deities.some(old => old.id === d.id)) ||
      finalDeities[0];
    if (originRef.current === 'japa' && justAdded) {
      setSelectedDeity(justAdded);
      navigation?.navigate?.('Japa');
      originRef.current = undefined;
    }
  };

  const togglePending = (catalogDeity: CatalogDeity) => {
    setPendingPicked(prev => {
      const next = new Set(prev);
      next.has(catalogDeity.id) ? next.delete(catalogDeity.id) : next.add(catalogDeity.id);
      return next;
    });
  };

  const saveCustomDeity = () => {
    if (!customNameInput.trim()) {
      showToast('Enter a deity name first');
      return;
    }
    const d: Deity = {
      id: `custom-${Date.now()}`,
      name: customNameInput.trim(),
      icon: '🙏',
      mantra: customMantraInput.trim() || 'Om Namah',
      prayerAlarm: '06:00',
      alarmOn: false,
      totalMalas: 0,
    };
    setPendingCustoms(prev => [...prev, d]);
    setPendingPicked(prev => new Set(prev).add(d.id));
    setCustomNameInput('');
    setCustomMantraInput('');
    setShowCustomModal(false);
    showToast(`Added ${d.name} to selection`);
  };

  const updateReminder = async (id: string, patch: Partial<Deity>) => {
    // 1. Optimistically apply the local patch so the UI updates instantly
    const updated = deities.find(d => d.id === id);
    if (!updated) { setEditingReminder(null); return; }
    const next: Deity = { ...updated, ...patch };

    // 2. Schedule / cancel actual OS notifications. Uses device-local
    //    timezone via expo-notifications WEEKLY triggers.
    let notifPatch: Partial<Deity> = {};
    try {
      notifPatch = await rescheduleDeityReminders(next);
    } catch (e) {
      console.warn('[reminder] schedule failed:', e);
    }

    // 3. Persist the merged result (patch + notification ids)
    setDeities(p =>
      p.map(d => (d.id === id ? { ...d, ...patch, ...notifPatch } : d))
    );

    const days = next.repeatDays?.length ?? 7;
    if (next.alarmOn) {
      showToast(`⏰ Reminder set for ${next.prayerAlarm} (${days === 7 ? 'every day' : days + ' days/wk'})`);
    } else {
      showToast('🔕 Reminder turned off');
    }
    setEditingReminder(null);
  };

  const remove = (id: string) => {
    setDeities(p => p.filter(d => d.id !== id));
  };

  // ── v46: inline-everything layout ────────────────────────────────
  //
  // The screen used to bury the catalog + custom add behind two nested
  // modals.  Older sadhakas couldn't find their way back.  Now ONE
  // scrollable view shows: list of added deities → catalog grid →
  // inline custom-add form.  Toggling a catalog item adds/removes it
  // from the user's sadhana INSTANTLY (no Save/Commit button).
  const togglePickedInstant = (cat: CatalogDeity) => {
    const already = deities.some(d => d.id === cat.id);
    if (already) {
      setDeities(prev => prev.filter(d => d.id !== cat.id));
    } else {
      const newDeity: Deity = {
        id:    cat.id,
        name:  cat.name,
        icon:  cat.icon,
        mantra: cat.mantra,
        prayerAlarm: '06:00',
        alarmOn: false,
        totalMalas: 0,
        malaMaterial:  cat.malaMaterial,
        malaColor:     cat.malaColor,
        malaHighlight: cat.malaHighlight,
      };
      setDeities(prev => [...prev, newDeity]);
      showToast(`✓ ${cat.name} added`);
    }
  };

  const saveCustomInline = () => {
    if (!customNameInput.trim()) {
      showToast('Enter a deity name first');
      return;
    }
    const d: Deity = {
      id: `custom-${Date.now()}`,
      name: customNameInput.trim(),
      icon: '🙏',
      mantra: customMantraInput.trim() || 'Om Namah',
      prayerAlarm: '06:00',
      alarmOn: false,
      totalMalas: 0,
    };
    setDeities(prev => [...prev, d]);
    setCustomNameInput('');
    setCustomMantraInput('');
    showToast(`✓ ${d.name} added`);
  };

  // pickedIds drives the catalog grid's checkmark state — every entry
  // in the user's `deities` shows as picked, so they see what they own
  // at a glance.
  const pickedIds = React.useMemo(
    () => new Set(deities.map(d => d.id)),
    [deities]
  );

  return (
    <View style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingBottom: 80 }]}
      >
        {/* Notification banner */}
        {!notifGranted && (
          <View style={styles.notifBanner}>
            <Text style={{ fontSize: 24 }}>🔔</Text>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.notifTitle}>Enable prayer alarm notifications</Text>
              <Text style={styles.notifSubtitle}>Get reminded at your set prayer times daily</Text>
            </View>
            <TouchableOpacity onPress={requestNotif} style={styles.notifBtn}>
              <Text style={styles.notifBtnText}>Enable</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 1. YOUR SADHANA · current deities list ─────────────── */}
        <Text style={styles.sectionLabel}>
          YOUR SADHANA · {deities.length} {deities.length === 1 ? 'DEITY' : 'DEITIES'}
        </Text>
        {deities.length === 0 ? (
          <View style={styles.emptyHint}>
            <Text style={styles.emptyHintText}>
              No deities yet. Tap a god below to add it to your sadhana, or type your
              own name + mantra at the bottom of this screen.
            </Text>
          </View>
        ) : (
          deities.map(d => {
            const target = d.targetMalas || 0;
            const todayPct = target > 0 ? Math.min(100, (d.totalMalas / target) * 100) : 0;
            return (
              <View key={d.id} style={styles.deityItem}>
                <View style={styles.deityIconWrap}>
                  <DeityIcon deityId={d.id} icon={d.icon} size={28} color={COLORS.gold} />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.deityName}>{d.name}</Text>
                  <Text style={styles.deityMantra}>{d.mantra}</Text>
                  {target > 0 && (
                    <View style={styles.targetRow}>
                      <View style={styles.targetTrack}>
                        <View style={[styles.targetFill, { width: `${todayPct}%` }]} />
                      </View>
                      <Text style={styles.targetText}>{d.totalMalas}/{target}</Text>
                    </View>
                  )}
                  <TouchableOpacity onPress={() => setEditingReminder(d)} style={styles.alarmPill}>
                    <Text style={styles.alarmStatus}>
                      {d.alarmOn ? '⏰' : '🔕'} {d.prayerAlarm} · Tap to edit
                    </Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.deityStats}>
                  <Text style={styles.totalMalas}>{d.totalMalas}</Text>
                  <Text style={styles.totalMalasLabel}>malas</Text>
                  <TouchableOpacity onPress={() => remove(d.id)}>
                    <Text style={styles.deleteBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          })
        )}

        {/* ── 2. ADD MORE · the full catalog, inline ──────────────── */}
        <Text style={styles.sectionLabel}>ADD MORE · TAP TO TOGGLE</Text>
        <DeityCatalogPicker
          pickedIds={pickedIds}
          onTogglePick={togglePickedInstant}
          showCustom={false}
        />

        {/* ── 3. ADD YOUR OWN · inline 2-field form ───────────────── */}
        <Text style={styles.sectionLabel}>ADD YOUR OWN</Text>
        <Text style={styles.customHint}>
          Family ishta devata, regional form, or any mantra not in the catalog above.
        </Text>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Deity Name</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Sri Banke Bihari"
            placeholderTextColor={COLORS.muted}
            value={customNameInput}
            onChangeText={setCustomNameInput}
          />
        </View>
        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Maha-Mantra</Text>
          <TextInput
            style={styles.input}
            placeholder="e.g. Om Namo Bhagavate Vasudevaaya"
            placeholderTextColor={COLORS.muted}
            value={customMantraInput}
            onChangeText={setCustomMantraInput}
          />
        </View>
        <TouchableOpacity style={styles.submitBtn} onPress={saveCustomInline}>
          <Text style={styles.submitBtnText}>+ Add to my sadhana</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Edit Reminder Modal */}
      {editingReminder && (
        <ReminderEditor
          deity={editingReminder}
          onSave={patch => updateReminder(editingReminder.id, patch)}
          onClose={() => setEditingReminder(null)}
        />
      )}
    </View>
  );
};

// ─── Day-of-week constants (Sun..Sat per JS Date convention) ────────
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const WEEKDAYS = [1, 2, 3, 4, 5];          // Mon-Fri
const WEEKEND  = [0, 6];                    // Sun, Sat
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

const sameSet = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  const sa = new Set(a);
  return b.every(x => sa.has(x));
};

const ReminderEditor: React.FC<{
  deity: Deity;
  onSave: (patch: Partial<Deity>) => void;
  onClose: () => void;
}> = ({ deity, onSave, onClose }) => {
  // Parse the saved HH:MM into a Date for the native time picker
  const initialDate = React.useMemo(() => {
    const [h = '6', m = '0'] = (deity.prayerAlarm || '06:00').split(':');
    const d = new Date();
    d.setHours(parseInt(h, 10) || 0, parseInt(m, 10) || 0, 0, 0);
    return d;
  }, [deity.prayerAlarm]);

  const [timeDate, setTimeDate] = useState<Date>(initialDate);
  const [showPicker, setShowPicker] = useState(false);
  const [on, setOn] = useState(deity.alarmOn);
  const [days, setDays] = useState<number[]>(
    deity.repeatDays && deity.repeatDays.length > 0 ? deity.repeatDays : ALL_DAYS
  );
  const [sound, setSound] = useState({
    id: deity.alarmSoundId || 'flute',
    customUri: deity.alarmSoundUri,
    customName: deity.alarmSoundName,
  });

  const toggleDay = (d: number) => {
    setDays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort());
  };

  const formatTime = (d: Date) => {
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  };

  const isWeekdays = sameSet(days, WEEKDAYS);
  const isWeekend  = sameSet(days, WEEKEND);
  const isAll      = sameSet(days, ALL_DAYS);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Reminder</Text>
          <Text style={{ fontSize: 14, color: COLORS.gold, marginBottom: SPACING.md }}>
            {deity.icon} {deity.name}
          </Text>

          {/* ─── Prayer time (native picker) ─── */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prayer Time</Text>
            <TouchableOpacity
              style={[styles.input, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}
              onPress={() => setShowPicker(true)}
            >
              <Text style={{ color: COLORS.cream, fontSize: 18, fontWeight: '600' }}>
                {formatTime(timeDate)}
              </Text>
              <Text style={{ color: COLORS.gold, fontSize: 11 }}>⏰ Tap to change</Text>
            </TouchableOpacity>
            {(showPicker || Platform.OS === 'ios') && (
              <DateTimePicker
                value={timeDate}
                mode="time"
                is24Hour={true}
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                onChange={(_event, selected) => {
                  if (Platform.OS !== 'ios') setShowPicker(false);
                  if (selected) setTimeDate(selected);
                }}
              />
            )}
            <Text style={{ fontSize: 10, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' }}>
              Uses your phone&apos;s timezone — adjusts automatically with DST.
            </Text>
          </View>

          {/* ─── Repeat days ─── */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Repeat on</Text>

            {/* Day-of-week checkboxes */}
            <View style={styles.dayRow}>
              {DAY_LABELS.map((label, i) => {
                const selected = days.includes(i);
                return (
                  <TouchableOpacity
                    key={label}
                    style={[styles.dayChip, selected && styles.dayChipActive]}
                    onPress={() => toggleDay(i)}
                  >
                    <Text style={[styles.dayChipText, selected && styles.dayChipTextActive]}>
                      {label.charAt(0)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Quick presets */}
            <View style={styles.presetRow}>
              <TouchableOpacity
                style={[styles.presetBtn, isWeekdays && styles.presetBtnActive]}
                onPress={() => setDays([...WEEKDAYS])}
              >
                <Text style={[styles.presetText, isWeekdays && styles.presetTextActive]}>Weekdays</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetBtn, isWeekend && styles.presetBtnActive]}
                onPress={() => setDays([...WEEKEND])}
              >
                <Text style={[styles.presetText, isWeekend && styles.presetTextActive]}>Weekend</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.presetBtn, isAll && styles.presetBtnActive]}
                onPress={() => setDays([...ALL_DAYS])}
              >
                <Text style={[styles.presetText, isAll && styles.presetTextActive]}>Every day</Text>
              </TouchableOpacity>
            </View>
            <Text style={{ fontSize: 11, color: COLORS.muted, marginTop: 6 }}>
              {days.length === 0 ? '⚠ No days selected — reminder will not fire' : `${days.length} day${days.length === 1 ? '' : 's'} per week`}
            </Text>
          </View>

          {/* ─── On/Off ─── */}
          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
              <Switch
                value={on}
                onValueChange={setOn}
                trackColor={{ false: COLORS.border, true: COLORS.gold }}
                thumbColor={on ? COLORS.cream : COLORS.muted}
              />
              <Text style={{ flex: 1, fontSize: 14, color: COLORS.cream }}>
                Reminder {on ? 'enabled' : 'disabled'}
              </Text>
            </View>
          </View>

          {/* ─── Alarm sound (taps preview the tone) ─── */}
          <View style={styles.inputGroup}>
            <AlarmSoundPicker
              value={sound}
              onChange={s => setSound({ id: s.id, customUri: s.customUri, customName: s.customName })}
            />
          </View>

          {/* ─── Save ─── */}
          <TouchableOpacity
            style={[styles.submitBtn, (on && days.length === 0) && { opacity: 0.5 }]}
            disabled={on && days.length === 0}
            onPress={() =>
              onSave({
                prayerAlarm: formatTime(timeDate),
                alarmOn: on,
                repeatDays: days,
                alarmSoundId: sound.id,
                alarmSoundUri: sound.customUri,
                alarmSoundName: sound.customName,
              })
            }
          >
            <Text style={styles.submitBtnText}>Save Reminder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
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
    paddingBottom: 80,
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
  notifBanner: {
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
    flexDirection: 'row',
    alignItems: 'center',
  },
  notifTitle: {
    fontSize: 13,
    color: COLORS.cream,
    fontWeight: '600',
  },
  notifSubtitle: {
    fontSize: 11,
    color: COLORS.muted,
    marginTop: 2,
  },
  notifBtn: {
    backgroundColor: COLORS.gold,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: 6,
  },
  notifBtnText: {
    color: COLORS.deep,
    fontWeight: '600',
    fontSize: 12,
  },
  deityItem: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  deityIcon: {
    fontSize: 28,
    marginRight: SPACING.md,
    marginTop: 2,
  },
  deityIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  deityName: {
    fontSize: 15,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  deityMantra: {
    fontSize: 12,
    color: COLORS.muted,
    marginBottom: SPACING.xs,
  },
  alarmPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 2,
  },
  fullModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  fullCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: SPACING.md,
  },
  fullCloseText: { color: COLORS.cream, fontSize: 16 },
  fullModalTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '700' },
  fullModalSub: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginVertical: 6,
  },
  targetTrack: {
    flex: 1,
    height: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  targetFill: {
    height: '100%',
    backgroundColor: COLORS.gold,
    borderRadius: 3,
  },
  targetText: {
    fontSize: 11,
    color: COLORS.gold,
    fontWeight: '600',
  },
  alarmStatus: {
    fontSize: 12,
    color: COLORS.gold,
    fontWeight: '500',
  },
  deityStats: {
    alignItems: 'flex-end',
    marginLeft: SPACING.md,
  },
  totalMalas: {
    fontSize: 18,
    color: COLORS.gold,
    fontWeight: 'bold',
  },
  totalMalasLabel: {
    fontSize: 10,
    color: COLORS.muted,
  },
  deleteBtn: {
    fontSize: 16,
    color: COLORS.error,
    marginTop: SPACING.sm,
  },
  addBtn: {
    position: 'absolute',
    bottom: SPACING.lg,
    left: SPACING.md,
    right: SPACING.md,
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  addBtnText: {
    color: COLORS.deep,
    fontWeight: '600',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.md,
  },
  // v46 inline-everything section labels + helper styles
  sectionLabel: {
    fontSize: 11, color: COLORS.gold, fontWeight: '800', letterSpacing: 1.2,
    marginTop: SPACING.md, marginBottom: SPACING.sm,
  },
  emptyHint: {
    backgroundColor: COLORS.cardBg, borderRadius: 10, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    marginBottom: SPACING.md,
  },
  emptyHintText: { color: COLORS.muted, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
  customHint: {
    color: COLORS.muted, fontSize: 12, fontStyle: 'italic',
    marginBottom: SPACING.sm,
  },

  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: 13,
    color: COLORS.cream,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  input: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.cream,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  iconBtn: {
    width: '23%',
    aspectRatio: 1,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  iconBtnSelected: {
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderColor: COLORS.gold,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  timeInput: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.cream,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  alarmLabel: {
    fontSize: 12,
    color: COLORS.muted,
  },
  submitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  submitBtnText: {
    color: COLORS.deep,
    fontWeight: '600',
    fontSize: 14,
  },
  cancelBtn: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  cancelBtnText: {
    color: COLORS.cream,
    fontWeight: '500',
    fontSize: 14,
  },
  // T6: "+ Other Deity" button (large pill at the bottom of the picker)
  otherDeityBtn: {
    marginTop: SPACING.lg,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 12,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: COLORS.gold,
    borderStyle: 'dashed',
  },
  otherDeityBtnText: {
    color: COLORS.gold,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  // T4: sticky commit bar at the bottom of the Add Deity modal
  commitBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.darkBg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  commitCount: {
    color: COLORS.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  commitBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 8,
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.xl,
    alignItems: 'center',
  },
  commitBtnText: {
    color: COLORS.deep,
    fontWeight: '700',
    fontSize: 14,
    letterSpacing: 0.5,
  },

  // ── Day-of-week picker (reminder editor) ──
  dayRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: SPACING.sm,
  },
  dayChip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dayChipActive: {
    backgroundColor: COLORS.gold,
    borderColor: COLORS.gold,
  },
  dayChipText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '700',
  },
  dayChipTextActive: {
    color: COLORS.deep,
  },
  presetRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  presetBtnActive: {
    borderColor: COLORS.gold,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
  },
  presetText: {
    fontSize: 12,
    color: COLORS.muted,
    fontWeight: '600',
  },
  presetTextActive: {
    color: COLORS.gold,
  },
});
