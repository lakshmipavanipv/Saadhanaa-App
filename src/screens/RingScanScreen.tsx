/**
 * RingScanScreen — pair the Saadhana Ring.
 *
 * The user-facing way to connect a ring; Ring Debug stays as the developer
 * tool. Layout follows the reference design: a radar with the Bluetooth mark
 * at its centre, a heading saying what is happening, and a three-step
 * checklist so a scan that finds nothing still explains itself instead of
 * spinning forever.
 *
 * The three steps are real states, not decoration:
 *   Bluetooth enabled — permission granted and the adapter is on
 *   Found            — at least one candidate ring has been seen
 *   Verified         — a GATT connection opened and the device id was saved
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { useTheme } from '../ThemeContext';
import {
  SadhanaRing,
  requestRingPermissions,
  waitForBluetoothOn,
  saveSr16DeviceId,
  type ScannedRing,
} from '../soulsync/ring';

type StepState = 'pending' | 'in-progress' | 'done' | 'failed';

const STEP_LABEL: Record<StepState, string> = {
  pending: 'PENDING',
  'in-progress': 'IN PROGRESS',
  done: 'ACTIVE',
  failed: 'FAILED',
};

const SCAN_MS = 15_000;

export const RingScanScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);

  const [bt, setBt] = useState<StepState>('pending');
  const [found, setFound] = useState<StepState>('pending');
  const [verified, setVerified] = useState<StepState>('pending');
  const [candidates, setCandidates] = useState<ScannedRing[]>([]);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stopScanRef = useRef<null | (() => void)>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // Radar pulse, running only while scanning — a paired ring should not sit
  // under a permanently animating screen.
  useEffect(() => {
    if (!scanning) { pulse.setValue(0); return; }
    const loop = Animated.loop(
      Animated.timing(pulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [scanning, pulse]);

  const startScan = useCallback(async () => {
    setError(null);
    setCandidates([]);
    setFound('pending');
    setVerified('pending');
    setBt('in-progress');

    const granted = await requestRingPermissions();
    if (!granted) {
      setBt('failed');
      setError('Bluetooth permission was declined. Grant it in Android settings to pair your ring.');
      return;
    }
    const on = await waitForBluetoothOn();
    if (!on) {
      setBt('failed');
      setError('Bluetooth is switched off. Turn it on, then scan again.');
      return;
    }
    setBt('done');
    setFound('in-progress');
    setScanning(true);

    stopScanRef.current = SadhanaRing.scan(
      (r) => {
        setCandidates((prev) => (prev.some((p) => p.id === r.id) ? prev : [...prev, r]));
        setFound('done');
      },
      (err) => setError('Scan error: ' + err),
      { timeoutMs: SCAN_MS, permissive: true }
    );

    setTimeout(() => {
      setScanning(false);
      setFound((f) => (f === 'done' ? f : 'failed'));
    }, SCAN_MS);
  }, [pulse]);

  const connect = useCallback(async (r: ScannedRing) => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setScanning(false);
    setVerified('in-progress');
    setError(null);
    try {
      const ring = await SadhanaRing.connect(r.id);
      await saveSr16DeviceId(r.id);
      // Buzz once so pairing is confirmed on the finger, not only on screen.
      void ring.device.vibrate(1).catch(() => { /* some firmware nacks; harmless */ });
      setVerified('done');
      setConnectedName(r.name || r.id);
    } catch (e) {
      setVerified('failed');
      setError('Could not connect: ' + (e as Error).message);
    }
  }, []);

  // Start automatically — the user came here to pair.
  useEffect(() => {
    void startScan();
    return () => { stopScanRef.current?.(); };
  }, [startScan]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1.15] });
  const ringFade = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.12, 0] });
  const connected = verified === 'done';

  return (
    <View style={[styles.screen, { backgroundColor: palette.deep }]}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.back}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saadhana Ring</Text>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.brand}>SAADHANA RING</Text>

        <View style={styles.radar}>
          <View style={styles.radarStatic} />
          <View style={styles.radarStaticInner} />
          {scanning && (
            <Animated.View
              style={[styles.pulseRing, { transform: [{ scale: ringScale }], opacity: ringFade }]}
            />
          )}
          <Text style={[styles.btMark, connected ? { color: '#3ddc84' } : null]}>✦</Text>
        </View>

        <Text style={styles.title}>
          {connected ? 'Ring connected' : scanning ? 'Searching for Ring…' : 'Scan for your ring'}
        </Text>
        <Text style={styles.subtitle}>
          {connected
            ? 'Paired with ' + connectedName + '. Taps and vitals will sync automatically.'
            : 'Keep your Saadhana Ring close to your phone'}
        </Text>

        <View style={styles.checklist}>
          <Step label="Bluetooth enabled" state={bt} styles={styles} />
          <Step label="Found" state={found} styles={styles} />
          <Step label="Verified" state={verified} styles={styles} />
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {candidates.length > 0 && !connected ? (
          <View style={styles.list}>
            <Text style={styles.listHead}>Tap your ring to connect</Text>
            {candidates.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.device}
                onPress={() => void connect(c)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{c.name || 'Unnamed device'}</Text>
                  <Text style={styles.deviceId}>{c.id}</Text>
                </View>
                <Text style={styles.deviceRssi}>{c.rssi != null ? c.rssi + ' dBm' : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}

        {!scanning && !connected ? (
          <TouchableOpacity style={styles.cta} onPress={() => void startScan()} activeOpacity={0.85}>
            <Text style={styles.ctaTxt}>Scan again</Text>
          </TouchableOpacity>
        ) : null}

        {connected ? (
          <TouchableOpacity style={styles.cta} onPress={() => navigation?.goBack?.()} activeOpacity={0.85}>
            <Text style={styles.ctaTxt}>Done</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
};

const Step: React.FC<{ label: string; state: StepState; styles: any }> = ({ label, state, styles }) => {
  const tone =
    state === 'done' ? '#3ddc84'
      : state === 'failed' ? '#ff8c42'
        : state === 'in-progress' ? '#F0D08A'
          : COLORS.muted;
  const mark = state === 'done' ? '✓' : state === 'failed' ? '✕' : '○';
  return (
    <View style={styles.step}>
      <Text style={[styles.stepTick, { color: tone }]}>{mark}</Text>
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={[styles.stepState, { color: tone }]}>{STEP_LABEL[state]}</Text>
    </View>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.sm,
  },
  back: { color: C.gold, fontSize: 34, marginRight: SPACING.sm, lineHeight: 36 },
  headerTitle: { color: C.cream, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  body: { paddingHorizontal: SPACING.lg, paddingBottom: 90, alignItems: 'center' },
  brand: {
    color: C.cream, fontSize: 13, fontWeight: '700',
    letterSpacing: 3, marginTop: SPACING.md, marginBottom: SPACING.lg,
  },
  radar: {
    width: 220, height: 220, alignItems: 'center', justifyContent: 'center',
    marginBottom: SPACING.lg,
  },
  radarStatic: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  radarStaticInner: {
    position: 'absolute', width: 128, height: 128, borderRadius: 64,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.10)',
  },
  pulseRing: {
    position: 'absolute', width: 200, height: 200, borderRadius: 100,
    borderWidth: 2, borderColor: '#7CB1FF',
  },
  btMark: { fontSize: 44, color: '#7CB1FF' },
  title: { color: C.cream, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  subtitle: {
    color: C.muted, fontSize: 13, textAlign: 'center',
    marginTop: 6, marginBottom: SPACING.lg, paddingHorizontal: SPACING.md, lineHeight: 19,
  },
  checklist: {
    alignSelf: 'stretch', backgroundColor: C.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
  },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepTick: { fontSize: 15, width: 22 },
  stepLabel: { color: C.cream, fontSize: 14, flex: 1 },
  stepState: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },
  error: {
    color: '#ff8c42', fontSize: 12, marginTop: SPACING.md,
    textAlign: 'center', lineHeight: 18,
  },
  list: { alignSelf: 'stretch', marginTop: SPACING.lg },
  listHead: {
    color: C.muted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  device: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.cardBg, borderRadius: 12, borderWidth: 1, borderColor: C.border,
    padding: SPACING.md, marginBottom: 8,
  },
  deviceName: { color: C.cream, fontSize: 14, fontWeight: '600' },
  deviceId: { color: C.muted, fontSize: 10, marginTop: 2 },
  deviceRssi: { color: C.muted, fontSize: 11 },
  cta: {
    alignSelf: 'stretch', backgroundColor: C.gold, borderRadius: 14,
    paddingVertical: 14, alignItems: 'center', marginTop: SPACING.lg,
  },
  ctaTxt: { color: '#1a1a1a', fontSize: 15, fontWeight: '800' },
});
