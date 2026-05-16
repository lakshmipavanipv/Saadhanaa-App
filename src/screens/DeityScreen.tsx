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

export const DeityScreen = () => {
  const { deities, setDeities, showToast, notifGranted, requestNotif } = useSadhana();
  const [showAdd, setShowAdd] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Deity | null>(null);
  const [name, setName] = useState('');
  const [mantra, setMantra] = useState('');
  const [icon, setIcon] = useState('🙏');
  const [time, setTime] = useState('06:00');
  const [alarmOn, setAlarmOn] = useState(true);
  const [target, setTarget] = useState('');

  const add = () => {
    if (!name.trim()) {
      showToast('Please enter a deity name');
      return;
    }
    const targetNum = parseInt(target, 10);
    const newDeity: Deity = {
      id: Date.now().toString(),
      name: name.trim(),
      icon,
      mantra: mantra.trim() || 'Om Namah',
      prayerAlarm: time,
      alarmOn,
      totalMalas: 0,
      ...(targetNum > 0 ? { targetMalas: targetNum } : {}),
    };
    setDeities(p => [...p, newDeity]);
    setName('');
    setMantra('');
    setIcon('🙏');
    setTarget('');
    setShowAdd(false);
    showToast(`${icon} ${newDeity.name} added!`);
  };

  const updateReminder = (id: string, prayerAlarm: string, alarmOn: boolean) => {
    setDeities(p =>
      p.map(d => (d.id === id ? { ...d, prayerAlarm, alarmOn } : d))
    );
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
              <Text style={styles.deityIcon}>{d.icon}</Text>
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
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Add New Deity</Text>
      </TouchableOpacity>

      {/* Add Deity Modal — full catalog picker */}
      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <View style={[styles.container, { paddingTop: 50 }]}>
          <View style={styles.fullModalHeader}>
            <TouchableOpacity onPress={() => setShowAdd(false)} style={styles.fullCloseBtn}>
              <Text style={styles.fullCloseText}>✕</Text>
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.fullModalTitle}>Add deity</Text>
              <Text style={styles.fullModalSub}>Browse the catalog or add your own</Text>
            </View>
          </View>
          <ScrollView
            contentContainerStyle={{ padding: SPACING.md }}
            showsVerticalScrollIndicator={false}
          >
            <DeityCatalogPicker
              pickedIds={new Set(deities.map(d => d.id))}
              onTogglePick={catalogDeity => {
                if (deities.some(d => d.id === catalogDeity.id)) {
                  // Already added — remove
                  setDeities(p => p.filter(d => d.id !== catalogDeity.id));
                  showToast(`Removed ${catalogDeity.name}`);
                } else {
                  // Add it
                  const newDeity: Deity = {
                    id: catalogDeity.id,
                    name: catalogDeity.name,
                    icon: catalogDeity.icon,
                    mantra: catalogDeity.mantra,
                    prayerAlarm: '06:00',
                    alarmOn: false,
                    totalMalas: 0,
                    malaMaterial: catalogDeity.malaMaterial,
                    malaColor: catalogDeity.malaColor,
                    malaHighlight: catalogDeity.malaHighlight,
                  };
                  setDeities(p => [...p, newDeity]);
                  showToast(`${catalogDeity.icon} ${catalogDeity.name} added`);
                }
              }}
              onAddCustom={(customN, customI, customM) => {
                const newDeity: Deity = {
                  id: `custom-${Date.now()}`,
                  name: customN,
                  icon: customI,
                  mantra: customM,
                  prayerAlarm: '06:00',
                  alarmOn: false,
                  totalMalas: 0,
                };
                setDeities(p => [...p, newDeity]);
                showToast(`${customI} ${customN} added`);
              }}
            />
          </ScrollView>
        </View>
      </Modal>

      {/* Edit Reminder Modal */}
      {editingReminder && (
        <ReminderEditor
          deity={editingReminder}
          onSave={(t, on) => updateReminder(editingReminder.id, t, on)}
          onClose={() => setEditingReminder(null)}
        />
      )}
    </View>
  );
};

const ReminderEditor: React.FC<{
  deity: Deity;
  onSave: (time: string, on: boolean) => void;
  onClose: () => void;
}> = ({ deity, onSave, onClose }) => {
  const [time, setTime] = useState(deity.prayerAlarm);
  const [on, setOn] = useState(deity.alarmOn);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
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

          <TouchableOpacity
            style={styles.submitBtn}
            onPress={() => onSave(time, on)}
          >
            <Text style={styles.submitBtnText}>Save Reminder</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
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
});
