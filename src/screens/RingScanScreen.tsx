/**
 * RingScanScreen — pair the Saadhana Ring.
 *
 * The user-facing way to connect a ring; Ring Debug stays as the developer
 * tool. Layout follows the supplied detection-card design: a mint halo behind
 * a pale disc holding the ring mark, a status eyebrow, the headline, an
 * identity card for the device, one black primary action, and a quiet
 * "search again" escape hatch.
 *
 * NOTE ON THEMING — this screen is deliberately pinned to the light mint
 * palette below and does NOT follow the app's light/dark toggle. That is a
 * conscious exception, requested so the pairing flow matches the supplied
 * design exactly; it is the only screen in the app that opts out. Everything
 * else should keep using `useTheme()`. The status bar is forced to dark icons
 * while this screen is mounted, and restores itself on unmount.
 *
 * Every value on screen is real, never decorative:
 *   • the signal chip is bucketed from the candidate's RSSI
 *   • the identity card shows the GATT device id we will actually connect to
 *   • the eyebrow tracks the same scan state machine as before
 *
 * The three-step checklist (Bluetooth / Found / Verified) is kept, but shown
 * only when the scan fails or errors — that is the moment it earns its space,
 * and a clean "found" state should stay uncluttered.
 *
 * The step states are real, not decoration:
 *   Bluetooth enabled — permission granted and the adapter is on
 *   Found            — at least one candidate ring has been seen
 *   Verified         — a GATT connection opened and the device id was saved
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing,
  ActivityIndicator, StatusBar, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from 'react-native-svg';
import { SPACING } from '../theme';
import {
  SadhanaRing,
  requestRingPermissions,
  waitForBluetoothOn,
  saveSr16DeviceId,
  type ScannedRing,
} from '../soulsync/ring';

/** Pinned light palette — see the theming note in the file header. */
const M = {
  page: '#F7F9F8',
  card: '#FFFFFF',
  ink: '#101418',
  body: '#6B7280',
  label: '#9AA3AE',
  green: '#2FBF71',
  greenSoft: '#D9F2E5',
  discFill: '#F3FBF7',
  discEdge: 'rgba(47,191,113,0.14)',
  black: '#0B0B0F',
  border: 'rgba(16,20,24,0.07)',
  danger: '#C2410C',
  amber: '#B45309',
};

type StepState = 'pending' | 'in-progress' | 'done' | 'failed';

const STEP_LABEL: Record<StepState, string> = {
  pending: 'PENDING',
  'in-progress': 'IN PROGRESS',
  done: 'ACTIVE',
  failed: 'FAILED',
};

const SCAN_MS = 15_000;
const DISC = 196;

type Signal = { label: string; bars: 1 | 2 | 3 };

/** RSSI buckets. -60 and -75 dBm are the usual "same room" / "same floor"
 *  boundaries for BLE advertising on a phone held near the hand. */
const signalOf = (rssi: number | null | undefined): Signal | null => {
  if (rssi == null) return null;
  if (rssi >= -60) return { label: 'Strong Signal', bars: 3 };
  if (rssi >= -75) return { label: 'Good Signal', bars: 2 };
  return { label: 'Weak Signal', bars: 1 };
};

