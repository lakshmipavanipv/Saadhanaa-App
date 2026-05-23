/**
 * CoolingOverlay — Aggression intervention.
 *
 * Minimalist full-screen workspace shown the moment an aggression event
 * fires. A single deep-breathing animation, no buttons, no metrics on top.
 * Background tracking stays hyper-active so we can measure the exact
 * decay time it takes for BVP velocity to normalise.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Animated, Easing, TouchableOpacity, Dimensions,
} from 'react-native';
import { EmotionalEvent } from '../emotional/types';
import { getEmotionalEngine } from '../emotional/EmotionalEngine';

const W = Dimensions.get('window').width;
const BREATH_MS = 8_000;

interface Props {
  event: EmotionalEvent;
  onDismiss: () => void;
}

export const CoolingOverlay: React.FC<Props> = ({ event, onDismiss }) => {
  const scale = useRef(new Animated.Value(0.5)).current;
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    void (async () => {
      await getEmotionalEngine()?.markInterventionStart(event.id, 'cooling_workspace', null);
    })();
  }, [event]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.0, duration: BREATH_MS / 2,
          easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.5, duration: BREATH_MS / 2,
          easing: Easing.bezier(0.4, 0, 0.6, 1), useNativeDriver: true }),
      ])
    );
    loop.start();
    const tick = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => { loop.stop(); clearInterval(tick); };
  }, [scale]);

  const handleDone = async () => {
    await getEmotionalEngine()?.markInterventionComplete(event.id, null, null);
    await getEmotionalEngine()?.markResolved(event.id);
    onDismiss();
  };

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <View style={styles.container}>
        <Text style={styles.label}>COOLING WORKSPACE</Text>
        <Text style={styles.title}>Just breathe</Text>
        <Text style={styles.subline}>Your ring chimed because we felt a surge. No pressure. Just one slow breath.</Text>

        <View style={styles.breathBox}>
          <Animated.View style={[styles.breath, { transform: [{ scale }] }]} />
          <Animated.View style={[styles.breathInner, { transform: [{ scale: Animated.multiply(scale, 0.7) }] }]} />
        </View>

        <Text style={styles.timer}>{seconds}s</Text>

        {seconds >= 30 && (
          <TouchableOpacity style={styles.doneBtn} onPress={handleDone}>
            <Text style={styles.doneBtnText}>I'm steady</Text>
          </TouchableOpacity>
        )}
        {seconds < 30 && <Text style={styles.lockedText}>Stay with it for 30 seconds.</Text>}
      </View>
    </Modal>
  );
};

const SIZE = Math.min(W * 0.6, 240);
const styles = StyleSheet.create({
  container: {
    flex: 1, backgroundColor: '#0F1A2C',
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24,
  },
  label: { fontSize: 11, color: '#7EA1D8', letterSpacing: 3, fontWeight: '700' },
  title: { fontSize: 30, color: '#E8EFFA', fontWeight: '300', marginTop: 8 },
  subline: { fontSize: 13, color: '#B4C6E2', textAlign: 'center', marginTop: 8, lineHeight: 19, paddingHorizontal: 12 },
  breathBox: {
    width: SIZE, height: SIZE, marginVertical: 36,
    justifyContent: 'center', alignItems: 'center',
  },
  breath: {
    position: 'absolute', width: SIZE, height: SIZE, borderRadius: SIZE / 2,
    backgroundColor: 'rgba(180, 198, 226, 0.18)',
    borderWidth: 1, borderColor: 'rgba(126, 161, 216, 0.4)',
  },
  breathInner: {
    position: 'absolute', width: SIZE * 0.6, height: SIZE * 0.6, borderRadius: (SIZE * 0.6) / 2,
    backgroundColor: 'rgba(180, 198, 226, 0.25)',
  },
  timer: { fontSize: 28, color: '#7EA1D8', fontWeight: '600', marginBottom: 30 },
  doneBtn: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, backgroundColor: '#E8EFFA',
  },
  doneBtnText: { color: '#1A2B4C', fontSize: 15, fontWeight: '600' },
  lockedText: { color: '#7EA1D8', fontSize: 12, fontStyle: 'italic' },
});
