/**
 * PlanWellbeingButton — the gold "🎯 Plan Your Wellbeing" accent button.
 *
 * Extracted from ExerciseScreen, which had it inline. It now appears on Yoga
 * & Meditation, Japa and Home as well, and a shared component is the only way
 * those stay identical — four hand-copied blocks drift the moment one is
 * touched.
 *
 * Intended placement is the one Exercise established: top-right of the screen
 * header, beside the title, inside a row that puts the title in a flex:1 View.
 */

import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
import { SPACING } from '../theme';
import { useTheme } from '../ThemeContext';

interface Props {
  navigation?: { navigate?: (route: string, params?: object) => void };
  /** Pre-selects a track in the planner wizard, e.g. 'exercise' | 'yoga' | 'japa'. */
  preset?: string;
}

export const PlanWellbeingButton: React.FC<Props> = ({ navigation, preset }) => {
  const { palette } = useTheme();
  return (
    <TouchableOpacity
      style={{
        backgroundColor: palette.gold,
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm,
        borderRadius: 14,
        alignItems: 'center',
        marginLeft: SPACING.sm,
        minWidth: 96,
      }}
      onPress={() => navigation?.navigate?.('Plan', preset ? { preset } : undefined)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Plan your wellbeing"
    >
      <Text style={{ fontSize: 24 }}>🎯</Text>
      <Text
        style={{
          color: '#1a1a1a', fontSize: 12, fontWeight: '800',
          marginTop: 2, textAlign: 'center',
        }}
      >
        Plan Your{'\n'}Wellbeing
      </Text>
    </TouchableOpacity>
  );
};
