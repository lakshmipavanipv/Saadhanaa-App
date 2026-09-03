/**
 * GroundingOverlay — Emergency Grounding Japa Interface (Anxiety SOS).
 *
 * Renders as a full-screen Modal overlay above whatever the user was doing.
 * Theme is overridden to a slow, pulsing, deeply calming blue (#1A2B4C).
 * A scaled-down Prāṇa Wave forces a 4-second-inhale / 6-second-exhale
 * breathing cadence — the standard "physiological sigh" pattern.
 *
 * The session is "locked" — Dismiss is intentionally weakened to a small
 * tertiary link below the breathing area, only revealed after 60s.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, Animated, TouchableOpacity,
  Easing, Dimensions, Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { EmotionalEvent } from '../emotional/types';
import { getEmotionalEngine } from '../emotional/EmotionalEngine';

const W = Dimensions.get('window').width;
const INHALE_MS = 4_000;
const EXHALE_MS = 6_000;
const ESCAPE_HATCH_MS = 60_000;        // "I'm okay" button appears after 60s

interface Props {
  event: EmotionalEvent;
  onDismiss: () => void;
}

export const GroundingOverlay: React.FC<Props> = ({ event, onDismiss }) => {
  const scale = useRef(new Animated.Value(0.4)).current;
  const pulse = useRef(new Animated.Value(0.55)).current;
  const [phase, setPhase] = useState<'inhale' | 'exhale'>('inhale');
  const [escapeAvailable, setEscapeAvailable] = useState(false);
  const [breathCount, setBreathCount] = useState(0);

  // Fire local notification at the moment the overlay mounts
  useEffect(() => {
    void (async () => {
      try {
        if (Platform.OS !== 'web') {
          await Notifications.scheduleNotificationAsync({
            content: {
              title: 'Soulsync',
              body: 'We notice a shift in your life force. Let’s ground your energy together.',
              priority: 'max' as any,
            },
            trigger: null,
          });
        }
      } catch { /* notifications optional */ }

      // Mark intervention started
      const engine = getEmotionalEngine();
      await engine?.markInterventionStart(event.id, 'grounding_japa', event.rmssd);
    })();
  }, [event]);

  // Breathing animation — perpetual loop
  useEffect(() => {
    let cancelled = false;
    const runBreath = () => {
      // Inhale
      setPhase('inhale');
      Animated.timing(scale, {
        toValue: 1.0, duration: INHALE_MS,
        easing: Easing.bezier(0.4, 0, 0.6, 1),
        useNativeDriver: true,
      }).start(() => {
        if (cancelled) return;
        // Exhale
        setPhase('exhale');
        Animated.timing(scale, {
          toValue: 0.4, duration: EXHALE_MS,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          setBreathCount(c => c + 1);
          runBreath();
        });
      });
    };
    runBreath();

    // Slow background pulse
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.85, duration: 3000, useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 0.55, duration: 3000, useNativeDriver: false }),
      ])
    );
    pulseLoop.start();

    return () => { cancelled = true; pulseLoop.stop(); };
  }, [scale, pulse]);

  // Escape-hatch timer
  useEffect(() => {
    const id = setTimeout(() => setEscapeAvailable(true), ESCAPE_HATCH_MS);
    return () => clearTimeout(id);
  }, []);

  const handleComplete = async () => {
    const engine = getEmotionalEngine();
    // Stub: we'd take a fresh RMSSD read here from the ring
    await engine?.markInterventionComplete(event.id, null, event.rmssd);
    await engine?.markResolved(event.id);
    onDismiss();
  };

  return (
    <Modal visible animationType="fade" transparent={false} statusBarTranslucent>
      <Animated.View
        style={[
          styles.container,
          {
            // Pulsing blue background — calming, slow, deep
            opacity: pulse.interpolate({ inputRange: [0.55, 0.85], outputRange: [1, 1] }),
            backgroundColor: '#1A2B4C',
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.label}>GROUNDING JAPA</Text>
          <Text style={styles.headline}>Breathe with us</Text>
          <Text style={styles.subline}>
            Your body picked up an anxious wave — we&apos;re here to settle it.
          </Text>
        </View>

        {/* Prāṇa Wave — the breathing circle */}
        <View style={styles.waveBox}>
          <Animated.View
            style={[
              styles.wave,
              {
                transform: [{ scale }],
                opacity: scale.interpolate({ inputRange: [0.4, 1.0], outputRange: [0.45, 0.95] }),
              },
            ]}
          />
          <Animated.View
            style={[
              styles.waveInner,
              { transform: [{ scale: Animated.multiply(scale, 0.7) }] },
            ]}
          />
          <View style={styles.waveCenter}>
            <Text style={styles.phaseText}>
              {phase === 'inhale' ? 'Inhale' : 'Exhale'}
            </Text>
            <Text style={styles.phaseSub}>
              {phase === 'inhale' ? '4 seconds' : '6 seconds'}
            </Text>
          </View>
        </View>

        {/* Metric chip — current vs baseline */}
        <View style={styles.metricRow}>
          <View style={styles.metricChip}>
            <Text style={styles.metricLabel}>HEART RATE</Text>
            <Text style={styles.metricValue}>{event.bpm ?? '—'}</Text>
            <Text style={styles.metricBaseline}>baseline: {event.baselineBpm ?? '—'}</Text>
          </View>
          <View style={styles.metricChip}>
            <Text style={styles.metricLabel}>BREATHS</Text>
            <Text style={styles.metricValue}>{breathCount}</Text>
            <Text style={styles.metricBaseline}>this session</Text>
          </View>
        </View>

        <View style={styles.footer}>
          {escapeAvailable ? (
            <>
              <TouchableOpacity style={styles.completeBtn} onPress={handleComplete}>
                <Text style={styles.completeBtnText}>I feel grounded — finish</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onDismiss}>
                <Text style={styles.dismissText}>Continue later</Text>
              </TouchableOpacity>
            </>
          ) : (
            <Text style={styles.lockedText}>
              Stay with the breath for one minute. The button will appear shortly.
            </Text>
          )}
        </View>
      </Animated.View>
    </Modal>
  );
};