export const RingScanScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [bt, setBt] = useState<StepState>('pending');
  const [found, setFound] = useState<StepState>('pending');
  const [verified, setVerified] = useState<StepState>('pending');
  const [candidates, setCandidates] = useState<ScannedRing[]>([]);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stopScanRef = useRef<null | (() => void)>(null);
  const pulse = useRef(new Animated.Value(0)).current;

  // Halo pulse, running only while scanning — a paired ring should not sit
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
  }, []);

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

  const haloScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.78, 1.22] });
  const haloFade = pulse.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0.12, 0] });

  const connected = verified === 'done';
  const connecting = verified === 'in-progress';

  // Strongest advertiser first — that is almost always the ring on the hand
  // holding the phone, and it is the one the hero card speaks for.
  const ranked = useMemo(
    () => [...candidates].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
    [candidates]
  );
  const primary = ranked[0] ?? null;
  const others = ranked.slice(1);
  const signal = signalOf(primary?.rssi);

  const failedScan = !scanning && !connected && !primary;

  const eyebrow = connected ? { text: 'CONNECTED', tone: M.green }
    : connecting ? { text: 'VERIFYING', tone: M.amber }
      : primary ? { text: 'DETECTION SUCCESS', tone: M.green }
        : scanning ? { text: 'SCANNING', tone: M.amber }
          : { text: 'NO RING FOUND', tone: M.danger };

  const title = connected ? 'Ring Connected'
    : connecting ? 'Verifying Your Ring'
      : primary ? 'Saadhana Ring Found'
        : scanning ? 'Searching For Your Ring' : 'No Ring Nearby';

  const body = connected
    ? 'Paired with ' + (connectedName ?? 'your ring') + '. Taps and vitals now sync automatically.'
    : connecting ? 'Opening a secure connection and saving this ring to your profile.'
      : primary ? 'A nearby Saadhana ring has been identified. Ready to synchronise your vitals.'
        : scanning ? 'Keep the ring close to your phone while we look for it.'
          : 'We could not find a ring nearby. Make sure it is charged and within arm’s reach.';

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="dark-content" backgroundColor={M.page} />

      {/* Soft mint wash behind the hero, bleeding to the page colour. */}
      <Svg width={width} height={460} style={styles.wash} pointerEvents="none">
        <Defs>
          <RadialGradient id="wash" cx="50%" cy="42%" r="62%">
            <Stop offset="0%" stopColor={M.green} stopOpacity={0.17} />
            <Stop offset="55%" stopColor={M.green} stopOpacity={0.06} />
            <Stop offset="100%" stopColor={M.green} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Rect x={0} y={0} width={width} height={460} fill="url(#wash)" />
      </Svg>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        {/* The design shows a burger here, but this screen is presented as a
            modal with only goBack — a menu glyph that closes a sheet would be
            a lie. Same slot and weight, honest affordance. */}
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.iconBtn}
        >
          <BackChevron />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>SAADHANA RING</Text>

        {/* Visual counterweight from the design. Not a control — there is no
            profile target from this screen, and a dead button would be worse. */}
        <View style={styles.avatar} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Signal chip */}
        <View style={styles.chipRow}>
          {signal ? (
            <View style={styles.chip}>
              <SignalBars bars={signal.bars} />
              <Text style={styles.chipTxt}>{signal.label}</Text>
            </View>
          ) : null}
        </View>

        {/* Hero disc */}
        <View style={styles.hero}>
          {scanning ? (
            <Animated.View
              style={[styles.pulseRing, { transform: [{ scale: haloScale }], opacity: haloFade }]}
            />
          ) : null}
          <View style={styles.disc}>
            <RingMark />
          </View>
        </View>

        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowDot, { backgroundColor: eyebrow.tone }]} />
          <Text style={[styles.eyebrow, { color: eyebrow.tone }]}>{eyebrow.text}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{body}</Text>

        {/* Identity card — the id we will actually open a GATT link to. */}
        {primary && !connected ? (
          <View style={styles.idCard}>
            <View style={{ flex: 1 }}>
              <Text style={styles.idLabel}>DEVICE ID</Text>
              <Text style={styles.idValue} numberOfLines={1}>
                {primary.id.toUpperCase()}
              </Text>
              {primary.name ? (
                <Text style={styles.idName} numberOfLines={1}>{primary.name}</Text>
              ) : null}
            </View>
            <View style={styles.idBadge}>
              <Fingerprint />
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* The checklist only earns its space when something went wrong. */}
        {failedScan || error ? (
          <View style={styles.checklist}>
            <Step label="Bluetooth enabled" state={bt} />
            <Step label="Found" state={found} />
            <Step label="Verified" state={verified} />
          </View>
        ) : null}

        {/* Primary action */}
        {primary && !connected ? (
          <TouchableOpacity
            style={[styles.cta, connecting ? styles.ctaBusy : null]}
            onPress={() => void connect(primary)}
            activeOpacity={0.88}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Text style={styles.ctaTxt}>Connect Now</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {connected ? (
          <TouchableOpacity style={styles.cta} onPress={() => navigation?.goBack?.()} activeOpacity={0.88}>
            <Text style={styles.ctaTxt}>Done</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>
        ) : null}

        {scanning && !primary ? (
          <View style={styles.scanNote}>
            <ActivityIndicator color={M.green} />
            <Text style={styles.scanNoteTxt}>Listening for nearby rings…</Text>
          </View>
        ) : null}

        {/* Quiet escape hatch */}
        {!connected && !scanning ? (
          <TouchableOpacity onPress={() => void startScan()} activeOpacity={0.7} style={styles.again}>
            <Text style={styles.againTxt}>
              {primary ? 'Not your ring? ' : ''}
              <Text style={styles.againLink}>Search again</Text>
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* More than one advertiser in range — keep the ability to pick. */}
        {others.length > 0 && !connected ? (
          <View style={styles.list}>
            <Text style={styles.listHead}>Other rings nearby</Text>
            {others.map((c) => (
              <TouchableOpacity
                key={c.id}
                style={styles.device}
                onPress={() => void connect(c)}
                activeOpacity={0.8}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.deviceName}>{c.name || 'Unnamed device'}</Text>
                  <Text style={styles.deviceId}>{c.id.toUpperCase()}</Text>
                </View>
                <Text style={styles.deviceRssi}>{c.rssi != null ? c.rssi + ' dBm' : ''}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

/** The ring seen head-on: outer band, inner bore. */
const RingMark: React.FC = () => (
  <Svg width={74} height={74} viewBox="0 0 74 74">
    <Circle cx={37} cy={37} r={28} stroke={M.ink} strokeWidth={4} fill="none" />
    <Circle cx={37} cy={37} r={10} fill={M.ink} />
  </Svg>
);

const BackChevron: React.FC = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22">
    <Path
      d="M14 4 L7 11 L14 18"
      stroke={M.ink}
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
);

/** Three ascending bars, filled to the measured strength. */
const SignalBars: React.FC<{ bars: 1 | 2 | 3 }> = ({ bars }) => (
  <Svg width={13} height={11} viewBox="0 0 13 11">
    {[0, 1, 2].map((i) => (
      <Rect
        key={i}
        x={i * 4.5}
        y={11 - (i + 1) * 3.4}
        width={3}
        height={(i + 1) * 3.4}
        rx={1}
        fill={M.green}
        opacity={i < bars ? 1 : 0.28}
      />
    ))}
  </Svg>
);

const Fingerprint: React.FC = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M3 13a9 9 0 0 1 18 0" stroke={M.green} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M6 14.5a6 6 0 0 1 12 0" stroke={M.green} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M9 16a3 3 0 0 1 6 0" stroke={M.green} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M12 18.5v1.5" stroke={M.green} strokeWidth={1.8} fill="none" strokeLinecap="round" />
  </Svg>
);

const Step: React.FC<{ label: string; state: StepState }> = ({ label, state }) => {
  const tone =
    state === 'done' ? M.green
      : state === 'failed' ? M.danger
        : state === 'in-progress' ? M.amber
          : M.label;
  const mark = state === 'done' ? '✓' : state === 'failed' ? '✕' : '○';
  return (
    <View style={styles.step}>
      <Text style={[styles.stepTick, { color: tone }]}>{mark}</Text>
      <Text style={styles.stepLabel}>{label}</Text>
      <Text style={[styles.stepState, { color: tone }]}>{STEP_LABEL[state]}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: M.page },
  wash: { position: 'absolute', top: 0, left: 0 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: M.ink, fontSize: 15, fontWeight: '700', letterSpacing: 2.4 },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: M.border,
  },

  body: { paddingHorizontal: SPACING.lg, alignItems: 'center' },

  chipRow: { alignSelf: 'stretch', alignItems: 'flex-end', minHeight: 34, paddingTop: 6 },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    backgroundColor: M.card, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 7,
    shadowColor: '#101418', shadowOpacity: 0.07, shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 }, elevation: 2,
  },
  chipTxt: { color: M.ink, fontSize: 12, fontWeight: '600' },

  hero: {
    width: DISC, height: DISC, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.md, marginBottom: SPACING.xl,
  },
  disc: {
    width: DISC, height: DISC, borderRadius: DISC / 2,
    backgroundColor: M.discFill, borderWidth: 1, borderColor: M.discEdge,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: M.green, shadowOpacity: 0.18, shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 }, elevation: 3,
  },
  pulseRing: {
    position: 'absolute', width: DISC, height: DISC, borderRadius: DISC / 2,
    borderWidth: 2, borderColor: M.green,
  },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 11.5, fontWeight: '800', letterSpacing: 1.5 },

  title: { color: M.ink, fontSize: 28, fontWeight: '800', textAlign: 'center', letterSpacing: -0.3 },
  subtitle: {
    color: M.body, fontSize: 15, textAlign: 'center',
    marginTop: 10, marginBottom: SPACING.xl, paddingHorizontal: 6, lineHeight: 23,
  },

  idCard: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center',
    backgroundColor: M.card, borderRadius: 16,
    paddingHorizontal: SPACING.md, paddingVertical: 16,
    shadowColor: '#101418', shadowOpacity: 0.06, shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 }, elevation: 2,
  },
  idLabel: { color: M.label, fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  idValue: { color: M.ink, fontSize: 20, fontWeight: '700', marginTop: 5 },
  idName: { color: M.body, fontSize: 12, marginTop: 3 },
  idBadge: {
    width: 44, height: 44, borderRadius: 22, backgroundColor: M.greenSoft,
    alignItems: 'center', justifyContent: 'center', marginLeft: SPACING.sm,
  },

  error: { color: M.danger, fontSize: 13, marginTop: SPACING.md, textAlign: 'center', lineHeight: 19 },

  checklist: {
    alignSelf: 'stretch', backgroundColor: M.card, marginTop: SPACING.md,
    borderRadius: 14, borderWidth: 1, borderColor: M.border,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
  },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepTick: { fontSize: 15, width: 22 },
  stepLabel: { color: M.ink, fontSize: 14, flex: 1 },
  stepState: { fontSize: 10, fontWeight: '800', letterSpacing: 0.8 },

  cta: {
    alignSelf: 'stretch', flexDirection: 'row', gap: 10,
    backgroundColor: M.black, borderRadius: 16,
    paddingVertical: 19, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg,
    shadowColor: '#101418', shadowOpacity: 0.18, shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 }, elevation: 4,
  },
  ctaBusy: { opacity: 0.72 },
  ctaTxt: { color: '#FFFFFF', fontSize: 17, fontWeight: '700' },
  ctaArrow: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },

  scanNote: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.lg },
  scanNoteTxt: { color: M.body, fontSize: 14 },

  again: { marginTop: SPACING.md, paddingVertical: 10 },
  againTxt: { color: M.body, fontSize: 15, textAlign: 'center' },
  againLink: { color: M.ink, fontWeight: '600' },

  list: { alignSelf: 'stretch', marginTop: SPACING.xl },
  listHead: {
    color: M.label, fontSize: 11, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8,
  },
  device: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: M.card, borderRadius: 12, borderWidth: 1, borderColor: M.border,
    padding: SPACING.md, marginBottom: 8,
  },
  deviceName: { color: M.ink, fontSize: 14, fontWeight: '600' },
  deviceId: { color: M.label, fontSize: 11, marginTop: 2 },
  deviceRssi: { color: M.body, fontSize: 12 },
});
