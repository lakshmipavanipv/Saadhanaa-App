/**
 * BodySoulLogo — animated SVG logo for the Soulsync brand.
 *
 *   • Infinity ribbon drawn from blue → purple → gold via a linearGradient.
 *   • Lotus (5 petals) blossoms on top of the infinity's center crossing.
 *   • Brand text "BODY & SOUL" fades in below.
 *
 * Animation:
 *   1. On mount the ribbon paints itself in over ~1.8 s (strokeDashoffset).
 *   2. Lotus + text fade in over 400 ms once the ribbon is done.
 *   3. Idle: gentle 2.5 s breath-cycle scale pulse, repeating.
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import Svg, { Path, Defs, LinearGradient, Stop, G, Ellipse } from 'react-native-svg';
import { COLORS } from '../../theme';

const VBW = 280;
const VBH = 110;

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedG = Animated.createAnimatedComponent(G);

// Single continuous cubic-Bezier loop — the ∞ symbol.
const INF_PATH =
  'M 50 65 C 50 30, 90 30, 140 65 C 190 100, 230 100, 230 65 C 230 30, 190 30, 140 65 C 90 100, 50 100, 50 65';
const INF_LENGTH = 420; // approx path length — used for dasharray draw-in effect

export const BodySoulLogo: React.FC<{ width?: number }> = ({ width = 240 }) => {
  const ratio = width / VBW;
  const height = VBH * ratio;

  const drawProgress = useRef(new Animated.Value(0)).current;
  const lotusFade   = useRef(new Animated.Value(0)).current;
  const textFade    = useRef(new Animated.Value(0)).current;
  const idle        = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(drawProgress, {
        toValue: 1, duration: 1800,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: false,
      }),
      Animated.parallel([
        Animated.timing(lotusFade, { toValue: 1, duration: 450, useNativeDriver: false }),
        Animated.timing(textFade,  { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    ]).start();

    // Idle breath pulse — runs forever
    const breath = Animated.loop(
      Animated.sequence([
        Animated.timing(idle, { toValue: 1, duration: 2500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idle, { toValue: 0, duration: 2500,
          easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    breath.start();
    return () => breath.stop();
  }, [drawProgress, lotusFade, textFade, idle]);

  const dashOffset = drawProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [INF_LENGTH, 0],
  });

  const scale = idle.interpolate({ inputRange: [0, 1], outputRange: [1, 1.025] });
  const glow  = idle.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] });

  return (
    <View style={styles.container}>
      <Animated.View style={{ transform: [{ scale }], opacity: glow }}>
        <Svg width={width} height={height} viewBox={`0 0 ${VBW} ${VBH}`}>
          <Defs>
            <LinearGradient id="ribbon" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"    stopColor="#5a6fd0" />
              <Stop offset="0.5"  stopColor="#9466c8" />
              <Stop offset="1"    stopColor="#d6a06b" />
            </LinearGradient>
            <LinearGradient id="ribbonSoft" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0"   stopColor="#5a6fd0" stopOpacity="0.45" />
              <Stop offset="0.5" stopColor="#9466c8" stopOpacity="0.45" />
              <Stop offset="1"   stopColor="#d6a06b" stopOpacity="0.45" />
            </LinearGradient>
          </Defs>

          {/* Infinity ribbon — outer thick stroke */}
          <AnimatedPath
            d={INF_PATH}
            stroke="url(#ribbon)"
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={INF_LENGTH}
            strokeDashoffset={dashOffset as unknown as number}
          />
          {/* Infinity ribbon — inner thin echo for the ribbon feel */}
          <AnimatedPath
            d={INF_PATH}
            stroke="url(#ribbonSoft)"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeDasharray={INF_LENGTH}
            strokeDashoffset={dashOffset as unknown as number}
          />

          {/* Lotus — 5 petals fanning up from the infinity crossing (~140, 65) */}
          <AnimatedG opacity={lotusFade as unknown as number}>
            {/* Center petal */}
            <Ellipse cx="140" cy="28" rx="5" ry="16" fill="url(#ribbon)" />
            {/* Inner side petals */}
            <Ellipse cx="125" cy="35" rx="4" ry="13" fill="url(#ribbon)"
                     transform="rotate(-32, 125, 35)" />
            <Ellipse cx="155" cy="35" rx="4" ry="13" fill="url(#ribbon)"
                     transform="rotate(32, 155, 35)" />
            {/* Outer side petals */}
            <Ellipse cx="112" cy="45" rx="3" ry="10" fill="url(#ribbon)"
                     transform="rotate(-58, 112, 45)" />
            <Ellipse cx="168" cy="45" rx="3" ry="10" fill="url(#ribbon)"
                     transform="rotate(58, 168, 45)" />
          </AnimatedG>
        </Svg>
      </Animated.View>

      <Animated.Text style={[styles.brandText, { opacity: textFade }]}>
        BODY & SOUL
      </Animated.Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: {
    color: COLORS.cream,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 6,
    marginTop: -8,
  },
});
