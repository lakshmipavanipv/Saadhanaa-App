/**
 * SplashScreen — full-screen boot / buffering screen.
 *
 * v71: simplified to a single brand moment — the animated BodySoulLogo
 * (infinity ribbon drawing itself + lotus blossom + "BODY & SOUL" wordmark)
 * over the deep navy, with three sequenced loading dots and a status label.
 * The old ॐ yantra + mandala rings + lotus emoji were removed per request.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../theme';
import { BodySoulLogo } from '../soulsync/components/BodySoulLogo';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CITRINE = '#FFB800';

interface Props {
  label?: string;
}

export const SplashScreen: React.FC<Props> = ({ label = 'Awakening your body & soul' }) => {
  const dot1 = useSharedValue(0.3);
  const dot2 = useSharedValue(0.3);
  const dot3 = useSharedValue(0.3);

  useEffect(() => {
    const dotCycle = (sv: typeof dot1, delay: number) => {
      sv.value = withDelay(delay, withRepeat(
        withSequence(
          withTiming(1, { duration: 500 }),
          withTiming(0.3, { duration: 500 })
        ), -1, false
      ));
    };
    dotCycle(dot1, 0);
    dotCycle(dot2, 200);
    dotCycle(dot3, 400);
    return () => { [dot1, dot2, dot3].forEach(cancelAnimation); };
  }, []);

  const dotStyle = (sv: typeof dot1) => useAnimatedStyle(() => ({ opacity: sv.value }));
  const dot1Anim = dotStyle(dot1);
  const dot2Anim = dotStyle(dot2);
  const dot3Anim = dotStyle(dot3);

  return (
    <View style={styles.root}>
      {/* Soft warm halo behind the logo */}
      <View style={styles.halo} />

      {/* The animated brand logo — draws the ∞ ribbon, blooms the lotus,
          and fades in the "BODY & SOUL" wordmark, then breathes gently. */}
      <BodySoulLogo width={Math.min(300, SCREEN_W * 0.74)} />

      {/* Loading dots */}
      <View style={styles.dotsRow}>
        <Animated.View style={[styles.dot, dot1Anim]} />
        <Animated.View style={[styles.dot, dot2Anim]} />
        <Animated.View style={[styles.dot, dot3Anim]} />
      </View>

      {/* Status label */}
      <Text style={styles.label}>{label}…</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    width: SCREEN_W,
    height: SCREEN_H,
    backgroundColor: '#0a0e27',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  halo: {
    position: 'absolute',
    width: SCREEN_W * 0.8,
    height: SCREEN_W * 0.8,
    borderRadius: SCREEN_W * 0.4,
    backgroundColor: 'rgba(255, 184, 0, 0.06)',
  },
  dotsRow: {
    position: 'absolute',
    bottom: SCREEN_H * 0.14,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CITRINE,
  },
  label: {
    position: 'absolute',
    bottom: SCREEN_H * 0.08,
    fontSize: 12,
    color: COLORS.muted,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
});
