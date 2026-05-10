import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated } from 'react-native';
import { COLORS } from '../theme';

const BEADS = 108;
const SIZE = 320;
const RADIUS_OUTER = 145;
const RADIUS_INNER = 115;

interface MalaProps {
  count: number;
  malas: number;
  onTap: () => void;
  popBead: number;
}

export const Mala: React.FC<MalaProps> = ({ count, malas, onTap, popBead }) => {
  const beads = [];
  const totalRings = 2;
  const beadsPerRing = Math.ceil(BEADS / totalRings);

  for (let i = 0; i < BEADS; i++) {
    const ring = Math.floor(i / beadsPerRing);
    const radius = ring === 0 ? RADIUS_OUTER : RADIUS_INNER;
    const indexInRing = i % beadsPerRing;
    const angle = (indexInRing / beadsPerRing) * 2 * Math.PI - Math.PI / 2;
    const x = SIZE / 2 + radius * Math.cos(angle);
    const y = SIZE / 2 + radius * Math.sin(angle);
    const isDone = i < count;
    const isSumeru = i === BEADS - 1;
    const isPop = i === popBead;
    beads.push(
      <View
        key={i}
        style={[
          styles.bead,
          {
            left: x - 6,
            top: y - 6,
          },
          isDone && styles.beadDone,
          isSumeru && styles.sumeru,
          isPop && styles.beadPop,
        ]}
      />
    );
  }

  const progress = count / BEADS;

  return (
    <View style={styles.container}>
      <View style={styles.malaWrap}>
        {beads}
        <TouchableOpacity
          style={styles.center}
          onPress={onTap}
          activeOpacity={0.85}
        >
          <View style={styles.glow} />
          <View style={styles.centerInner}>
            <Text style={styles.malaCount}>{malas}</Text>
            <Text style={styles.malaLabel}>MALA{malas !== 1 ? 'S' : ''}</Text>
            <View style={styles.divider} />
            <Text style={styles.beadCount}>{count}</Text>
            <Text style={styles.beadLabel}>of 108</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 8,
  },
  malaWrap: {
    width: SIZE,
    height: SIZE,
    position: 'relative',
  },
  bead: {
    position: 'absolute',
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.4)',
  },
  beadDone: {
    backgroundColor: COLORS.gold,
    borderColor: '#fff5d6',
    shadowColor: COLORS.gold,
    shadowOpacity: 0.8,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 4,
  },
  beadPop: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: COLORS.saffron,
    borderColor: '#ffd6a8',
  },
  sumeru: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: COLORS.saffron,
    borderColor: COLORS.gold,
    borderWidth: 2.5,
    shadowColor: COLORS.saffron,
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 6,
  },
  center: {
    position: 'absolute',
    left: SIZE / 2 - 100,
    top: SIZE / 2 - 100,
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: 'center',
    alignItems: 'center',
  },
  glow: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 3,
    borderColor: 'rgba(212, 160, 23, 0.5)',
    shadowColor: COLORS.gold,
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  centerInner: {
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(26, 31, 58, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: COLORS.gold,
  },
  malaCount: {
    fontSize: 56,
    fontWeight: '700',
    color: COLORS.gold,
    lineHeight: 60,
  },
  malaLabel: {
    fontSize: 11,
    color: COLORS.muted,
    letterSpacing: 3,
    marginTop: 2,
  },
  divider: {
    width: 50,
    height: 1,
    backgroundColor: 'rgba(212, 160, 23, 0.3)',
    marginVertical: 8,
  },
  beadCount: {
    fontSize: 28,
    color: COLORS.cream,
    fontWeight: '600',
  },
  beadLabel: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 1,
    marginTop: 2,
  },
});
