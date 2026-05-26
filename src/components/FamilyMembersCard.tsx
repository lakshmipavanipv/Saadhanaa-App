/**
 * FamilyMembersCard — add / list / remove family members whose Tithi
 * Shraddha (death anniversary) should appear in the festival calendar.
 *
 * Supports TWO input modes:
 *   • 'date'  — enter Gregorian death date + time + city/country of death.
 *               App converts to lunar tithi via VedAstro.
 *   • 'tithi' — enter Paksha + Tithi # + Lunar month directly.
 *
 * Auto-enables a daily-time reminder on save and schedules a real
 * notification for the next shraddha date in the user's TZ.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, FlatList, Switch,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { COLORS, SPACING } from '../theme';
import { FamilyMember, DeathLocation } from '../types';
import { familyRepo } from '../services/familyRepo';
import { getUserLocation } from '../services/location';
import { searchCities, geocodeCity } from '../services/cities';
import { RingSpinner } from './RingSpinner';

const RELATIONS = ['Father', 'Mother', 'Grandfather', 'Grandmother', 'Uncle', 'Aunt', 'Brother', 'Sister', 'Other'];
const MAAS_NAMES = ['Chaitra', 'Vaisakha', 'Jyaishtha', 'Ashadha', 'Shravana', 'Bhadrapada',
                    'Ashwin', 'Kartika', 'Margashirsha', 'Pausha', 'Magha', 'Phalguna'];
const TITHI_NAMES = ['Pratipada', 'Dwitiya', 'Tritiya', 'Chaturthi', 'Panchami', 'Shashthi',
                     'Saptami', 'Ashtami', 'Navami', 'Dashami', 'Ekadashi', 'Dwadashi',
                     'Trayodashi', 'Chaturdashi', 'Purnima/Amavasya'];

export const FamilyMembersCard: React.FC = () => {
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [showEditor, setShowEditor] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [loading, setLoading] = useState(false);

  const refresh = async () => setMembers(await familyRepo.list());
  useEffect(() => { refresh(); }, []);

  const openAdd = () => {
    setEditingMember({
      id: `fam-${Date.now()}`,
      name: '',
      relation: 'Father',
      inputMode: 'date',
      deathDateGregorian: new Date().toISOString().slice(0, 10),
      deathTimeLocal: '12:00',
      reminderEnabled: true,
      reminderTime: '06:00',
    });
    setShowEditor(true);
  };

  const openEdit = (m: FamilyMember) => {
    setEditingMember({
      reminderEnabled: true,
      reminderTime: '06:00',
      ...m,
    });
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!editingMember || !editingMember.name.trim()) return;
    // Validate inputs based on mode
    if (editingMember.inputMode === 'date') {
      if (!editingMember.deathDateGregorian || !editingMember.deathLocation) return;
    } else {
      if (!editingMember.lunarTithiNumber || !editingMember.lunarPaksha || !editingMember.lunarMaas) return;
    }

    setLoading(true);
    try {
      const userLoc = await getUserLocation();
      await familyRepo.upsert(editingMember, userLoc);
      await refresh();
      setShowEditor(false);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    await familyRepo.remove(id);
    await refresh();
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Text style={styles.title}>Family · Tithi Shraddha</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openAdd}>
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.subtitle}>
        Annual shraddha dates auto-computed from Hindu lunar calendar
      </Text>

      {members.length === 0 ? (
        <Text style={styles.empty}>
          🕯️ No family members added yet. Tap + Add to track parents' or relatives' annual shraddha dates.
        </Text>
      ) : (
        members.map(m => (
          <TouchableOpacity key={m.id} style={styles.memberRow} onPress={() => openEdit(m)}>
            <Text style={styles.memberIcon}>🕯️</Text>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.memberName}>{m.name}</Text>
              <Text style={styles.memberMeta}>
                {m.relation}
                {m.lunarMaas && `  ·  ${m.lunarPaksha || ''} ${TITHI_NAMES[(m.lunarTithiNumber || 1) - 1] || ''} · ${m.lunarMaas}`}
              </Text>
              {m.nextOccurrenceISO && (
                <Text style={styles.memberNext}>
                  Next shraddha: {m.nextOccurrenceISO}
                  {m.reminderEnabled && ' · ⏰ reminder set'}
                </Text>
              )}
            </View>
            <TouchableOpacity onPress={() => handleDelete(m.id)} style={styles.deleteBtn}>
              <Text style={styles.deleteX}>✕</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        ))
      )}

      {/* Editor modal */}
      {editingMember && (
        <FamilyEditorModal
          visible={showEditor}
          member={editingMember}
          onChange={setEditingMember}
          onClose={() => setShowEditor(false)}
          onSave={handleSave}
          loading={loading}
        />
      )}
    </View>
  );
};

