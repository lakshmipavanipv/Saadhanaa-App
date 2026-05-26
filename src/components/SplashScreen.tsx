/**
 * SplashScreen — full-screen "awakening" splash shown during app boot.
 *
 * Layered animation:
 *   1. Deep dark-blue gradient background (using View layers — no SVG dep)
 *   2. Faint cosmic ॐ glow behind everything
 *   3. Two mandala rings emanating outward (pulse + fade)
 *   4. Slowly-rotating outer dashed ring (subtle motion)
 *   5. Center lotus 🪷 with breathing scale + soft glow halo
 *   6. "SAADHANA" wordmark with citrine gradient feel
 *   7. Sanskrit tagline + English subtitle
 *   8. Three sequenced loading dots at bottom
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
  Easing,
  cancelAnimation,
  interpolate,
} from 'react-native-reanimated';
import { COLORS } from '../theme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const CITRINE = '#FFB800';
const CITRINE_BRIGHT = '#FFE066';

interface Props {
  label?: string;
}

export const SplashScreen: React.FC<Props> = ({ label = 'Awakening your sadhana' }) => {
  // ── Animation drivers ──
  const lotusScale = useSharedValue(0.9);
  const lotusGlow  = useSharedValue(0.4);
  const outerRot   = useSharedValue(0);
  const mandala1   = useSharedValue(0);
  const mandala2   = useSharedValue(0);
  const omFade     = useSharedValue(0.05);
  const dot1       = useSharedValue(0.3);
  const dot2       = useSharedValue(0.3);
  const dot3       = useSharedValue(0.3);
  const titleFade  = useSharedValue(0);

  useEffect(() => {
    // Lotus breathing (3s in, 3s out)
    lotusScale.value = withRepeat(
      withSequence(
        withTiming(1.06, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.94, { duration: 3000, easing: Easing.inOut(Easing.quad) })
      ), -1, false
    );
    lotusGlow.value = withRepeat(
      withSequence(
        withTiming(1.0, { duration: 3000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.4, { duration: 3000, easing: Easing.inOut(Easing.quad) })
      ), -1, false
    );

    // Slow outer ring rotation
    outerRot.value = withRepeat(
      withTiming(360, { duration: 14000, easing: Easing.linear }),
      -1, false
    );

    // Mandala ripples (staggered)
    mandala1.value = withRepeat(
      withTiming(1, { duration: 3500, easing: Easing.out(Easing.quad) }),
      -1, false
    );
    mandala2.value = withDelay(1500, withRepeat(
      withTiming(1, { duration: 3500, easing: Easing.out(Easing.quad) }),
      -1, false
    ));

    // ॐ background fade
    omFade.value = withRepeat(
      withSequence(
        withTiming(0.10, { duration: 4500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.04, { duration: 4500, easing: Easing.inOut(Easing.quad) })
      ), -1, false
    );

    // Title fade-in
    titleFade.value = withDelay(300, withTiming(1, { duration: 1200 }));

    // Loading dots
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

    return () => {
      [lotusScale, lotusGlow, outerRot, mandala1, mandala2, omFade,
       dot1, dot2, dot3, titleFade].forEach(cancelAnimation);
    };
  }, []);

  // ── Animated styles ──
  const lotusAnim = useAnimatedStyle(() => ({
    transform: [{ scale: lotusScale.value }],
  }));
  const glowAnim = useAnimatedStyle(() => ({
    opacity: lotusGlow.value * 0.6,
    transform: [{ scale: 1 + lotusGlow.value * 0.15 }],
  }));
  const outerRotAnim = useAnimatedStyle(() => ({
    transform: [{ rotate: `${outerRot.value}deg` }],
  }));
  const mandalaStyle = (sv: typeof mandala1) => useAnimatedStyle(() => ({
    opacity: interpolate(sv.value, [0, 0.4, 1], [0.6, 0.4, 0]),
    transform: [{ scale: interpolate(sv.value, [0, 1], [0.6, 2.2]) }],
  }));
  const mandala1Anim = mandalaStyle(mandala1);
  const mandala2Anim = mandalaStyle(mandala2);
  const omAnim = useAnimatedStyle(() => ({ opacity: omFade.value }));
  const titleAnim = useAnimatedStyle(() => ({
    opacity: titleFade.value,
    transform: [{ translateY: interpolate(titleFade.value, [0, 1], [10, 0]) }],
  }));
  const dotStyle = (sv: typeof dot1) => useAnimatedStyle(() => ({ opacity: sv.value }));
  const dot1Anim = dotStyle(dot1);
  const dot2Anim = dotStyle(dot2);
  const dot3Anim = dotStyle(dot3);

  return (
    <View style={styles.root}>
      {/* Gradient backdrop — stacked translucent layers */}
      <View style={styles.bgLayer1} />
      <View style={styles.bgLayer2} />

      {/* ॐ behind everything */}
      <Animated.Text style={[styles.om, omAnim]}>ॐ</Animated.Text>

      {/* Mandala ripple rings (centered) */}
      <Animated.View style={[styles.mandala, mandala1Anim]} />
      <Animated.View style={[styles.mandala, mandala2Anim]} />

      {/* Outer slowly-rotating dashed ring */}
      <Animated.View style={[styles.outerRing, outerRotAnim]} />

      {/* Lotus + halo */}
      <Animated.View style={[styles.lotusGlow, glowAnim]} />
      <Animated.View style={[styles.lotusWrap, lotusAnim]}>
        <Text style={styles.lotus}>🪷</Text>
      </Animated.View>

      {/* Title block */}
      <Animated.View style={[styles.titleBlock, titleAnim]}>
        <Text style={styles.brand}>SAADHANA</Text>
        <Text style={styles.tagline}>सत्यमेव जयते</Text>
        <Text style={styles.subtitle}>Sacred practice · Modern science</Text>
      </Animated.View>

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
    backgroundColor: '#040814',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },

  // Gradient backdrop via stacked translucent radial-ish layers
  bgLayer1: {
    position: 'absolute',
    width: SCREEN_W * 1.5,
    height: SCREEN_W * 1.5,
    borderRadius: SCREEN_W * 0.75,
    backgroundColor: '#0a1428',
    opacity: 0.95,
  },
  bgLayer2: {
    position: 'absolute',
    width: SCREEN_W * 0.9,
    height: SCREEN_W * 0.9,
    borderRadius: SCREEN_W * 0.45,
    backgroundColor: 'rgba(255, 184, 0, 0.05)',
  },

  // Faint cosmic ॐ
  om: {
    position: 'absolute',
    fontSize: SCREEN_W * 0.7,
    color: CITRINE,
    fontWeight: '300',
    textAlign: 'center',
    top: SCREEN_H * 0.18,
  },

  // Mandala ripple
  mandala: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 184, 0, 0.5)',
  },

  // Outer dashed slow-rotating ring
  outerRing: {
    position: 'absolute',
    width: 240,
    height: 240,
    borderRadius: 120,
    borderWidth: 1,
    borderColor: 'rgba(255, 224, 102, 0.25)',
    borderStyle: 'dashed',
  },

  // Lotus halo glow
  lotusGlow: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255, 184, 0, 0.35)',
    shadowColor: CITRINE,
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 30,
  },

  lotusWrap: {
    width: 140,
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lotus: {
    fontSize: 110,
  },

  // Title block (positioned below center)
  titleBlock: {
    position: 'absolute',
    bottom: SCREEN_H * 0.22,
    alignItems: 'center',
  },
  brand: {
    fontSize: 38,
    fontWeight: '800',
    color: COLORS.cream,
    letterSpacing: 10,
    marginBottom: 8,
    textShadowColor: CITRINE,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tagline: {
    fontSize: 17,
    color: CITRINE_BRIGHT,
    fontWeight: '500',
    letterSpacing: 2,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },

  // Loading dots
  dotsRow: {
    position: 'absolute',
    bottom: SCREEN_H * 0.12,
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: CITRINE,
  },

  // Status label
  label: {
    position: 'absolute',
    bottom: SCREEN_H * 0.07,
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    letterSpacing: 0.5,
  },
});
