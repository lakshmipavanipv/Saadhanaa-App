/**
 * YogaPoseAnimation — renders real Gemini-generated yogini images for the
 * asanas we have, with SVG stick-figure fallback for missing poses.
 *
 *   • Subtle breathing scale (0.97 ↔ 1.03 over 2s) keeps the image alive.
 *   • For Surya Namaskar (cycling=true), it cross-fades through the 12 stages.
 *   • For pranayama (breathing) techniques, a separate BreathVisualizer
 *     orb is rendered instead.
 */

import React, { useEffect } from 'react';
import { View, Text, StyleSheet, Image, ImageSourcePropType } from 'react-native';
import Svg, { Circle, Line, Path, G, Rect } from 'react-native-svg';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, withSequence,
  Easing, cancelAnimation,
} from 'react-native-reanimated';
import { COLORS } from '../theme';

// ─── Pose image registry ─────────────────────────────────────────
// require() at module top so Metro bundles the assets statically.
const POSE_IMAGES: Record<string, ImageSourcePropType> = {
  'pranamasana':          require('../../assets/yoga/pranamasana.png'),
  'hasta-uttanasana':     require('../../assets/yoga/hasta-uttanasana.png'),
  'padahastasana':        require('../../assets/yoga/padahastasana.png'),
  'ashwa-sanchalanasana': require('../../assets/yoga/ashwa-sanchalanasana.png'),
  'dandasana':            require('../../assets/yoga/dandasana.png'),
  'ashtanga-namaskara':   require('../../assets/yoga/ashtanga-namaskara.png'),
  'bhujangasana':         require('../../assets/yoga/bhujangasana.png'),
  'adho-mukha-svanasana': require('../../assets/yoga/adho-mukha-svanasana.png'),
  'tadasana':             require('../../assets/yoga/tadasana.png'),
  'virabhadrasana':       require('../../assets/yoga/virabhadrasana.png'),
};

// Captions shown under each image (English · Sanskrit)
const POSE_CAPTIONS: Record<string, string> = {
  'pranamasana':          'Prayer · Pranamasana',
  'hasta-uttanasana':     'Arms Up · Hasta Uttanasana',
  'padahastasana':        'Forward Fold · Padahastasana',
  'ashwa-sanchalanasana': 'Low Lunge · Ashwa Sanchalanasana',
  'dandasana':            'Plank · Dandasana',
  'ashtanga-namaskara':   '8-Limbs · Ashtanga Namaskara',
  'bhujangasana':         'Cobra · Bhujangasana',
  'adho-mukha-svanasana': 'Downward Dog · Adho Mukha Svanasana',
  'tadasana':             'Mountain · Tadasana',
  'virabhadrasana':       'Warrior II · Virabhadrasana',
  'balasana':             "Child's Pose · Balasana",
  'shavasana':            'Corpse · Shavasana',
  'padmasana':            'Lotus · Padmasana',
};

interface Props {
  poseId: string;
  size?: number;
  /** For Surya Namaskar — cycle through the 12-stage flow. */
  cycling?: boolean;
}

// Surya Namaskar 12-stage flow
const SURYA_FLOW = [
  'pranamasana',
  'hasta-uttanasana',
  'padahastasana',
  'ashwa-sanchalanasana',
  'dandasana',
  'ashtanga-namaskara',
  'bhujangasana',
  'adho-mukha-svanasana',
  'ashwa-sanchalanasana',
  'padahastasana',
  'hasta-uttanasana',
  'pranamasana',
];

// ─── Breath visualizer (pranayama) ────────────────────────────────

const BreathVisualizer: React.FC<{
  size: number;
  pattern: { in: number; hold1: number; out: number; hold2: number };
}> = ({ size, pattern }) => {
  const scale = useSharedValue(0.6);
  const [phaseLabel, setPhaseLabel] = React.useState('Inhale');

  useEffect(() => {
    const cycle = () => {
      setPhaseLabel('Inhale');
      scale.value = withTiming(1.0, {
        duration: pattern.in * 1000,
        easing: Easing.inOut(Easing.quad),
      }, () => {
        if (pattern.hold1 > 0) {
          setPhaseLabel('Hold');
          scale.value = withTiming(1.0, { duration: pattern.hold1 * 1000 });
        }
      });
    };
    cycle();
    const id = setInterval(
      cycle,
      (pattern.in + pattern.hold1 + pattern.out + pattern.hold2) * 1000
    );
    return () => clearInterval(id);
  }, [pattern.in, pattern.hold1, pattern.out, pattern.hold2]);

  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={[
        {
          width: size * 0.7, height: size * 0.7, borderRadius: size * 0.35,
          backgroundColor: 'rgba(78, 168, 222, 0.35)',
          borderWidth: 2, borderColor: '#4ea8de',
          alignItems: 'center', justifyContent: 'center',
        }, animStyle
      ]}>
        <Text style={{ color: COLORS.cream, fontSize: 22, fontWeight: '700' }}>{phaseLabel}</Text>
      </Animated.View>
    </View>
  );
};

// ─── SVG fallback (for poses without an image yet) ───────────────

