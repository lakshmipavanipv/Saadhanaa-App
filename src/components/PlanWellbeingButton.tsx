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
import type { RoutineCategory } from '../services/routineRepo';

interface Props {
  navigation?: { navigate?: (route: string, params?: object) => void };
  /**
   * Pre-selects a track in the planner wizard.
   *
   * Typed as the real union rather than `string`. It was `string`, and the
   * Meditation tab passed 'meditation' — which is not a RoutineCategory
   * ('meditate' is) — so the wizard opened with no category chosen and the
   * compiler had no reason to object.
   */
  preset?: RoutineCategory;
}

export const PlanWellbeingButton: React.FC<Props> = ({ navigation, preset }) => {
  const { palette } = useTheme();
  return (
    <TouchableOpacity
      style={{
        backgroundColor: palette.gold,
        paddingHorizontal: SPACING.md,
        paddingVertical: 6,
        borderRadius: 14,
        alignItems: 'center',
        marginLeft: SPACING.sm,
        // One word instead of two lines, so the tile stops being the biggest
        // thing in the header and gives the title back most of the row.
        minWidth: 64,
      }}
      onPress={() => navigation?.navigate?.('Plan', preset ? { preset } : undefined)}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Plan your wellbeing"
    >
      <Text style={{ fontSize: 20 }}>🎯</Text>
      <Text
        style={{
          color: '#1a1a1a', fontSize: 13, fontWeight: '800',
          marginTop: 1, textAlign: 'center',
        }}
      >
        Plan
      </Text>
    </TouchableOpacity>
  );
};
