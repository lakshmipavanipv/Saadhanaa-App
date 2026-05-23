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
} from 'react-native';
import { useSadhana } from '../context';
import { COLORS, SPACING } from '../theme';
import { Deity } from '../types';
import { DeityCatalogPicker } from '../components/DeityCatalogPicker';
import { CatalogDeity, ALL_CATALOG_DEITIES } from '../deityCatalog';
import { AlarmSoundPicker } from '../components/AlarmSoundPicker';
import { DeityIcon } from '../components/DeityIcon';

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

  const updateReminder = (id: string, patch: Partial<Deity>) => {
    setDeities(p =>
      p.map(d => (d.id === id ? { ...d, ...patch } : d))
    );
    const prayerAlarm = patch.prayerAlarm ?? '';
    const alarmOn = patch.alarmOn ?? false;
    showToast(alarmOn ? `Reminder set for ${prayerAlarm}` : 'Reminder turned off');
    setEditingReminder(null);
  };

  const remove = (id: string) => {
    setDeities(p => p.filter(d => d.id !== id));
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>My Deities</Text>
          <Text style={styles.subtitle}>{deities.length} deities in your sadhana</Text>
        </View>

        {/* Notification Banner */}
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

        {/* Deities List */}
        {deities.map((d, i) => {
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
                    <Text style={styles.targetText}>
                      {d.totalMalas}/{target}
                    </Text>
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
        })}
      </ScrollView>

      {/* Add Button */}
      <TouchableOpacity style={styles.addBtn} onPress={openAddModal}>
        <Text style={styles.addBtnText}>+ Add New Deity</Text>
      </TouchableOpacity>

      {/* Add Deity Modal — T4 two-step: tap for tick, commit on Add button */}
      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.container, { paddingTop: 50 }]}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.fullCloseBtn}>
              <Text style={styles.fullCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullModalTitle}>Choose deities</Text>
              <Text style={styles.fullModalSub}>Tap to select, then commit at the bottom</Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.md, paddingBottom: 120 }}
            showsVerticalScrollIndicator={false}
          >
            <DeityCatalogPicker
              pickedIds={pendingPicked}
              onTogglePick={togglePending}
              showCustom={false}
            />
            {/* Show pending customs */}
            {pendingCustoms.length > 0 && (
              <View style={{ marginTop: SPACING.md }}>
                <Text style={{ fontSize: 11, color: COLORS.gold, fontWeight: '700', letterSpacing: 1, marginBottom: 6 }}>
                  YOUR CUSTOM DEITIES
                </Text>
                {pendingCustoms.map(d => (
                  <View key={d.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.cardBg, padding: SPACING.sm, borderRadius: 8, marginBottom: 6 }}>
                    <Text style={{ fontSize: 22 }}>🙏</Text>
                    <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                      <Text style={{ fontSize: 14, color: COLORS.cream, fontWeight: '600' }}>{d.name}</Text>
                      <Text style={{ fontSize: 11, color: COLORS.muted, fontStyle: 'italic' }}>{d.mantra}</Text>
                    </View>
                    <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: COLORS.gold, justifyContent: 'center', alignItems: 'center' }}>
                      <Text style={{ color: COLORS.deep, fontSize: 11, fontWeight: '700' }}>✓</Text>
                    </View>
                  </View>
                ))}
              </View>
            )}
            {/* T6: + Other Deity button at the bottom */}
            <TouchableOpacity
              style={styles.otherDeityBtn}
              onPress={() => setShowCustomModal(true)}
            >
              <Text style={styles.otherDeityBtnText}>+ Other Deity</Text>
            </TouchableOpacity>
          </ScrollView>
          {/* Sticky commit bar at the bottom */}
          <View style={styles.commitBar}>
            <Text style={styles.commitCount}>{pendingPicked.size} selected</Text>
            <TouchableOpacity
              style={[styles.commitBtn, pendingPicked.size === 0 && { opacity: 0.4 }]}
              onPress={commitSelection}
              disabled={pendingPicked.size === 0}
            >
              <Text style={styles.commitBtnText}>Add Deity</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* T6: "Other Deity" sub-modal — clean 2-field form */}
      <Modal visible={showCustomModal} transparent animationType="slide" onRequestClose={() => setShowCustomModal(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHandle} />
            <Text style={styles.modalTitle}>Add a custom deity</Text>
            <Text style={{ fontSize: 12, color: COLORS.muted, marginBottom: SPACING.md }}>
              Family ishta devata, regional form, or any mantra not in the catalog.
            </Text>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Deity Name</Text>
              <TextInput
                style={styles.input}
                placeholder="e.g. Sri Banke Bihari"
                placeholderTextColor={COLORS.muted}
                value={customNameInput}
                onChangeText={setCustomNameInput}
                autoFocus
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

            <TouchableOpacity style={styles.submitBtn} onPress={saveCustomDeity}>
              <Text style={styles.submitBtnText}>Save</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setShowCustomModal(false)}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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

const ReminderEditor: React.FC<{
  deity: Deity;
  onSave: (patch: Partial<Deity>) => void;
  onClose: () => void;
}> = ({ deity, onSave, onClose }) => {
  const [time, setTime] = useState(deity.prayerAlarm);
  const [on, setOn] = useState(deity.alarmOn);
  const [sound, setSound] = useState({
    id: deity.alarmSoundId || 'flute',
    customUri: deity.alarmSoundUri,
    customName: deity.alarmSoundName,
  });

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <ScrollView style={styles.modalContent} contentContainerStyle={{ paddingBottom: SPACING.lg }}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit Reminder</Text>
          <Text style={{ fontSize: 14, color: COLORS.gold, marginBottom: SPACING.md }}>
            {deity.icon} {deity.name}
          </Text>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Prayer Time (HH:MM)</Text>
            <TextInput
              style={styles.input}
              placeholder="06:00"
              placeholderTextColor={COLORS.muted}
              value={time}
              onChangeText={setTime}
              keyboardType="numbers-and-punctuation"
              autoFocus
            />
          </View>

          <View style={styles.inputGroup}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
              <Switch
                value={on}
                onValueChange={setOn}
                trackColor={{ false: COLORS.border, true: COLORS.gold }}
                thumbColor={on ? COLORS.cream : COLORS.muted}
              />
              <Text style={{ flex: 1, fontSize: 14, color: COLORS.cream }}>
                Daily reminder {on ? 'enabled' : 'disabled'}
              </Text>
            </View>
          </View>

          {/* Alarm sound picker */}
          <View style={styles.inputGroup}>
            <AlarmSoundPicker
              value={sound}
              onChange={s => setSound({ id: s.id, customUri: s.customUri, customName: s.customName })}
            />
          </View>

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() =>
              onSave({
                prayerAlarm: time,
                alarmOn: on,
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
});
