import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { COLORS } from '../theme';

const BEADS = 108;
const SIZE = 340;
const CENTER = SIZE / 2;
const OUTER_R = 152;
const INNER_R = 110;
const HALF = BEADS / 2; // 54

interface MalaProps {
  count: number;
  malas: number;
  onTap: () => void;
  popBead: number;
}

export const Mala: React.FC<MalaProps> = ({ count, malas, onTap, popBead }) => {
  // Beads start at top-right (just clockwise of Meru) and wrap around back to Meru.
  // First 54 = outer ring, next 54 = inner ring. Both go clockwise from 12 o'clock.
  const beads = [];
  for (let i = 0; i < BEADS; i++) {
    const ringIdx = i < HALF ? 0 : 1;
    const r = ringIdx === 0 ? OUTER_R : INNER_R;
    const localIdx = i - ringIdx * HALF; // 0..53
    // Angle: start just past 12 (one-step clockwise from Meru) and wrap fully around.
    // 54 beads spaced over 360°, with the first slightly clockwise of the top.
    const slotAngle = (2 * Math.PI) / HALF;
    const angle = -Math.PI / 2 + (localIdx + 0.5) * slotAngle;
    const x = CENTER + r * Math.cos(angle);
    const y = CENTER + r * Math.sin(angle);
    const isDone = i < count;
    const isPop = i === popBead;
    beads.push({ x, y, isDone, isPop, ringIdx, key: i });
  }

  // Meru bead — fixed at the very top of the outer ring
  const meruX = CENTER;
  const meruY = CENTER - OUTER_R;

  return (
    <View style={styles.container}>
      <View style={styles.malaWrap}>
        {/* Subtle string circle */}
        <View
          style={[
            styles.stringRing,
            {
              width: OUTER_R * 2 + 14,
              height: OUTER_R * 2 + 14,
              borderRadius: OUTER_R + 7,
              top: CENTER - OUTER_R - 7,
              left: CENTER - OUTER_R - 7,
            },
          ]}
        />
        <View
          style={[
            styles.stringRing,
            {
              width: INNER_R * 2 + 14,
              height: INNER_R * 2 + 14,
              borderRadius: INNER_R + 7,
              top: CENTER - INNER_R - 7,
              left: CENTER - INNER_R - 7,
              opacity: 0.4,
            },
          ]}
        />

        {beads.map(b => (
          <View
            key={b.key}
            style={[
              styles.bead,
              {
                left: b.x - 7,
                top: b.y - 7,
              },
              b.isDone && styles.beadDone,
              b.isPop && styles.beadPop,
            ]}
          />
        ))}

        {/* Meru / Sumeru bead — distinct, slightly larger, never lit */}
        <View
          style={[
            styles.meru,
            {
              left: meruX - 14,
              top: meruY - 14,
            },
          ]}
        >
          <View style={styles.meruInner} />
          <View style={styles.meruHighlight} />
        </View>

        {/* Center clickable BEAD — the japa bead */}
        <Pressable
          onPress={onTap}
          style={({ pressed }) => [
            styles.center,
            pressed && { transform: [{ scale: 0.97 }] },
          ]}
        >
          <View style={styles.beadShadow} />
          <View style={styles.beadBody}>
            <View style={styles.beadFaceDark} />
            <View style={styles.beadFaceMid} />
            <View style={styles.beadFaceLight}>
              <Text style={styles.malaCount}>{malas}</Text>
              <Text style={styles.malaLabel}>MALA{malas !== 1 ? 'S' : ''}</Text>
              <View style={styles.divider} />
              <Text style={styles.beadCount}>{count}</Text>
              <Text style={styles.beadLabelSmall}>of 108</Text>
            </View>
            {/* Specular highlight (top-left) */}
            <View style={styles.specular} />
          </View>
        </Pressable>
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
  stringRing: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.18)',
    borderStyle: 'dashed',
  },
  bead: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'rgba(80, 60, 30, 0.85)',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.45)',
  },
  beadDone: {
    backgroundColor: COLORS.gold,
    borderColor: '#fff5d6',
    shadowColor: COLORS.gold,
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 5,
  },
  beadPop: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: COLORS.saffron,
    borderColor: '#ffd6a8',
  },
  meru: {
    position: 'absolute',
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.saffron,
    borderWidth: 2.5,
    borderColor: COLORS.gold,
    shadowColor: COLORS.saffron,
    shadowOpacity: 1,
    shadowRadius: 12,
    elevation: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  meruInner: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#ffb380',
  },
  meruHighlight: {
    position: 'absolute',
    top: 4,
    left: 5,
    width: 7,
    height: 5,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 245, 220, 0.85)',
  },

  // ── BIG center japa bead — sphere-like 3D feel via stacked ovals ──
  center: {
    position: 'absolute',
    left: CENTER - 95,
    top: CENTER - 95,
    width: 190,
    height: 190,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beadShadow: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    top: 8,
    left: 0,
  },
  beadBody: {
    width: 190,
    height: 190,
    borderRadius: 95,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  beadFaceDark: {
    position: 'absolute',
    width: 190,
    height: 190,
    borderRadius: 95,
    backgroundColor: '#3d2a08',
    borderWidth: 3,
    borderColor: COLORS.gold,
  },
  beadFaceMid: {
    position: 'absolute',
    width: 168,
    height: 168,
    borderRadius: 84,
    backgroundColor: '#5e3f10',
    top: 11,
    left: 11,
  },
  beadFaceLight: {
    position: 'absolute',
    width: 148,
    height: 148,
    borderRadius: 74,
    backgroundColor: '#1a1f3a',
    top: 21,
    left: 21,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.6)',
  },
  specular: {
    position: 'absolute',
    width: 38,
    height: 22,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 245, 220, 0.55)',
    top: 26,
    left: 42,
    transform: [{ rotate: '-25deg' }],
  },
  malaCount: {
    fontSize: 50,
    fontWeight: '700',
    color: COLORS.gold,
    lineHeight: 56,
  },
  malaLabel: {
    fontSize: 10,
    color: COLORS.muted,
    letterSpacing: 3,
    marginTop: 1,
  },
  divider: {
    width: 44,
    height: 1,
    backgroundColor: 'rgba(212, 160, 23, 0.35)',
    marginVertical: 6,
  },
  beadCount: {
    fontSize: 26,
    color: COLORS.cream,
    fontWeight: '600',
  },
  beadLabelSmall: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 1,
    marginTop: 1,
  },
});
