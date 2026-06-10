/**
 * AddToPlanCta — small in-tab affordance that lets the user jump
 * straight into the Plan tab to add a routine item for THIS category.
 *
 * Lives on Exercise / Yoga / Meditate / Japa screens.  Tapping it
 * navigates to Plan; the Plan screen will open with the same context
 * the user just came from so they don't have to scroll.
 *
 * Tiny and unobtrusive — sits as a gold-bordered pill near the top
 * of each tab so users don't need to memorise that Plan is the only
 * place to set up routines.
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../theme';

interface Props {
  /** What kind of practice we're on — shown in the label. */
  label?: string;          // e.g. "an exercise", "a yoga session"
  /** React-Navigation onPress — caller passes navigation?.navigate?.('Plan'). */
  onPress: () => void;
}

export const AddToPlanCta: React.FC<Props> = ({ label = 'this', onPress }) => (
  <TouchableOpacity style={styles.btn} onPress={onPress} activeOpacity={0.7}>
    <Text style={styles.icon}>🎯</Text>
    <View style={{ flex: 1 }}>
      <Text style={styles.title}>+ Plan {label} routine</Text>
      <Text style={styles.sub}>Add to your daily plan with a time + reminder</Text>
    </View>
    <Text style={styles.chev}>›</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  btn: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginVertical: SPACING.sm,
    paddingVertical: 12, paddingHorizontal: SPACING.md,
    backgroundColor: 'rgba(255,184,0,0.06)',
    borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.45)',
  },
  icon: { fontSize: 22, marginRight: 10 },
  title: { color: COLORS.gold, fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  sub: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  chev: { color: COLORS.gold, fontSize: 22, fontWeight: '700', paddingHorizontal: 4 },
});
