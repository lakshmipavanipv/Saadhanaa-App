/**
 * JapaGoalEditor — the sheet behind the ✎ goal chip on the Japa box.
 *
 * WHY THE GOAL IS EDITABLE FROM HERE AT ALL
 *
 * The walk box has had this from the start: the target is read on the card, so
 * it should be changeable on the card. Japa's target lived only in Plan Your
 * Wellbeing, three taps away, which meant the one number you are looking at
 * while deciding it was the one you could not touch.
 *
 * WHY THERE IS A DEITY PICKER
 *
 * The card's target is the SUM of today's japa commitments. Without a deity,
 * a single number had to stand for all of them at once — and being told the
 * total is now seven says nothing about which deity gained the two, so the
 * sheet could only refuse. Naming the deity makes the edit unambiguous: that
 * deity's commitment is changed, or created if it has none, and every other
 * one is left exactly as it was.
 *
 * WHERE IT SAVES
 *
 * Into Plan Your Wellbeing, not a second store of its own. A goal edited here
 * IS the plan — anything else would give the app two targets that disagree the
 * moment one changes, with no way to tell which the progress bar is using.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Modal, TouchableOpacity, TextInput, ScrollView,
} from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useSadhana } from '../../context';
import { saveJapaGoal, japaItemsToday, japaItemFor } from '../analytics/JapaPlan';
import type { RoutineItem } from '../../services/routineRepo';

interface Props {
  visible: boolean;
  /** The card's current totals, used when no single deity is in play. */
  malas: number | null;
  minutes: number | null;
  /** Deity the screen is on — the picker opens here. */
  deityName?: string | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenPlan: () => void;
}

/** "unattributed" — a japa commitment with no deity against it. */
const ANY = '__any__';

