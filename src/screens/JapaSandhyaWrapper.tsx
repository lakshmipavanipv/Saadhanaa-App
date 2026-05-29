/**
 * JapaSandhyaWrapper — top-segmented tab that hosts either the Japa screen
 * (free mantra-japa with deities + mala) or the Sandhya Vandanam screen
 * (the 3 daily junctures: sunrise / noon / sunset).
 *
 * Why these two share a tab:
 *   Sandhya Vandanam is *structured japa at fixed times* — it is the same
 *   spiritual activity (mantra repetition) on a daily schedule. Keeping them
 *   together under one "Japa" tab reduces tab count and matches how a
 *   Hindu sadhaka thinks about their day.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { JapaScreen } from './JapaScreen';
import { SandhyaScreen } from './SandhyaScreen';

type Mode = 'japa' | 'sandhya';

export const JapaSandhyaWrapper: React.FC<any> = (props) => {
  const [mode, setMode] = useState<Mode>('japa');

  return (
    <View style={styles.container}>
      {/* Top segmented bar */}
      <View style={styles.segmentBar}>
        <TouchableOpacity
          style={[styles.segment, mode === 'japa' && styles.segmentActive]}
          onPress={() => setMode('japa')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, mode === 'japa' && styles.segmentTextActive]}>
            📿  Japa
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === 'sandhya' && styles.segmentActive]}
          onPress={() => setMode('sandhya')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, mode === 'sandhya' && styles.segmentTextActive]}>
            🌅  Sandhya japa
          </Text>
        </TouchableOpacity>
      </View>

      {/* Active sub-screen — Japa gets a callback so its "Sadhana ▾"
          menu can flip the wrapper to the Sandhya sub-tab. */}
      <View style={styles.body}>
        {mode === 'japa'    && <JapaScreen    {...props} onOpenSandhya={() => setMode('sandhya')} />}
        {mode === 'sandhya' && <SandhyaScreen {...props} />}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  segmentBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 9,
  },
  segmentActive: {
    backgroundColor: 'rgba(212,160,23,0.18)',
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  segmentText: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '600',
  },
  segmentTextActive: {
    color: COLORS.gold,
    fontWeight: '700',
  },
  body: { flex: 1 },
});