const SKIN = '#FFD9A8';
const LINE = '#f3e9d2';
const MAT  = 'rgba(255, 184, 0, 0.15)';
const STROKE = 6;
const HEAD_R = 14;

const SVG_FALLBACK: Record<string, () => React.ReactNode> = {
  'balasana': () => (
    <>
      <Rect x={10} y={170} width={180} height={8} rx={4} fill={MAT} />
      <Path d="M 60 165 Q 80 145, 110 150 Q 140 155, 155 160"
            stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" fill="none" />
      <Circle cx={60} cy={170} r={HEAD_R} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
      <Line x1={70} y1={160} x2={45} y2={170} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M 155 160 Q 165 175, 150 180" stroke={LINE} strokeWidth={STROKE} fill="none" strokeLinecap="round" />
    </>
  ),
  'shavasana': () => (
    <>
      <Rect x={5} y={150} width={190} height={8} rx={4} fill={MAT} />
      <Circle cx={45} cy={155} r={HEAD_R} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
      <Line x1={59} y1={155} x2={165} y2={155} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={75} y1={155} x2={80} y2={170} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={165} y1={155} x2={170} y2={170} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={165} y1={155} x2={175} y2={150} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
  'padmasana': () => (
    <>
      <Rect x={10} y={170} width={180} height={8} rx={4} fill={MAT} />
      <Circle cx={100} cy={55} r={HEAD_R} fill={SKIN} stroke={LINE} strokeWidth={1.5} />
      <Line x1={100} y1={69} x2={100} y2={130} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M 100 130 L 65 165 L 135 165 Z"
            stroke={LINE} strokeWidth={STROKE} strokeLinejoin="round" fill={MAT} />
      <Circle cx={70}  cy={150} r={5} fill={SKIN} />
      <Circle cx={130} cy={150} r={5} fill={SKIN} />
      <Line x1={100} y1={90} x2={72}  y2={148} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
      <Line x1={100} y1={90} x2={128} y2={148} stroke={LINE} strokeWidth={STROKE} strokeLinecap="round" />
    </>
  ),
};

// ─── Main component ──────────────────────────────────────────────

export const YogaPoseAnimation: React.FC<Props> = ({ poseId, size = 220, cycling = false }) => {
  const breathing = useSharedValue(1);
  const fade = useSharedValue(1);
  const [currentIdx, setCurrentIdx] = React.useState(0);

  // Subtle breathing scale
  useEffect(() => {
    breathing.value = withRepeat(
      withSequence(
        withTiming(1.03, { duration: 2000, easing: Easing.inOut(Easing.quad) }),
        withTiming(0.97, { duration: 2000, easing: Easing.inOut(Easing.quad) })
      ), -1, false
    );
    return () => cancelAnimation(breathing);
  }, []);

  // Surya Namaskar cycling with cross-fade
  useEffect(() => {
    if (!cycling) return;
    const id = setInterval(() => {
      // Fade out → swap → fade in
      fade.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }, () => {
        fade.value = withTiming(1, { duration: 300, easing: Easing.in(Easing.quad) });
      });
      setTimeout(() => {
        setCurrentIdx(i => (i + 1) % SURYA_FLOW.length);
      }, 280);
    }, 2200);
    return () => clearInterval(id);
  }, [cycling]);

  const activePoseId = cycling ? SURYA_FLOW[currentIdx] : poseId;

  // Pranayama orb
  if (poseId === 'nadi-shodhana')    return <BreathVisualizer size={size} pattern={{ in: 4, hold1: 0, out: 4, hold2: 0 }} />;
  if (poseId === 'four-seven-eight') return <BreathVisualizer size={size} pattern={{ in: 4, hold1: 7, out: 8, hold2: 0 }} />;
  if (poseId === 'bhramari')         return <BreathVisualizer size={size} pattern={{ in: 4, hold1: 0, out: 8, hold2: 0 }} />;
  if (poseId === 'kapalabhati')      return <BreathVisualizer size={size} pattern={{ in: 1, hold1: 0, out: 1, hold2: 0 }} />;

  const imgStyle = useAnimatedStyle(() => ({
    transform: [{ scale: breathing.value }],
    opacity: cycling ? fade.value : 1,
  }));

  const caption = POSE_CAPTIONS[activePoseId];
  const imageSource = POSE_IMAGES[activePoseId];
  const fallback = SVG_FALLBACK[activePoseId];

  return (
    <View style={styles.wrap}>
      <Animated.View style={imgStyle}>
        {imageSource ? (
          <Image
            source={imageSource}
            style={{ width: size, height: size, borderRadius: 14 }}
            resizeMode="cover"
          />
        ) : fallback ? (
          <Svg width={size} height={size} viewBox="0 0 200 200">
            <G>{fallback()}</G>
          </Svg>
        ) : (
          <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 64 }}>🧘</Text>
          </View>
        )}
      </Animated.View>
      {caption && (
        <Text style={styles.caption}>
          {cycling ? `${currentIdx + 1}/12 · ` : ''}{caption}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  caption: {
    fontSize: 11, color: COLORS.muted, fontStyle: 'italic',
    marginTop: 8, textAlign: 'center',
  },
});