export const JapaGoalEditor: React.FC<Props> = ({
  visible, malas, minutes, deityName, onClose, onSaved, onOpenPlan,
}) => {
  const { deities } = useSadhana();

  const [target, setTarget] = useState<string>(ANY);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [unit, setUnit] = useState<'malas' | 'min'>('malas');
  const [value, setValue] = useState('');
  const [items, setItems] = useState<RoutineItem[]>([]);
  const [ambiguous, setAmbiguous] = useState(0);
  const [saving, setSaving] = useState(false);

  /**
   * Open on what is actually set for whoever is selected, so the sheet starts
   * from the truth rather than from a default the user then has to correct.
   */
  const fillFor = useCallback((who: string, list: RoutineItem[]) => {
    const item = who === ANY ? (list.length === 1 ? list[0] : undefined)
                             : japaItemFor(list, who);
    if (item?.goalUnit === 'malas' && item.goalValue) {
      setUnit('malas'); setValue(String(item.goalValue)); return;
    }
    if (item?.goalUnit === 'min' && item.goalValue) {
      setUnit('min'); setValue(String(item.goalValue)); return;
    }
    if (item) { setUnit('min'); setValue(String(item.durationMin || '')); return; }
    // Nothing planned for this one yet. Fall back to the card's total only
    // when the card IS this one — otherwise show it empty rather than
    // suggesting another deity's number.
    if (who === ANY && malas != null) { setUnit('malas'); setValue(String(malas)); return; }
    if (who === ANY && minutes != null) { setUnit('min'); setValue(String(minutes)); return; }
    setUnit('malas'); setValue('');
  }, [malas, minutes]);

  useEffect(() => {
    if (!visible) return;
    setAmbiguous(0);
    setPickerOpen(false);
    const who = deityName ?? ANY;
    setTarget(who);
    void japaItemsToday().then((list) => {
      setItems(list);
      fillFor(who, list);
    });
  }, [visible, deityName, fillFor]);

  const n = parseInt(value, 10);
  const valid = Number.isFinite(n) && n > 0;
  const targetLabel = target === ANY ? 'All japa (no deity)' : target;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const r = await saveJapaGoal(unit, n, target === ANY ? null : target);
      if (r.ok) { onSaved(); onClose(); }
      else setAmbiguous(r.items);
    } finally {
      setSaving(false);
    }
  };

  // Deities the user has, plus any planned commitment whose name is not among
  // them — a plan made before a deity was removed still has to be editable.
  const choices: string[] = [
    ...deities.map((d) => d.name),
    ...items.map((i) => i.name).filter((nm) => !deities.some((d) => d.name === nm)),
  ];

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Daily japa goal</Text>

          {ambiguous > 0 ? (
            <>
              <Text style={styles.body}>
                You have {ambiguous} japa commitments today and this target is
                their total, so one number cannot say which you meant. Pick a
                deity above, or change them individually in your plan.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondary} onPress={() => setAmbiguous(0)}>
                  <Text style={styles.secondaryText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primary} onPress={() => { onClose(); onOpenPlan(); }}>
                  <Text style={styles.primaryText}>Open plan</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              {/* ── Which deity ── */}
              <Text style={styles.fieldLabel}>FOR</Text>
              <TouchableOpacity
                style={styles.dropdown}
                onPress={() => setPickerOpen((o) => !o)}
                activeOpacity={0.75}
              >
                <Text style={styles.dropdownText} numberOfLines={1}>{targetLabel}</Text>
                <Text style={styles.dropdownChev}>{pickerOpen ? '▴' : '▾'}</Text>
              </TouchableOpacity>

              {pickerOpen && (
                <ScrollView style={styles.picker} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                  {[ANY, ...choices].map((c) => {
                    const on = c === target;
                    const planned = c === ANY ? undefined : japaItemFor(items, c);
                    return (
                      <TouchableOpacity
                        key={c}
                        style={[styles.pickRow, on && styles.pickRowOn]}
                        onPress={() => {
                          setTarget(c);
                          setPickerOpen(false);
                          fillFor(c, items);
                        }}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.pickName, on && styles.pickNameOn]} numberOfLines={1}>
                          {c === ANY ? 'All japa (no deity)' : c}
                        </Text>
                        <Text style={styles.pickNote}>
                          {planned
                            ? planned.goalUnit === 'malas'
                              ? `${planned.goalValue} malas`
                              : `${planned.goalValue ?? planned.durationMin} min`
                            : 'not planned'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* ── Count it how ── */}
              <Text style={styles.fieldLabel}>COUNT IT IN</Text>
              <View style={styles.unitRow}>
                {(['malas', 'min'] as const).map((u) => (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, unit === u && styles.unitChipOn]}
                    onPress={() => setUnit(u)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.unitText, unit === u && styles.unitTextOn]}>
                      {u === 'malas' ? '📿 Malas' : '⏱ Minutes'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.valueRow}>
                <Text style={styles.valueLabel}>Target:</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  maxLength={4}
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                />
                <Text style={styles.valueLabel}>
                  {unit === 'malas' ? 'malas/day' : 'min/day'}
                </Text>
              </View>

              <Text style={styles.note}>
                Saved to Plan Your Wellbeing
                {target === ANY ? '.' : ` as ${target}'s daily commitment.`}
                {target !== ANY && items.length > 1
                  ? ' Your other deities keep their own targets.'
                  : ''}
              </Text>

              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondary} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.primary, !valid && styles.primaryOff]}
                  onPress={save}
                  disabled={!valid || saving}
                >
                  <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', paddingHorizontal: SPACING.lg,
  },
  card: {
    backgroundColor: COLORS.darkBg, borderRadius: 18, padding: SPACING.lg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  title: { color: COLORS.cream, fontSize: 17, fontWeight: '800' },
  body: { color: COLORS.cream, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },

  fieldLabel: {
    color: COLORS.muted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.2, marginTop: SPACING.md, marginBottom: 6,
  },
  dropdown: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  dropdownText: { color: COLORS.cream, fontSize: 14, fontWeight: '700', flex: 1 },
  dropdownChev: { color: COLORS.gold, fontSize: 14, fontWeight: '800' },
  picker: {
    maxHeight: 176, marginTop: 6,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  pickRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  pickRowOn: { backgroundColor: 'rgba(255,184,0,0.10)' },
  pickName: { color: COLORS.cream, fontSize: 13.5, flex: 1 },
  pickNameOn: { color: COLORS.gold, fontWeight: '700' },
  pickNote: { color: COLORS.muted, fontSize: 11 },

  unitRow: { flexDirection: 'row', gap: SPACING.sm },
  unitChip: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  unitChipOn: { backgroundColor: 'rgba(255,184,0,0.12)', borderColor: COLORS.gold },
  unitText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  unitTextOn: { color: COLORS.gold },

  valueRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.md },
  valueLabel: { color: COLORS.muted, fontSize: 13 },
  input: {
    minWidth: 76, paddingVertical: 8, paddingHorizontal: 12,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    color: COLORS.cream, fontSize: 20, fontWeight: '800', textAlign: 'center',
  },
  note: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: SPACING.md },

  btnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.lg },
  secondary: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  secondaryText: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  primary: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: COLORS.gold,
  },
  primaryOff: { opacity: 0.4 },
  primaryText: { color: '#1a1206', fontSize: 13, fontWeight: '800' },
});