const WAVE_SIZE = Math.min(W * 0.7, 280);

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 28, paddingTop: 80, paddingBottom: 40 },
  header: { alignItems: 'center', marginBottom: 20 },
  label: {
    fontSize: 11, color: '#7EA1D8', letterSpacing: 3, fontWeight: '700',
    marginBottom: 6,
  },
  headline: { fontSize: 30, color: '#E8EFFA', fontWeight: '300', marginBottom: 8 },
  subline: {
    fontSize: 13, color: '#B4C6E2', textAlign: 'center', lineHeight: 19,
    paddingHorizontal: 12,
  },
  waveBox: {
    width: WAVE_SIZE, height: WAVE_SIZE, alignSelf: 'center',
    marginVertical: 36, justifyContent: 'center', alignItems: 'center',
  },
  wave: {
    position: 'absolute', width: WAVE_SIZE, height: WAVE_SIZE,
    borderRadius: WAVE_SIZE / 2, backgroundColor: 'rgba(126, 161, 216, 0.18)',
    borderWidth: 1, borderColor: 'rgba(126, 161, 216, 0.4)',
  },
  waveInner: {
    position: 'absolute', width: WAVE_SIZE * 0.7, height: WAVE_SIZE * 0.7,
    borderRadius: (WAVE_SIZE * 0.7) / 2, backgroundColor: 'rgba(180, 198, 226, 0.20)',
  },
  waveCenter: { alignItems: 'center' },
  phaseText: { fontSize: 24, color: '#E8EFFA', fontWeight: '500', letterSpacing: 1 },
  phaseSub: { fontSize: 11, color: '#7EA1D8', marginTop: 4, letterSpacing: 1 },
  metricRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, marginBottom: 24 },
  metricChip: {
    flex: 1, paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 10, backgroundColor: 'rgba(126, 161, 216, 0.10)',
    borderWidth: 1, borderColor: 'rgba(126, 161, 216, 0.20)',
  },
  metricLabel: { fontSize: 10, color: '#7EA1D8', letterSpacing: 1.5, fontWeight: '700' },
  metricValue: { fontSize: 24, color: '#E8EFFA', fontWeight: '600', marginTop: 4 },
  metricBaseline: { fontSize: 10, color: '#7EA1D8', marginTop: 2 },
  footer: { flex: 1, justifyContent: 'flex-end', alignItems: 'center' },
  completeBtn: {
    paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24,
    backgroundColor: '#E8EFFA',
    marginBottom: 12,
  },
  completeBtnText: { color: '#1A2B4C', fontSize: 15, fontWeight: '600' },
  dismissText: { color: '#7EA1D8', fontSize: 12, fontStyle: 'italic' },
  lockedText: {
    color: '#7EA1D8', fontSize: 12, fontStyle: 'italic',
    textAlign: 'center', lineHeight: 18, paddingHorizontal: 24,
  },
});
