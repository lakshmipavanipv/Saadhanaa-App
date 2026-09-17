/**
 * RingScanScreen — pair the Saadhana Ring.
 *
 * The user-facing way to connect a ring; Ring Debug stays as the developer
 * tool.
 *
 * NOTE ON THEMING — this screen previously pinned itself to a light mint
 * palette to match a supplied mock, and was the only screen in the app that
 * opted out of the product's own colours. That exception is gone: pairing now
 * speaks the same dark ground / gold accent language as the Health hub, which
 * is what made it read as bolted-on. It still does not consult `useTheme()`,
 * because the radar hero is built for a dark ground and a light variant would
 * need its own art direction rather than swapped tokens.
 *
 * Every value on screen is real, never decorative:
 *   • the signal arc is bucketed from the candidate's measured RSSI
 *   • the identity card shows the GATT device id we will actually connect to
 *   • the device count in the header is the number of *rings* seen, not the
 *     number of Bluetooth advertisers in the room
 *   • the eyebrow tracks the same scan state machine as before
 *
 * The three-step checklist (Bluetooth / Found / Verified) is kept, but shown
 * only when the scan fails or errors — that is the moment it earns its space,
 * and a clean "found" state should stay uncluttered.
 *
 * The step states are real, not decoration:
 *   Bluetooth enabled — permission granted and the adapter is on
 *   Found            — at least one candidate RING has been seen
 *   Verified         — a GATT connection opened and the device id was saved
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Animated, Easing,
  ActivityIndicator, StatusBar, useWindowDimensions, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from 'react-native-svg';
import { SPACING } from '../theme';
import {
  SadhanaRing,
  requestRingPermissions,
  waitForBluetoothOn,
  saveSr16DeviceId,
  clearSr16DeviceId,
  readSr16DeviceId,
  type ScannedRing,
} from '../soulsync/ring';

/** Pinned dark palette — the app's own tokens. See the theming note above. */
const M = {
  ground: '#08111B',
  card: '#101828',
  elev: '#172136',
  line: 'rgba(234,240,248,0.08)',
  lineStrong: 'rgba(234,240,248,0.16)',

  ink: '#EAF0F8',
  ink2: '#C3CEDD',
  body: '#8E9BAE',
  label: '#6B7A8F',

  gold: '#F0D08A',
  green: '#7BE4B8',
  amber: '#F5C56B',
  danger: '#FF7A85',
};

type StepState = 'pending' | 'in-progress' | 'done' | 'failed';

const STEP_LABEL: Record<StepState, string> = {
  pending: 'PENDING',
  'in-progress': 'IN PROGRESS',
  done: 'ACTIVE',
  failed: 'FAILED',
};

const SCAN_MS = 15_000;
/** Radar diameter. The three sweep rings expand to exactly this. */
const RADAR = 236;

type Signal = { label: string; bars: 1 | 2 | 3 };

/** RSSI buckets. -60 and -75 dBm are the usual "same room" / "same floor"
 *  boundaries for BLE advertising on a phone held near the hand. */
const signalOf = (rssi: number | null | undefined): Signal | null => {
  if (rssi == null) return null;
  if (rssi >= -60) return { label: 'Strong', bars: 3 };
  if (rssi >= -75) return { label: 'Good', bars: 2 };
  return { label: 'Weak', bars: 1 };
};

