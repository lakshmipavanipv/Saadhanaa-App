/**
 * WeekSparkline — compact 7-bar chart showing the last 7 days of a metric.
 *
 *   Bars scale to the largest value in the series.
 *   Today's bar is highlighted gold.
 *   Used inside ActivityMetricCard (Samsung-Health-style block).
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

interface Props {
  /** Series of 7 values, oldest first → today last. */
  values: number[];
  /** Day labels (e.g. ['M','T','W','T','F','S','S']). */
  labels?: string[];
  /** Height of the chart. */
  height?: number;
  /** Show the numeric peak value. */
  showPeak?: boolean;
}

export const WeekSparkline: React.FC<Props> = ({
  values, labels = ['M','T','W','T','F','S','S'], height = 56, showPeak = false,
}) => {
  const peak = Math.max(1, ...values);
  const todayIdx = values.length - 1;

  return (
    <View>
      <View style={[styles.barRow, { height }]}>
        {values.map((v, i) => {
          const h = Math.max(2, (v / peak) * (height - 14));
          const isToday = i === todayIdx;
          return (
            <View key={i} style={styles.barCol}>
              <View style={[
                styles.bar,
                { height: h },
                isToday && styles.barToday,
              ]} />
            </View>
          );
        })}
      </View>
      <View style={styles.labelRow}>
        {labels.map((l, i) => (
          <Text key={i} style={[
            styles.labelText,
            i === todayIdx && styles.labelToday,
          ]}>{l}</Text>
        ))}
      </View>
      {showPeak && peak > 1 && (
        <Text style={styles.peakNote}>peak {peak.toLocaleString()}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  barRow: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    paddingHorizontal: 2,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: {
    width: 12, borderTopLeftRadius: 3, borderTopRightRadius: 3,
    backgroundColor: 'rgba(212,160,23,0.25)',
  },
  barToday: { backgroundColor: COLORS.gold },
  labelRow: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginTop: 2,
  },
  labelText: { flex: 1, textAlign: 'center', fontSize: 9, color: COLORS.muted, fontWeight: '600' },
  labelToday: { color: COLORS.gold, fontWeight: '800' },
  peakNote: { fontSize: 10, color: COLORS.muted, fontStyle: 'italic', marginTop: 2, textAlign: 'right' },
});
