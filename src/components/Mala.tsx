import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Pressable } from 'react-native';
import { COLORS } from '../theme';

const BEADS = 108;
const SIZE = 340;
const CENTER = SIZE / 2;
const OUTER_R = 158;
const INNER_R = 122;
const HALF = BEADS / 2; // 54
const BEAD_SIZE = 15;
const CENTER_SIZE = 168;

interface MalaProps {
  count: number;
  malas: number;
  onTap: () => void;
  popBead: number;
  beadColor?: string;
  beadHighlight?: string;
  materialName?: string;
}

// ─── Universal Citron color scheme ─────────────────────────────────
// Vibrant yellow-green, high-contrast against dark theme.
// Per-deity colors are intentionally IGNORED — single bright scheme
// for legibility (T7).
const CITRON_BEAD = '#d6e040';        // vibrant citron yellow-green
const CITRON_BORDER = '#fbff7a';      // bright lemon edge
const CITRON_SHINE = '#ffffe0';       // near-white highlight ellipse
const CITRON_DIM_FILL = 'rgba(85, 95, 25, 0.85)';   // unlit bead body
const CITRON_DIM_BORDER = 'rgba(214, 224, 64, 0.45)';

export const Mala: React.FC<MalaProps> = ({
  count,
  malas,
  onTap,
  popBead,
  beadColor,
  beadHighlight,
  materialName,
}) => {
  // T7: ignore per-deity color, use Universal Citron for high contrast.
  const doneColor = CITRON_BEAD;
  const doneBorder = CITRON_BORDER;
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
                left: b.x - BEAD_SIZE / 2,
                top: b.y - BEAD_SIZE / 2,
              },
              b.isDone && [
                styles.beadDone,
                {
                  backgroundColor: doneColor,
                  borderColor: doneBorder,
                  shadowColor: doneColor,
                },
              ],
              b.isPop && [
                styles.beadPop,
                { backgroundColor: doneBorder, borderColor: doneColor },
              ],
            ]}
          >
            {b.isDone && (
              <View
                style={[
                  styles.beadShine,
                  { backgroundColor: doneBorder },
                ]}
              />
            )}
          </View>
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
            pressed && { transform: [{ scale: 0.94 }] },
          ]}
        >
          <View style={styles.beadHaloRing} />
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
              {materialName && (
                <Text style={styles.materialName}>{materialName}</Text>
              )}
              <Text style={styles.tapHint}>👆 TAP TO COUNT</Text>
            </View>
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
    width: BEAD_SIZE,
    height: BEAD_SIZE,
    borderRadius: BEAD_SIZE / 2,
    backgroundColor: CITRON_DIM_FILL,
    borderWidth: 1,
    borderColor: CITRON_DIM_BORDER,
  },
  beadDone: {
    backgroundColor: CITRON_BEAD,
    borderColor: CITRON_BORDER,
    shadowColor: CITRON_BORDER,
    shadowOpacity: 1,
    shadowRadius: 5,
    elevation: 5,
  },
  beadShine: {
    position: 'absolute',
    width: 5,
    height: 4,
    borderRadius: 3,
    top: 2,
    left: 3,
    opacity: 0.85,
  },
  beadPop: {
    width: BEAD_SIZE + 6,
    height: BEAD_SIZE + 6,
    borderRadius: (BEAD_SIZE + 6) / 2,
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
    left: CENTER - CENTER_SIZE / 2,
    top: CENTER - CENTER_SIZE / 2,
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  beadShadow: {
    position: 'absolute',
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    top: 6,
    left: 0,
  },
  beadBody: {
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  beadFaceDark: {
    position: 'absolute',
    width: CENTER_SIZE,
    height: CENTER_SIZE,
    borderRadius: CENTER_SIZE / 2,
    backgroundColor: '#3d4408',
    borderWidth: 3,
    borderColor: CITRON_BEAD,
  },
  beadFaceMid: {
    position: 'absolute',
    width: CENTER_SIZE - 20,
    height: CENTER_SIZE - 20,
    borderRadius: (CENTER_SIZE - 20) / 2,
    backgroundColor: '#6b7a14',
    top: 10,
    left: 10,
  },
  beadFaceLight: {
    position: 'absolute',
    width: CENTER_SIZE - 36,
    height: CENTER_SIZE - 36,
    borderRadius: (CENTER_SIZE - 36) / 2,
    backgroundColor: '#1a1f3a',
    top: 18,
    left: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(212, 160, 23, 0.6)',
    paddingHorizontal: 8,
  },
  beadHaloRing: {
    position: 'absolute',
    width: CENTER_SIZE + 16,
    height: CENTER_SIZE + 16,
    borderRadius: (CENTER_SIZE + 16) / 2,
    top: -8,
    left: -8,
    borderWidth: 2,
    borderColor: CITRON_DIM_BORDER,
    borderStyle: 'dashed',
  },
  tapHint: {
    fontSize: 9,
    color: COLORS.saffron,
    fontWeight: '700',
    letterSpacing: 2,
    marginTop: 6,
  },
  materialName: {
    fontSize: 9,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  malaCount: {
    fontSize: 38,
    fontWeight: '700',
    color: CITRON_BEAD,
    lineHeight: 42,
  },
  malaLabel: {
    fontSize: 9,
    color: COLORS.muted,
    letterSpacing: 2.5,
    marginTop: 1,
  },
  divider: {
    width: 38,
    height: 1,
    backgroundColor: 'rgba(212, 160, 23, 0.35)',
    marginVertical: 4,
  },
  beadCount: {
    fontSize: 22,
    color: COLORS.cream,
    fontWeight: '600',
    lineHeight: 24,
  },
  beadLabelSmall: {
    fontSize: 8,
    color: COLORS.muted,
    letterSpacing: 0.8,
  },
});
