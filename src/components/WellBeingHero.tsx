/**
 * WellBeingHero — the animated lotus + dashed mandala + halo + "BODY & SOUL"
 * wordmark, extracted from the onboarding Welcome screen so it can be
 * reused as the top banner on the Home (Dashboard) tab too.
 *
 *   ┌───────────────────────────────────────┐
 *   │       ✦      ── ── ── ──         ✦    │   ← rotating dashed ring
 *   │         ╱   ◯ glow halo  ╲             │
 *   │        │       🪷           │           │   ← breathing lotus
 *   │         ╲                  ╱           │
 *   │       ✦      ── ── ── ──         ✦    │
 *   │                                       │
 *   │             BODY & SOUL                │
 *   │       Where vitals meet sadhana       │
 *   └───────────────────────────────────────┘
 *
 * Props:
 *   • `compact` — collapses vertical padding so it fits as a tab header
 *     (Dashboard uses it this way). Default is the full onboarding size.
 *
 * Animation:
 *   • Lotus breathes (scale 0.95 ↔ 1.06) on a 2.4 s loop.
 *   • Halo glow pulses with the breath (opacity 0.35 ↔ 0.75).
 *   • Outer dashed ring rotates 360° over 12 s.
 *   • Title block fades in over 900 ms on mount.
 *
 * useNativeDriver = true throughout, so it's smooth even on low-end phones.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing } from 'react-native';
import { COLORS } from '../theme';

interface Props {
  /** Compact mode shrinks the hero vertically for the Home tab header. */
  compact?: boolean;
}

export const WellBeingHero: React.FC<Props> = ({ compact = false }) => {
  const breath = useRef(new Animated.Value(0)).current;
  const rotate = useRef(new Animated.Value(0)).current;
  const fade   = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breath, {
          toValue: 1, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
        Animated.timing(breath, {
          toValue: 0, duration: 2400, easing: Easing.inOut(Easing.quad), useNativeDriver: true,
        }),
      ])
    ).start();
    Animated.loop(
      Animated.timing(rotate, {
        toValue: 1, duration: 12000, easing: Easing.linear, useNativeDriver: true,
      })
    ).start();
    Animated.timing(fade, {
      toValue: 1, duration: 900, useNativeDriver: true,
    }).start();
  }, []);

  const scale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.95, 1.06] });
  const glow  = breath.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.75] });
  const spin  = rotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // ── Compact sizes for the Dashboard header ──
  const dims = compact ? {
    rootPad:  20,
    ringSize: 180, ringTop: 8,
    glowSize: 130, glowTop: 32,
    lotusSize: 110, lotusFont: 80,
    titleMt: 16,
    brandSize: 24, brandLetter: 3,
    taglineSize: 11,
  } : {
    rootPad: 60,
    ringSize: 260, ringTop: 90,
    glowSize: 180, glowTop: 130,
    lotusSize: 160, lotusFont: 110,
    titleMt: 30,
    brandSize: 32, brandLetter: 4,
    taglineSize: 13,
  };

  return (
    <View style={[styles.root, { paddingTop: dims.rootPad, paddingBottom: dims.rootPad * 0.6 }]}>
      <Animated.View
        style={[
          styles.ring,
          {
            top: dims.ringTop,
            width: dims.ringSize, height: dims.ringSize,
            borderRadius: dims.ringSize / 2,
            transform: [{ rotate: spin }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.glow,
          {
            top: dims.glowTop,
            width: dims.glowSize, height: dims.glowSize,
            borderRadius: dims.glowSize / 2,
            opacity: glow,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.lotusWrap,
          { width: dims.lotusSize, height: dims.lotusSize, transform: [{ scale }] },
        ]}
      >
        <Text style={[styles.lotus, { fontSize: dims.lotusFont }]}>🪷</Text>
      </Animated.View>

      <Animated.View style={[styles.titleBlock, { marginTop: dims.titleMt, opacity: fade }]}>
        <Text style={[styles.brand, { fontSize: dims.brandSize, letterSpacing: dims.brandLetter }]}>
          BODY &amp; SOUL
        </Text>
        <Text style={[styles.tagline, { fontSize: dims.taglineSize }]}>
          Where vitals meet sadhana
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: 'rgba(255, 224, 102, 0.30)',
    borderStyle: 'dashed',
  },
  glow: {
    position: 'absolute',
    backgroundColor: 'rgba(255, 184, 0, 0.30)',
    shadowColor: '#FFB800',
    shadowOpacity: 1,
    shadowRadius: 60,
    elevation: 30,
  },
  lotusWrap: { alignItems: 'center', justifyContent: 'center' },
  lotus: {},
  titleBlock: { alignItems: 'center' },
  brand: {
    fontWeight: '800',
    color: COLORS.cream,
    marginBottom: 6,
    textShadowColor: '#FFB800',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tagline: {
    color: COLORS.gold,
    fontStyle: 'italic',
    letterSpacing: 1.5,
  },
});
