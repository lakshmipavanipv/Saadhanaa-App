/**
 * RangeBar — the Day / Week / Month switch and the week strip beneath it,
 * bound to the shared range.
 *
 * The same two controls already sit at the top of every health report. This
 * wraps them so Japa, Yoga, Meditate and Exercise get exactly that control,
 * reading and writing the one shared date rather than each keeping its own.
 * Tapping Tuesday in Japa moves Health to Tuesday, and back again.
 *
 * `quality` is optional: the health screens colour each day's dot by how the
 * reading went, and a practice screen can pass the same map to show which
 * days it actually practised. Passing nothing leaves the dots empty, which is
 * honest — a dot with no data behind it would be decoration.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { ViewSwitch, WeekStrip, type DayQuality } from './HealthPrimitives';
import { useRange } from './rangeContext';
import { SPACING } from '../../theme';

interface Props {
  /** Dot colour per ISO day, when the screen has something real to say. */
  quality?: Record<string, DayQuality>;
  /** Accent for the selected day. Defaults to the app's gold. */
  accent?: string;
}

export const RangeBar: React.FC<Props> = ({ quality, accent }) => {
  const { view, setView, selected, setSelected } = useRange();
  return (
    <View style={styles.wrap}>
      <ViewSwitch value={view} onChange={setView} />
      <WeekStrip
        selected={selected}
        onSelect={setSelected}
        quality={quality ?? {}}
        accent={accent}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  // The practice screens lay their own cards out with horizontal padding of
  // SPACING.md, which the health screens apply further in. Matching it here
  // keeps the strip flush with the cards below it on every screen.
  wrap: { paddingHorizontal: SPACING.md },
});
