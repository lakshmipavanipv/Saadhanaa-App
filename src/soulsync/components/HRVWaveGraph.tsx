import React from 'react';
import { View, Text, Dimensions, StyleSheet } from 'react-native';
import { LineChart } from 'react-native-chart-kit';
import { Circle, G } from 'react-native-svg';
import { COLORS } from '../../theme';

interface Props {
  bpmSeries: number[];        // last N seconds of BPM (rolling, capped)
  peakIndices: number[];      // indices in bpmSeries where peaks fired
  rmssd: number | null;
  improvementPct: number | null;
  isBaselineEstablished: boolean;
}

const CHART_W = Dimensions.get('window').width - 32;
const CHART_H = 180;

export const HRVWaveGraph: React.FC<Props> = ({
  bpmSeries, peakIndices, rmssd, improvementPct, isBaselineEstablished,
}) => {
  // chart-kit needs a non-empty dataset
  const data = bpmSeries.length ? bpmSeries : [70, 70];
  const labels = data.map((_, i) => (i % 15 === 0 && i < data.length ? `${i}s` : ''));

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <View>
          <Text style={styles.label}>LIVE BPM</Text>
          <Text style={styles.bpm}>{data[data.length - 1] ?? '—'}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.label}>RMSSD</Text>
          <Text style={styles.bpm}>
            {rmssd != null ? `${rmssd.toFixed(0)}ms` : '—'}
          </Text>
          <Text style={styles.improvement}>
            {!isBaselineEstablished
              ? 'Calibrating baseline…'
              : improvementPct != null && improvementPct > 0
                ? `+${improvementPct.toFixed(0)}% vs baseline`
                : improvementPct != null
                  ? `${improvementPct.toFixed(0)}% vs baseline`
                  : '—'}
          </Text>
        </View>
      </View>

      <LineChart
        data={{ labels, datasets: [{ data }] }}
        width={CHART_W}
        height={CHART_H}
        bezier
        withDots={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels={false}
        withHorizontalLabels={false}
        chartConfig={{
          backgroundGradientFrom: COLORS.darkBg,
          backgroundGradientTo: COLORS.cardBg,
          color: (o = 1) => `rgba(214,224,64,${o})`, // citron
          labelColor: () => COLORS.muted,
          strokeWidth: 2,
          propsForBackgroundLines: { stroke: 'transparent' },
        }}
        style={{ borderRadius: 12, marginVertical: 4 }}
        decorator={() => {
          const xPerPoint = (CHART_W - 50) / Math.max(1, data.length - 1);
          return (
            <G>
              {peakIndices.map((idx, k) => (
                <React.Fragment key={k}>
                  <Circle cx={30 + idx * xPerPoint} cy={CHART_H / 2} r={14} fill="rgba(214,224,64,0.18)" />
                  <Circle cx={30 + idx * xPerPoint} cy={CHART_H / 2} r={7}  fill="#fbff7a" />
                  <Circle cx={30 + idx * xPerPoint} cy={CHART_H / 2} r={3}  fill="#ffffff" />
                </React.Fragment>
              ))}
            </G>
          );
        }}
      />
      <Text style={styles.legend}>
        Glowing markers = +15% HRV improvement vs your baseline · {peakIndices.length} this session
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 12,
    backgroundColor: 'rgba(15, 18, 41, 0.6)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(214, 224, 64, 0.15)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  label: { fontSize: 10, color: COLORS.muted, letterSpacing: 1.5, fontWeight: '600' },
  bpm: { fontSize: 22, color: '#d6e040', fontWeight: '700' },
  improvement: { fontSize: 11, color: COLORS.gold, marginTop: 2, fontStyle: 'italic' },
  legend: {
    fontSize: 10, color: COLORS.muted, textAlign: 'center', marginTop: 4, fontStyle: 'italic',
  },
});
