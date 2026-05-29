/**
 * YogaMeditationWrapper — single tab hosting both Yoga and Meditation
 * screens. Top segmented bar (🧘 Yoga · 🪷 Meditate) flips between
 * the two without leaving the tab.
 *
 * Why these share a tab:
 *   Yoga (asanas + pranayama) and Meditation (breath / mantra) are both
 *   inner practices. Bundling them keeps the bottom bar lean and lets a
 *   user move between asana → pranayama → seated meditation as a single
 *   continuous flow.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { YogaScreen } from './YogaScreen';
import { MeditationScreen } from './MeditationScreen';

type Mode = 'yoga' | 'meditation';

export const YogaMeditationWrapper: React.FC<any> = (props) => {
  const [mode, setMode] = useState<Mode>('yoga');

  return (
    <View style={styles.container}>
      <View style={styles.segmentBar}>
        <TouchableOpacity
          style={[styles.segment, mode === 'yoga' && styles.segmentActive]}
          onPress={() => setMode('yoga')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, mode === 'yoga' && styles.segmentTextActive]}>
            🧘‍♀️  Yoga
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === 'meditation' && styles.segmentActive]}
          onPress={() => setMode('meditation')}
          activeOpacity={0.7}
        >
          <Text style={[styles.segmentText, mode === 'meditation' && styles.segmentTextActive]}>
            🪷  Meditate
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {mode === 'yoga'       && <YogaScreen       {...props} />}
        {mode === 'meditation' && <MeditationScreen {...props} />}
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