// ─── Editor modal (separate component for readability) ────────────

const FamilyEditorModal: React.FC<{
  visible: boolean;
  member: FamilyMember;
  onChange: (m: FamilyMember) => void;
  onClose: () => void;
  onSave: () => void;
  loading: boolean;
}> = ({ visible, member, onChange, onClose, onSave, loading }) => {
  const [showCitySearch, setShowCitySearch] = useState(false);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Family Member</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>

          <FlatList
            data={[1]}
            keyExtractor={() => 'editor'}
            showsVerticalScrollIndicator={false}
            renderItem={() => (
              <View>
                {/* Name */}
                <Text style={styles.fieldLabel}>Name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Ramesh Kumar"
                  placeholderTextColor={COLORS.muted}
                  value={member.name}
                  onChangeText={t => onChange({ ...member, name: t })}
                />

                {/* Relation */}
                <Text style={styles.fieldLabel}>Relation</Text>
                <View style={styles.relationGrid}>
                  {RELATIONS.map(r => (
                    <TouchableOpacity
                      key={r}
                      style={[styles.relationChip, member.relation === r && styles.relationChipActive]}
                      onPress={() => onChange({ ...member, relation: r })}
                    >
                      <Text style={[styles.relationChipText, member.relation === r && styles.relationChipTextActive]}>{r}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Mode toggle */}
                <Text style={styles.fieldLabel}>How do you know the date?</Text>
                <View style={styles.modeRow}>
                  <TouchableOpacity
                    style={[styles.modeChip, member.inputMode === 'date' && styles.modeChipActive]}
                    onPress={() => onChange({ ...member, inputMode: 'date' })}
                  >
                    <Text style={[styles.modeChipText, member.inputMode === 'date' && styles.modeChipTextActive]}>
                      📅 Gregorian date{'\n'}<Text style={styles.modeSub}>Date + time + city</Text>
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.modeChip, member.inputMode === 'tithi' && styles.modeChipActive]}
                    onPress={() => onChange({ ...member, inputMode: 'tithi' })}
                  >
                    <Text style={[styles.modeChipText, member.inputMode === 'tithi' && styles.modeChipTextActive]}>
                      🌙 Hindu tithi{'\n'}<Text style={styles.modeSub}>Paksha + tithi + maas</Text>
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Mode: Gregorian date */}
                {member.inputMode === 'date' && (
                  <>
                    <Text style={styles.fieldLabel}>Date of death (Gregorian)</Text>
                    <DateInput
                      value={member.deathDateGregorian || ''}
                      onChange={v => onChange({ ...member, deathDateGregorian: v })}
                    />
                    <Text style={styles.fieldLabel}>Approximate time of death (local)</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="HH:MM (default 12:00 if unknown)"
                      placeholderTextColor={COLORS.muted}
                      value={member.deathTimeLocal || ''}
                      onChangeText={t => onChange({ ...member, deathTimeLocal: t })}
                    />
                    <Text style={styles.fieldLabel}>City / Country of death</Text>
                    <TouchableOpacity style={styles.input} onPress={() => setShowCitySearch(true)}>
                      <Text style={{ color: member.deathLocation ? COLORS.cream : COLORS.muted, fontSize: 14 }}>
                        {member.deathLocation
                          ? `${member.deathLocation.name}, ${member.deathLocation.country} · ${member.deathLocation.tz}`
                          : 'Tap to select location'}
                      </Text>
                    </TouchableOpacity>
                    <Text style={styles.hint}>
                      We use this location to compute the exact lunar tithi at the moment of death.
                    </Text>
                  </>
                )}

                {/* Mode: Direct tithi */}
                {member.inputMode === 'tithi' && (
                  <>
                    <Text style={styles.fieldLabel}>Paksha</Text>
                    <View style={styles.relationGrid}>
                      {(['Shukla', 'Krishna'] as const).map(p => (
                        <TouchableOpacity
                          key={p}
                          style={[styles.relationChip, member.lunarPaksha === p && styles.relationChipActive]}
                          onPress={() => onChange({ ...member, lunarPaksha: p })}
                        >
                          <Text style={[styles.relationChipText, member.lunarPaksha === p && styles.relationChipTextActive]}>{p}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={styles.fieldLabel}>Tithi (1-15)</Text>
                    <View style={styles.tithiGrid}>
                      {TITHI_NAMES.map((name, idx) => {
                        const n = idx + 1;
                        return (
                          <TouchableOpacity
                            key={n}
                            style={[styles.tithiChip, member.lunarTithiNumber === n && styles.relationChipActive]}
                            onPress={() => onChange({ ...member, lunarTithiNumber: n })}
                          >
                            <Text style={[styles.tithiChipNum, member.lunarTithiNumber === n && styles.relationChipTextActive]}>{n}</Text>
                            <Text style={[styles.tithiChipName, member.lunarTithiNumber === n && { color: COLORS.gold }]}>
                              {name.length > 9 ? name.slice(0, 9) : name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                    <Text style={styles.fieldLabel}>Lunar Month (Maas)</Text>
                    <View style={styles.relationGrid}>
                      {MAAS_NAMES.map(m => (
                        <TouchableOpacity
                          key={m}
                          style={[styles.relationChip, member.lunarMaas === m && styles.relationChipActive]}
                          onPress={() => onChange({ ...member, lunarMaas: m })}
                        >
                          <Text style={[styles.relationChipText, member.lunarMaas === m && styles.relationChipTextActive]}>{m}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                {/* Reminder */}
                <View style={styles.reminderRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Auto reminder</Text>
                    <Text style={styles.hint}>Notify on the morning of each year's shraddha</Text>
                  </View>
                  <Switch
                    value={member.reminderEnabled ?? true}
                    onValueChange={v => onChange({ ...member, reminderEnabled: v })}
                    trackColor={{ false: COLORS.border, true: COLORS.gold }}
                    thumbColor={member.reminderEnabled ? COLORS.cream : COLORS.muted}
                  />
                </View>
                {member.reminderEnabled && (
                  <>
                    <Text style={styles.fieldLabel}>Reminder time</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="06:00"
                      placeholderTextColor={COLORS.muted}
                      value={member.reminderTime || '06:00'}
                      onChangeText={t => onChange({ ...member, reminderTime: t })}
                    />
                  </>
                )}

                {/* Save */}
                <View style={styles.btnRow}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, loading && { opacity: 0.6 }]}
                    onPress={onSave}
                    disabled={loading}
                  >
                    {loading
                      ? <RingSpinner size={20} color={COLORS.deep} />
                      : <Text style={styles.saveBtnText}>Save · Compute tithi</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      </View>

      {/* City picker */}
      <CityPickerModal
        visible={showCitySearch}
        onSelect={loc => {
          onChange({ ...member, deathLocation: loc });
          setShowCitySearch(false);
        }}
        onClose={() => setShowCitySearch(false)}
      />
    </Modal>
  );
};

// ─── City picker modal ──────────────────────────────────────────

const CityPickerModal: React.FC<{
  visible: boolean;
  onSelect: (loc: DeathLocation) => void;
  onClose: () => void;
}> = ({ visible, onSelect, onClose }) => {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(searchCities(''));
  const [geocoding, setGeocoding] = useState(false);

  useEffect(() => { setResults(searchCities(q)); }, [q]);

  const handleGeocode = async () => {
    if (!q.trim()) return;
    setGeocoding(true);
    try {
      const r = await geocodeCity(q);
      if (r) onSelect(r);
    } finally {
      setGeocoding(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={[styles.modalContent, { maxHeight: '80%' }]}>
          <View style={styles.modalHandle} />
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>City of Death</Text>
            <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
          </View>
          <TextInput
            style={styles.input}
            placeholder="Search Mumbai, Toronto, etc."
            placeholderTextColor={COLORS.muted}
            value={q}
            onChangeText={setQ}
            autoFocus
          />
          <FlatList
            data={results}
            keyExtractor={(item, i) => `${item.name}-${item.country}-${i}`}
            style={{ marginTop: SPACING.sm, maxHeight: 320 }}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.cityRow} onPress={() => onSelect(item)}>
                <Text style={styles.cityName}>{item.name}, {item.country}</Text>
                <Text style={styles.cityTz}>{item.tz}</Text>
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              <View style={{ paddingVertical: SPACING.md }}>
                <Text style={{ color: COLORS.muted, fontSize: 12, textAlign: 'center' }}>
                  No city in our list — tap below to search online.
                </Text>
              </View>
            }
          />
          {q.trim() && (
            <TouchableOpacity
              style={[styles.saveBtn, { marginTop: SPACING.sm }, geocoding && { opacity: 0.6 }]}
              onPress={handleGeocode}
              disabled={geocoding}
            >
              {geocoding
                ? <RingSpinner size={18} color={COLORS.deep} />
                : <Text style={styles.saveBtnText}>🌐 Search online: "{q}"</Text>}
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ─── Date input (native picker on mobile, text input on web) ────

const DateInput: React.FC<{ value: string; onChange: (s: string) => void }> = ({ value, onChange }) => {
  const [show, setShow] = useState(false);
  const dateObj = React.useMemo(() => {
    const d = new Date(value + 'T12:00:00');
    return isNaN(d.getTime()) ? new Date() : d;
  }, [value]);
  if (Platform.OS === 'web') {
    return (
      <TextInput style={styles.input} placeholder="YYYY-MM-DD" placeholderTextColor={COLORS.muted}
        value={value} onChangeText={onChange} />
    );
  }
  return (
    <>
      <TouchableOpacity style={styles.input} onPress={() => setShow(true)}>
        <Text style={{ color: COLORS.cream, fontSize: 14 }}>{value || 'Tap to pick'}</Text>
      </TouchableOpacity>
      {show && (
        <DateTimePicker
          value={dateObj} mode="date" display="default"
          onChange={(_e, d) => { setShow(false); if (d) onChange(d.toISOString().slice(0, 10)); }}
        />
      )}
    </>
  );
};

// ─── Styles ─────────────────────────────────────────────────────

const styles = StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginVertical: SPACING.sm, padding: SPACING.md,
    backgroundColor: COLORS.cardBg, borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 13, color: COLORS.gold, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  subtitle: { fontSize: 11, color: COLORS.muted, marginTop: 2, marginBottom: SPACING.sm },
  empty: { fontSize: 12, color: COLORS.muted, fontStyle: 'italic', lineHeight: 17, paddingVertical: SPACING.sm },

  addBtn: { backgroundColor: COLORS.gold, borderRadius: 6, paddingHorizontal: SPACING.sm, paddingVertical: 5 },
  addBtnText: { color: COLORS.deep, fontSize: 12, fontWeight: '700' },

  memberRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  memberIcon: { fontSize: 22 },
  memberName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  memberMeta: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  memberNext: { fontSize: 11, color: COLORS.gold, fontWeight: '600', marginTop: 2 },
  deleteBtn: { padding: 6 },
  deleteX: { color: COLORS.error, fontSize: 16 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '92%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING.md },
  modalTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '600' },
  modalClose: { color: COLORS.muted, fontSize: 18, padding: 4 },

  fieldLabel: { fontSize: 12, color: COLORS.cream, fontWeight: '600', marginTop: SPACING.sm, marginBottom: 6 },
  input: {
    backgroundColor: COLORS.cardBg, borderRadius: 8,
    padding: SPACING.md, color: COLORS.cream, fontSize: 14,
    borderWidth: 1, borderColor: COLORS.border,
  },
  hint: { fontSize: 10, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },

  relationGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  relationChip: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  relationChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  relationChipText: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  relationChipTextActive: { color: COLORS.gold },

  modeRow: { flexDirection: 'row', gap: SPACING.sm },
  modeChip: {
    flex: 1, paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    borderRadius: 10, borderWidth: 1.5, borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg,
  },
  modeChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.12)' },
  modeChipText: { fontSize: 12, color: COLORS.cream, fontWeight: '700', textAlign: 'center', lineHeight: 16 },
  modeChipTextActive: { color: COLORS.gold },
  modeSub: { fontSize: 10, color: COLORS.muted, fontWeight: '500' },

  tithiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tithiChip: {
    width: '23%', alignItems: 'center', padding: 6, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  tithiChipNum: { fontSize: 13, color: COLORS.cream, fontWeight: '700' },
  tithiChipName: { fontSize: 8, color: COLORS.muted, marginTop: 2 },

  reminderRow: { flexDirection: 'row', alignItems: 'center' },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelBtnText: { color: COLORS.cream, fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: 'center', justifyContent: 'center', minHeight: 44 },
  saveBtnText: { color: COLORS.deep, fontSize: 14, fontWeight: '700' },

  cityRow: { paddingVertical: 10, paddingHorizontal: SPACING.sm, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  cityName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  cityTz: { fontSize: 10, color: COLORS.muted, marginTop: 2 },
});
