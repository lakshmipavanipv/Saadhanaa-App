/**
 * PulseHighlight — wraps a child with a slow pulsing glow + scale animation
 * to draw user attention to a specific UI element (e.g., the Soulsync
 * button on the Japa screen).
 *
 * Usage:
 *   <PulseHighlight active={shouldHint} tooltip="Tap to start session">
 *     <SoulsyncButton />
 *   </PulseHighlight>
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS, SPACING } from '../theme';

interface Props {
  active: boolean;
  /** Optional tooltip text rendered above the highlighted area. */
  tooltip?: string;
  color?: string;
  children: React.ReactNode;
  style?: ViewStyle;
}

const HIGHLIGHT_GOLD = '#FFB800';

export const PulseHighlight: React.FC<Props> = ({
  active,
  tooltip,
  color = HIGHLIGHT_GOLD,
  children,
  style,
}) => {
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (active) {
      // Slow breathing 0 → 1 → 0 every 1.4s
      pulse.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }),
          withTiming(0, { duration: 700, easing: Easing.inOut(Easing.quad) })
        ),
        -1, false
      );
    } else {
      pulse.value = withTiming(0, { duration: 300 });
    }
    return () => cancelAnimation(pulse);
  }, [active, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.3 + pulse.value * 0.7,
    transform: [{ scale: 1 + pulse.value * 0.04 }],
  }));

  return (
    <View style={[styles.wrap, style]}>
      {tooltip && active && (
        <Animated.View style={[styles.tooltip, glowStyle, { borderColor: color }]}>
          <Text style={[styles.tooltipText, { color }]}>{tooltip}</Text>
          <Text style={[styles.tooltipArrow, { color }]}>▼</Text>
        </Animated.View>
      )}
      {active && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.glowRing,
            glowStyle,
            { borderColor: color, shadowColor: color },
          ]}
        />
      )}
      <View>{children}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { position: 'relative' },
  glowRing: {
    position: 'absolute',
    top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 16,
    borderWidth: 2.5,
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 12,
  },
  tooltip: {
    position: 'absolute',
    bottom: '110%',
    alignSelf: 'center',
    backgroundColor: COLORS.darkBg,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    zIndex: 100,
    alignItems: 'center',
  },
  tooltipText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
  tooltipArrow: {
    fontSize: 14,
    marginTop: -2,
    marginBottom: -8,
    lineHeight: 14,
  },
});