export const RingScanScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [bt, setBt] = useState<StepState>('pending');
  const [found, setFound] = useState<StepState>('pending');
  const [verified, setVerified] = useState<StepState>('pending');
  const [candidates, setCandidates] = useState<ScannedRing[]>([]);
  /**
   * Whether to list Bluetooth devices the classifier did not recognise as a
   * ring. Off by default: a scan in a normal home turns up fridges, TVs and
   * earbuds, and a pairing screen that offers to connect to a fridge is asking
   * the user to do the classifier's job. The toggle stays because the four
   * RWfit prefix rules cannot be exhaustive — a ring with unfamiliar firmware
   * would otherwise be unpairable with no way out.
   */
  const [showAll, setShowAll] = useState(false);
  /** The ring already remembered, if any — the one Unbind would forget. */
  const [bound, setBound] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const stopScanRef = useRef<null | (() => void)>(null);

  // Three expanding rings on a staggered loop, plus one continuous sweep.
  // Separate values rather than one shared clock: the stagger is what reads as
  // a radar rather than a single throb.
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const p3 = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  /** Slow in-and-out on the core disc; runs whether or not a scan is live. */
  const breath = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath]);

  // Radar runs only while scanning — a paired ring should not sit under a
  // permanently animating screen.
  useEffect(() => {
    if (!scanning) {
      [p1, p2, p3, sweep].forEach((v) => v.setValue(0));
      return;
    }
    const ping = (v: Animated.Value, delay: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(v, { toValue: 1, duration: 2800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
          Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
        ])
      );
    const spin = Animated.loop(
      Animated.timing(sweep, { toValue: 1, duration: 3600, easing: Easing.linear, useNativeDriver: true })
    );
    const loops = [ping(p1, 0), ping(p2, 930), ping(p3, 1860), spin];
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [scanning, p1, p2, p3, sweep]);

  const startScan = useCallback(async () => {
    setError(null);
    setCandidates([]);
    setShowAll(false);
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
        // "Ring found" means a ring, not any advertiser. A fridge in range used
        // to satisfy this step and turn the checklist green with nothing paired.
        if (r.hint !== 'other') setFound('done');
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

  useEffect(() => { void readSr16DeviceId().then(setBound); }, [connectedName]);

  /**
   * Forget the paired ring.
   *
   * Unbinding lives here because this is the screen about which ring is
   * yours. The Device Settings version asked for confirmation and then only
   * closed the screen — the saved id was never cleared, so the app
   * reconnected to the same ring moments later and the button appeared
   * inert. There is no unbind opcode on this hardware: the pairing exists
   * only as our stored id, so clearing it is the entire operation.
   */
  const unbind = useCallback(() => {
    Alert.alert(
      'Unbind this ring?',
      'The app will forget ' + (bound ? bound.toUpperCase() : 'the paired ring') +
      '. Nothing on the ring itself changes, and your history is kept — you can pair it again from this screen.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unbind',
          style: 'destructive',
          onPress: async () => {
            await clearSr16DeviceId();
            setBound(null);
            setConnectedName(null);
            setVerified('pending');
            void startScan();
          },
        },
      ]
    );
  }, [bound, startScan]);

  // Start automatically — the user came here to pair.
  useEffect(() => {
    void startScan();
    return () => { stopScanRef.current?.(); };
  }, [startScan]);

  const connected = verified === 'done';
  const connecting = verified === 'in-progress';

  // Scanning stays permissive so the "show everything" toggle needs no rescan;
  // the filtering happens here, at the point of display.
  const rings = useMemo(() => candidates.filter((c) => c.hint !== 'other'), [candidates]);
  const unknown = useMemo(() => candidates.filter((c) => c.hint === 'other'), [candidates]);

  // Strongest advertiser first — that is almost always the ring on the hand
  // holding the phone, and it is the one the hero card speaks for.
  const ranked = useMemo(
    () => [...(showAll ? candidates : rings)].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)),
    [showAll, candidates, rings]
  );
  const primary = ranked[0] ?? null;
  const others = ranked.slice(1);
  const signal = signalOf(primary?.rssi);

  const failedScan = !scanning && !connected && !primary;

  const eyebrow = connected ? { text: 'CONNECTED', tone: M.green }
    : connecting ? { text: 'VERIFYING', tone: M.amber }
      : primary ? { text: 'RING DETECTED', tone: M.green }
        : scanning ? { text: 'SCANNING', tone: M.gold }
          : { text: 'NO RING FOUND', tone: M.danger };

  const title = connected ? 'Ring connected'
    : connecting ? 'Verifying your ring'
      : primary ? 'Saadhana Ring found'
        : scanning ? 'Looking for your ring' : 'No ring nearby';

  const body = connected
    ? 'Paired with ' + (connectedName ?? 'your ring') + '. Taps and vitals now sync automatically.'
    : connecting ? 'Opening a secure connection and saving this ring to your profile.'
      : primary ? 'Identified by its Bluetooth signature. Ready to synchronise your vitals.'
        : scanning ? 'Keep the ring within arm’s reach while we listen for it.'
          : 'We could not find a ring nearby. Make sure it is charged and within arm’s reach.';

  // Core disc: a slow breath, and a lift in brightness once a ring is present.
  const coreScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] });
  const sweepSpin = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={M.ground} />

      {/* Ambient wash — gold above, mint below, both barely there. */}
      <Svg width={width} height={520} style={styles.wash} pointerEvents="none">
        <Defs>
          <RadialGradient id="washTop" cx="50%" cy="34%" r="66%">
            <Stop offset="0%" stopColor={connected ? M.green : M.gold} stopOpacity={0.15} />
            <Stop offset="58%" stopColor={connected ? M.green : M.gold} stopOpacity={0.05} />
            <Stop offset="100%" stopColor={M.ground} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={width / 2} cy={250} r={330} fill="url(#washTop)" />
      </Svg>

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.iconBtn}
        >
          <BackChevron />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>SAADHANA RING</Text>

        {/* Real count, and only of rings — the whole point of the filter. */}
        <View style={styles.countSlot}>
          {rings.length > 0 && !connected ? (
            <View style={styles.countPill}>
              <Text style={styles.countTxt}>{rings.length}</Text>
            </View>
          ) : null}
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Radar hero ─────────────────────────────────────────────── */}
        <View style={styles.hero}>
          {scanning ? (
            <>
              <Ping v={p1} />
              <Ping v={p2} />
              <Ping v={p3} />
              <Animated.View
                style={[styles.sweep, { transform: [{ rotate: sweepSpin }] }]}
                pointerEvents="none"
              >
                <SweepArc />
              </Animated.View>
            </>
          ) : null}

          {/* Static orbit guides, so the hero has structure when idle too. */}
          <View style={[styles.orbit, { width: RADAR, height: RADAR, borderRadius: RADAR / 2 }]} />
          <View style={[styles.orbit, { width: RADAR * 0.72, height: RADAR * 0.72, borderRadius: RADAR * 0.36 }]} />

          <Animated.View style={[styles.core, { transform: [{ scale: coreScale }] }]}>
            <RingMark tone={connected ? M.green : M.gold} />
          </Animated.View>
        </View>

        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowDot, { backgroundColor: eyebrow.tone }]} />
          <Text style={[styles.eyebrow, { color: eyebrow.tone }]}>{eyebrow.text}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{body}</Text>

        {/* ── Identity card — the id we will actually open a GATT link to ── */}
        {primary && !connected ? (
          <View style={styles.idCard}>
            <View style={styles.idTop}>
              <View style={styles.idBadge}>
                <Fingerprint tone={M.gold} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.idName} numberOfLines={1}>
                  {primary.name || 'Saadhana Ring'}
                </Text>
                <Text style={styles.idValue} numberOfLines={1}>
                  {primary.id.toUpperCase()}
                </Text>
              </View>
              {signal ? (
                <View style={styles.sigBox}>
                  <SignalBars bars={signal.bars} />
                  <Text style={styles.sigTxt}>{signal.label}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.idMetaRow}>
              <Meta k="SIGNAL" v={primary.rssi != null ? primary.rssi + ' dBm' : '—'} />
              <View style={styles.metaDivider} />
              <Meta k="MATCHED BY" v={hintLabel(primary.hint)} />
            </View>
          </View>
        ) : null}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* The checklist only earns its space when something went wrong. */}
        {failedScan || error ? (
          <View style={styles.checklist}>
            <Step label="Bluetooth enabled" state={bt} />
            <Step label="Ring found" state={found} />
            <Step label="Verified" state={verified} />
          </View>
        ) : null}

        {/* ── Primary action ─────────────────────────────────────────── */}
        {primary && !connected ? (
          <TouchableOpacity
            style={[styles.cta, connecting ? styles.ctaBusy : null]}
            onPress={() => void connect(primary)}
            activeOpacity={0.85}
            disabled={connecting}
          >
            {connecting ? (
              <ActivityIndicator color={M.ground} />
            ) : (
              <>
                <Text style={styles.ctaTxt}>Connect now</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </>
            )}
          </TouchableOpacity>
        ) : null}

        {connected ? (
          <TouchableOpacity style={styles.cta} onPress={() => navigation?.goBack?.()} activeOpacity={0.85}>
            <Text style={styles.ctaTxt}>Done</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>
        ) : null}

        {scanning && !primary ? (
          <View style={styles.scanNote}>
            <ActivityIndicator color={M.gold} />
            <Text style={styles.scanNoteTxt}>Listening for nearby rings…</Text>
          </View>
        ) : null}

        {/* Unbind — only offered when there is something to forget. */}
        {bound ? (
          <TouchableOpacity onPress={unbind} activeOpacity={0.7} style={styles.unbind}>
            <Text style={styles.unbindTxt}>Unbind this ring</Text>
            <Text style={styles.unbindId} numberOfLines={1}>{bound.toUpperCase()}</Text>
          </TouchableOpacity>
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

        {/* Escape hatch: the prefix rules cannot cover every firmware, so a
            ring the classifier misses stays reachable — deliberately, behind a
            tap, rather than by dumping every fridge into the list. */}
        {!connected && !showAll && unknown.length > 0 ? (
          <TouchableOpacity onPress={() => setShowAll(true)} activeOpacity={0.7} style={styles.again}>
            <Text style={styles.againTxt}>
              Don’t see your ring?{' '}
              <Text style={styles.againLink}>
                Show all {unknown.length} Bluetooth device{unknown.length === 1 ? '' : 's'}
              </Text>
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* More than one advertiser in range — keep the ability to pick. */}
        {others.length > 0 && !connected ? (
          <View style={styles.list}>
            <Text style={styles.listHead}>{showAll ? 'Other devices nearby' : 'Other rings nearby'}</Text>
            {others.map((c) => {
              const s = signalOf(c.rssi);
              const isRing = c.hint !== 'other';
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.device}
                  onPress={() => void connect(c)}
                  activeOpacity={0.8}
                >
                  <View style={[styles.deviceDot, { backgroundColor: isRing ? M.gold : M.label }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.deviceName} numberOfLines={1}>
                      {c.name || 'Unnamed device'}
                    </Text>
                    <Text style={styles.deviceId} numberOfLines={1}>{c.id.toUpperCase()}</Text>
                  </View>
                  {s ? <SignalBars bars={s.bars} /> : null}
                  <Text style={styles.deviceRssi}>{c.rssi != null ? c.rssi : ''}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

/** Which of the four RWfit prefix rules claimed this advertiser. */
const hintLabel = (h: ScannedRing['hint']): string => {
  switch (h) {
    case 'a00a-service': return 'Service UUID';
    case 'company-05d6': return 'Vendor 05D6';
    case 'company-06d6': return 'Vendor 06D6';
    case 'name-smartbox': return 'Name';
    case 'name-ac701n': return 'Name';
    default: return 'Unverified';
  }
};

/** One expanding radar ring, driven by a 0→1 value. */
const Ping: React.FC<{ v: Animated.Value }> = ({ v }) => (
  <Animated.View
    pointerEvents="none"
    style={[
      styles.ping,
      {
        transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.34, 1] }) }],
        opacity: v.interpolate({ inputRange: [0, 0.55, 1], outputRange: [0, 0.34, 0] }),
      },
    ]}
  />
);

/** The rotating quadrant that turns three rings into a radar. */
const SweepArc: React.FC = () => (
  <Svg width={RADAR} height={RADAR} viewBox="0 0 236 236">
    <Defs>
      <RadialGradient id="sweepFade" cx="50%" cy="50%" r="50%">
        <Stop offset="30%" stopColor={M.gold} stopOpacity={0} />
        <Stop offset="100%" stopColor={M.gold} stopOpacity={0.5} />
      </RadialGradient>
    </Defs>
    <Path d="M118 118 L118 10 A108 108 0 0 1 208 72 Z" fill="url(#sweepFade)" />
  </Svg>
);

/** The ring seen head-on: outer band, inner bore. */
const RingMark: React.FC<{ tone: string }> = ({ tone }) => (
  <Svg width={80} height={80} viewBox="0 0 80 80">
    <Circle cx={40} cy={40} r={29} stroke={tone} strokeWidth={4.5} fill="none" />
    <Circle cx={40} cy={40} r={29} stroke={tone} strokeWidth={12} strokeOpacity={0.12} fill="none" />
    <Circle cx={40} cy={40} r={10} fill={tone} />
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
  <Svg width={15} height={12} viewBox="0 0 15 12">
    {[0, 1, 2].map((i) => (
      <Path
        key={i}
        d={`M${i * 5 + 1} 11 L${i * 5 + 1} ${11 - (i + 1) * 3.4}`}
        stroke={M.gold}
        strokeWidth={3}
        strokeLinecap="round"
        opacity={i < bars ? 1 : 0.22}
      />
    ))}
  </Svg>
);

const Fingerprint: React.FC<{ tone: string }> = ({ tone }) => (
  <Svg width={22} height={22} viewBox="0 0 24 24">
    <Path d="M3 13a9 9 0 0 1 18 0" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M6 14.5a6 6 0 0 1 12 0" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M9 16a3 3 0 0 1 6 0" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
    <Path d="M12 18.5v1.5" stroke={tone} strokeWidth={1.8} fill="none" strokeLinecap="round" />
  </Svg>
);

const Meta: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <View style={{ flex: 1 }}>
    <Text style={styles.metaK}>{k}</Text>
    <Text style={styles.metaV} numberOfLines={1}>{v}</Text>
  </View>
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
  screen: { flex: 1, backgroundColor: M.ground },
  wash: { position: 'absolute', top: 0, left: 0 },

  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.sm,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  headerTitle: { color: M.ink, fontSize: 13, fontWeight: '700', letterSpacing: 2.6 },
  countSlot: { width: 36, height: 36, alignItems: 'flex-end', justifyContent: 'center' },
  countPill: {
    minWidth: 26, height: 26, borderRadius: 13, paddingHorizontal: 7,
    backgroundColor: 'rgba(240,208,138,0.14)',
    borderWidth: 1, borderColor: 'rgba(240,208,138,0.30)',
    alignItems: 'center', justifyContent: 'center',
  },
  countTxt: { color: M.gold, fontSize: 12, fontWeight: '800' },

  body: { paddingHorizontal: SPACING.lg, alignItems: 'center' },

  // ── Radar ────────────────────────────────────────────────────────────
  hero: {
    width: RADAR, height: RADAR, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg, marginBottom: SPACING.xl,
  },
  ping: {
    position: 'absolute', width: RADAR, height: RADAR, borderRadius: RADAR / 2,
    borderWidth: 1.5, borderColor: M.gold,
  },
  sweep: { position: 'absolute', width: RADAR, height: RADAR },
  orbit: {
    position: 'absolute', borderWidth: 1, borderColor: M.line,
  },
  core: {
    width: 128, height: 128, borderRadius: 64,
    backgroundColor: M.card,
    borderWidth: 1, borderColor: M.lineStrong,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: M.gold, shadowOpacity: 0.28, shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 }, elevation: 8,
  },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },

  title: { color: M.ink, fontSize: 27, fontWeight: '700', textAlign: 'center', letterSpacing: -0.4 },
  subtitle: {
    color: M.body, fontSize: 14.5, textAlign: 'center',
    marginTop: 10, marginBottom: SPACING.xl, paddingHorizontal: 10, lineHeight: 22,
  },

  // ── Identity card ────────────────────────────────────────────────────
  idCard: {
    alignSelf: 'stretch', backgroundColor: M.card, borderRadius: 18,
    borderWidth: 1, borderColor: M.line,
    paddingHorizontal: SPACING.md, paddingTop: 16, paddingBottom: 4,
  },
  idTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  idBadge: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(240,208,138,0.10)',
    borderWidth: 1, borderColor: 'rgba(240,208,138,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  idName: { color: M.ink, fontSize: 16, fontWeight: '700' },
  idValue: { color: M.label, fontSize: 11.5, marginTop: 3, letterSpacing: 0.6 },
  sigBox: { alignItems: 'flex-end', gap: 4 },
  sigTxt: { color: M.body, fontSize: 10.5, fontWeight: '700', letterSpacing: 0.4 },

  idMetaRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 16, paddingTop: 14, paddingBottom: 14,
    borderTopWidth: 1, borderTopColor: M.line,
  },
  metaDivider: { width: 1, height: 26, backgroundColor: M.line, marginHorizontal: 12 },
  metaK: { color: M.label, fontSize: 9, fontWeight: '800', letterSpacing: 1.2 },
  metaV: { color: M.ink2, fontSize: 13, fontWeight: '600', marginTop: 4 },

  error: { color: M.danger, fontSize: 13, marginTop: SPACING.md, textAlign: 'center', lineHeight: 19 },

  checklist: {
    alignSelf: 'stretch', backgroundColor: M.card, marginTop: SPACING.md,
    borderRadius: 16, borderWidth: 1, borderColor: M.line,
    paddingHorizontal: SPACING.md, paddingVertical: 4,
  },
  step: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  stepTick: { fontSize: 15, width: 22 },
  stepLabel: { color: M.ink2, fontSize: 14, flex: 1 },
  stepState: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.9 },

  cta: {
    alignSelf: 'stretch', flexDirection: 'row', gap: 10,
    backgroundColor: M.gold, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg,
    shadowColor: M.gold, shadowOpacity: 0.30, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  ctaBusy: { opacity: 0.72 },
  ctaTxt: { color: M.ground, fontSize: 16.5, fontWeight: '800' },
  ctaArrow: { color: M.ground, fontSize: 17, fontWeight: '800' },

  scanNote: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.lg },
  scanNoteTxt: { color: M.body, fontSize: 14 },

  again: { marginTop: SPACING.md, paddingVertical: 10 },
  againTxt: { color: M.body, fontSize: 14.5, textAlign: 'center' },
  againLink: { color: M.gold, fontWeight: '700' },

  unbind: {
    alignSelf: 'stretch', marginTop: SPACING.lg,
    paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,122,133,0.35)',
    backgroundColor: 'rgba(255,122,133,0.06)',
  },
  unbindTxt: { color: M.danger, fontSize: 14.5, fontWeight: '700' },
  unbindId: { color: M.label, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },

  list: { alignSelf: 'stretch', marginTop: SPACING.xl },
  listHead: {
    color: M.label, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 10,
  },
  device: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: M.card, borderRadius: 14,
    borderWidth: 1, borderColor: M.line,
    paddingHorizontal: 14, paddingVertical: 13, marginBottom: 8,
  },
  deviceDot: { width: 7, height: 7, borderRadius: 3.5 },
  deviceName: { color: M.ink, fontSize: 14.5, fontWeight: '600' },
  deviceId: { color: M.label, fontSize: 11, marginTop: 2, letterSpacing: 0.4 },
  deviceRssi: { color: M.body, fontSize: 11.5, fontWeight: '700', minWidth: 28, textAlign: 'right' },
});
