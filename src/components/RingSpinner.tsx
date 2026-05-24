/**
 * RingSpinner — visual replica of the physical Saadhana Ring.
 *
 * Models the actual hardware:
 *   • Black stainless-steel band
 *   • Bright LED segment display (citrine-gold digits)
 *   • Green sensor LED dot on the side (rotates around the band)
 *
 * Used as the universal "loading" indicator app-wide:
 *   • App boot ("Awakening your sadhana…")
 *   • AI Insights generation
 *   • Bluetooth scanning / pairing
 *   • Any async network call
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../theme';

export interface RingSpinnerProps {
  /** Diameter in px. Default 36. */
  size?: number;
  /** Override the LED segment color. Default citrine amber. */
  color?: string;
  /** Optional label rendered under the ring. */
  label?: string;
  /** Spin duration (ms) for one full rotation. Default 1600. */
  durationMs?: number;
  /** Wrapper style passthrough. */
  style?: ViewStyle;
  /** Show the green sensor LED orbiting the band. Default true. */
  showSensor?: boolean;
  /** Optional text inside the ring (mimics the LED segment display). */
  displayText?: string;
}

const CITRINE = '#FFB800';
const CITRINE_BRIGHT = '#FFE066';
const BAND_BLACK = '#0e0e12';
const BAND_HIGHLIGHT = '#2a2a30';
const SENSOR_GREEN = '#3ddc84';

export const RingSpinner: React.FC<RingSpinnerProps> = ({
  size = 36,
  color = CITRINE,
  label,
  durationMs = 1600,
  style,
  showSensor = true,
  displayText,
}) => {
  const rotation = useSharedValue(0);

  useEffect(() => {
    rotation.value = withRepeat(
      withTiming(360, { duration: durationMs, easing: Easing.linear }),
      -1,
      false
    );
    return () => { cancelAnimation(rotation); };
  }, [durationMs, rotation]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotation.value}deg` }],
  }));

  // Sensor dot rotates with the ring — fixed at "3 o'clock" on the band
  const bandThickness = Math.max(3, Math.round(size / 6));
  const sensorSize = Math.max(3, Math.round(size / 8));
  const ledFontSize = Math.max(7, Math.round(size / 5));

  return (
    <View style={[styles.wrap, style]}>
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center' }}>
        {/* Rotating band assembly */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: size / 2,
              borderWidth: bandThickness,
              borderColor: BAND_BLACK,
              // Subtle highlight on the upper half to mimic brushed steel
              borderTopColor: BAND_HIGHLIGHT,
              borderLeftColor: BAND_HIGHLIGHT,
            },
            ringStyle,
          ]}
        >
          {/* Green sensor LED — sits on the band edge, orbits with rotation */}
          {showSensor && (
            <View
              style={{
                position: 'absolute',
                width: sensorSize,
                height: sensorSize,
                borderRadius: sensorSize / 2,
                backgroundColor: SENSOR_GREEN,
                shadowColor: SENSOR_GREEN,
                shadowOpacity: 1,
                shadowRadius: sensorSize / 2,
                elevation: 4,
                top: -bandThickness / 2 - sensorSize / 2,
                left: size / 2 - sensorSize / 2,
              }}
            />
          )}
        </Animated.View>

        {/* Fixed LED display in the center (does NOT rotate — looking through the ring) */}
        {displayText !== undefined && (
          <View
            style={{
              width: size - bandThickness * 2 - 4,
              height: Math.max(10, Math.round(size / 3)),
              backgroundColor: '#000',
              borderRadius: 2,
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Text
              style={{
                color,
                fontSize: ledFontSize,
                fontWeight: '700',
                letterSpacing: 1,
                textShadowColor: CITRINE_BRIGHT,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 3,
              }}
            >
              {displayText}
            </Text>
          </View>
        )}
      </View>

      {label ? <Text style={[styles.label, { marginTop: size / 4 }]}>{label}</Text> : null}
    </View>
  );
};

/**
 * RingSpinnerLarge — Splash / full-screen variant. Shows the ring with
 * an animated cycling display ("108" → "OM" → "🪷") to evoke the physical
 * Saadhana Ring while it "wakes up".
 */
export const RingSpinnerLarge: React.FC<{ label?: string }> = ({ label }) => {
  const [tick, setTick] = React.useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => (t + 1) % 3), 900);
    return () => clearInterval(id);
  }, []);
  const display = ['108', 'OM', '~~'][tick];

  return (
    <View style={styles.largeWrap}>
      <RingSpinner size={120} durationMs={2000} displayText={display} />
      {label ? <Text style={styles.largeLabel}>{label}</Text> : null}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  label: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  largeWrap: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  largeLabel: {
    marginTop: 24,
    fontSize: 13,
    color: COLORS.cream,
    fontStyle: 'italic',
  },
});
