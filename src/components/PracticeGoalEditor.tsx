/**
 * PracticeGoalEditor — the sheet behind the ✎ goal chip on the Yoga and
 * Meditation boxes.
 *
 * The same contract as the Japa one: the target is read on the card, so it is
 * changed on the card, and it saves into Plan Your Wellbeing rather than into
 * a store of its own.
 *
 * No unit picker here. Japa needed one because "three malas" and "twenty
 * minutes" are both natural ways to commit to it and neither converts into the
 * other; a yoga or meditation commitment is always minutes.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, TextInput } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { savePracticeGoal, type SoulPractice } from '../soulsync/analytics/PracticeGoals';

interface Props {
  visible: boolean;
  practice: SoulPractice;
  /** Current target, to open on. Null when none is set. */
  minutes: number | null;
  onClose: () => void;
  onSaved: () => void;
  onOpenPlan: () => void;
}

const WORD: Record<SoulPractice, string> = { yoga: 'Yoga', meditation: 'Meditation' };

export const PracticeGoalEditor: React.FC<Props> = ({
  visible, practice, minutes, onClose, onSaved, onOpenPlan,
}) => {
  const [value, setValue] = useState('');
  const [ambiguous, setAmbiguous] = useState(0);
  const [saving, setSaving] = useState(false);

  // Open on what is set, so the sheet starts from the truth rather than a
  // default the user then has to correct.
  useEffect(() => {
    if (!visible) return;
    setAmbiguous(0);
    setValue(minutes != null ? String(minutes) : '');
  }, [visible, minutes]);

  const n = parseInt(value, 10);
  const valid = Number.isFinite(n) && n > 0;

  const save = async () => {
    if (!valid || saving) return;
    setSaving(true);
    try {
      const r = await savePracticeGoal(practice, n);
      if (r.ok) { onSaved(); onClose(); }
      else setAmbiguous(r.items);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Text style={styles.title}>Daily {WORD[practice].toLowerCase()} goal</Text>

          {ambiguous > 0 ? (
            <>
              <Text style={styles.body}>
                You have {ambiguous} {WORD[practice].toLowerCase()} commitments
                planned for today, and this target is their total. One number
                cannot say which you meant, so it is better changed in your plan
                where each stands on its own.
              </Text>
              <View style={styles.btnRow}>
                <TouchableOpacity style={styles.secondary} onPress={onClose}>
                  <Text style={styles.secondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primary} onPress={() => { onClose(); onOpenPlan(); }}>
                  <Text style={styles.primaryText}>Open plan</Text>
                </TouchableOpacity>
              </View>
            </>
          ) : (
            <>
              <Text style={styles.hint}>How long do you mean to practise each day?</Text>
              <View style={styles.valueRow}>
                <Text style={styles.valueLabel}>Target:</Text>
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={setValue}
                  keyboardType="numeric"
                  maxLength={3}
                  autoFocus
                  placeholder="0"
                  placeholderTextColor={COLORS.muted}
                />
                <Text style={styles.valueLabel}>min/day</Text>
              </View>
              <Text style={styles.note}>
                Saved to Plan Your Wellbeing as a daily {WORD[practice].toLowerCase()} commitment.
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
  hint: { color: COLORS.muted, fontSize: 12, marginTop: 4 },
  body: { color: COLORS.cream, fontSize: 13, lineHeight: 19, marginTop: SPACING.sm },
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
