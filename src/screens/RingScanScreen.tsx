/**
 * RingScanScreen — the ONE place in the app where pairing happens.
 *
 * Shape (deliberately small):
 *   • A radar you tap to start/stop a 15-second scan.
 *   • A flat list of every named Bluetooth device the scan sees, newest info
 *     wins per id (SCAN_RSP upgrades of nameless ADV_IND).
 *   • A saved-ring Reconnect card at the top whenever a ring is remembered.
 *   • An Unbind pill at the bottom whenever a ring is remembered.
 *
 * That is the whole surface. There is no "primary" auto-pick, no hero
 * identity card, no classifier-driven filtering of what is or is not a ring.
 * Earlier builds tried to be clever and picked one BT device for the user —
 * sometimes a neighbour's doorbell — and the simpler apps that just show a
 * list did better in practice. So: show the list, let the user decide.
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
  readSr16Device,
  saveSr16DeviceName,
  type ScannedRing,
} from '../soulsync/ring';
import { ringLink } from '../soulsync/ring/ringLink';

/** Dark palette — matches the rest of the hub. See the note in v1.0.117. */
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

/**
 * How long the transport will keep its own `startDeviceScan` open. Set well
 * past any reasonable advertise interval so the UI's STOP button, not a
 * timer, is what ends a scan — a ring worn on the hand advertises more
 * sparsely than one in a packet, and the previous 15 s window cut users
 * off before their own ring had broadcast.
 */
const SCAN_MS = 10 * 60_000;
const RADAR = 236;

type Signal = { label: string; bars: 1 | 2 | 3 };

const signalOf = (rssi: number | null | undefined): Signal | null => {
  if (rssi == null) return null;
  if (rssi >= -60) return { label: 'Strong', bars: 3 };
  if (rssi >= -75) return { label: 'Good', bars: 2 };
  return { label: 'Weak', bars: 1 };
};

export const RingScanScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();

  const [candidates, setCandidates] = useState<ScannedRing[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectedName, setConnectedName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [bound, setBound] = useState<string | null>(null);
  const [boundName, setBoundName] = useState<string | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const stopScanRef = useRef<null | (() => void)>(null);
  const scanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Radar animations ────────────────────────────────────────────────
  const p1 = useRef(new Animated.Value(0)).current;
  const p2 = useRef(new Animated.Value(0)).current;
  const p3 = useRef(new Animated.Value(0)).current;
  const sweep = useRef(new Animated.Value(0)).current;
  const breath = useRef(new Animated.Value(0)).current;

  // Idle breath on the search button — only while NOT scanning. During a
  // live scan the three radar pings and the sweep carry the animation; the
  // core should sit still as the thing being swept over, not add a fourth
  // motion that fights them.
  useEffect(() => {
    if (scanning) { breath.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [breath, scanning]);

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

  // ── Scan ────────────────────────────────────────────────────────────
  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    if (scanTimerRef.current) { clearTimeout(scanTimerRef.current); scanTimerRef.current = null; }
    setScanning(false);
  }, []);

  const startScan = useCallback(async () => {
    if (scanning) { stopScan(); return; }
    setError(null);
    setCandidates([]);

    const granted = await requestRingPermissions();
    if (!granted) {
      setError('Bluetooth permission was declined. Grant it in Android Settings to pair your ring.');
      return;
    }
    const on = await waitForBluetoothOn();
    if (!on) {
      setError('Bluetooth is switched off. Turn it on, then tap the radar again.');
      return;
    }

    setScanning(true);
    stopScanRef.current = SadhanaRing.scan(
      (r) => {
        setCandidates((prev) => {
          const idx = prev.findIndex((p) => p.id === r.id);
          if (idx < 0) return [...prev, r];
          const next = prev.slice();
          next[idx] = r;
          return next;
        });
      },
      (err) => setError('Scan error: ' + err),
      { timeoutMs: SCAN_MS, permissive: true }
    );

    scanTimerRef.current = setTimeout(() => {
      setScanning(false);
      stopScanRef.current = null;
    }, SCAN_MS);
  }, [scanning, stopScan]);

  // Stop the scan when the screen unmounts.
  useEffect(() => () => { stopScan(); }, [stopScan]);

  // ── Connect ─────────────────────────────────────────────────────────
  const connect = useCallback(async (r: ScannedRing) => {
    stopScan();
    setConnectingId(r.id);
    setError(null);
    try {
      const ring = await SadhanaRing.connect(r.id);
      await saveSr16DeviceId(r.id, r.name);
      ringLink.pairingChanged();
      void ring.device.vibrate(1).catch(() => { /* harmless */ });
      setConnectedName(r.name || r.id);
    } catch (e) {
      setError('Could not connect: ' + (e as Error).message);
    } finally {
      setConnectingId(null);
    }
  }, [stopScan]);

  // ── Saved ring, remembered across sessions ─────────────────────────
  useEffect(() => {
    void readSr16Device().then((rec) => {
      setBound(rec?.id ?? null);
      setBoundName(rec?.name ?? null);
    });
  }, [connectedName]);

  const reconnectSaved = useCallback(async () => {
    if (!bound) return;
    stopScan();
    setReconnecting(true);
    setError(null);
    try {
      const ring = await SadhanaRing.connect(bound);
      void ring.device.vibrate(1).catch(() => { /* harmless */ });
      let name = boundName;
      try {
        const live = await ring.device.getBtName();
        if (live) { name = live; await saveSr16DeviceName(live); setBoundName(live); }
      } catch { /* firmware may not answer; the saved name stands */ }
      setConnectedName(name || bound);
      ringLink.retryNow('manual-reconnect');
    } catch (e) {
      setError('Could not reach your ring: ' + (e as Error).message +
        '. Make sure it is charged and within arm’s reach, then try again.');
    } finally {
      setReconnecting(false);
    }
  }, [bound, boundName, stopScan]);

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
            ringLink.pairingChanged();
            setBound(null);
            setConnectedName(null);
          },
        },
      ]
    );
  }, [bound]);

  // ── Derived display state ──────────────────────────────────────────
  const connected = !!connectedName;

  // Rings (the classifier recognised them) float to the top; the rest keep
  // scanning order. We never hide anything with a name.
  const ranked = useMemo(() => {
    const byRssi = (a: ScannedRing, b: ScannedRing) => (b.rssi ?? -999) - (a.rssi ?? -999);
    const rings = candidates.filter((c) => c.hint !== 'other').sort(byRssi);
    const others = candidates.filter((c) => c.hint === 'other').sort(byRssi);
    return [...rings, ...others];
  }, [candidates]);

  const eyebrow = connected ? { text: 'CONNECTED', tone: M.green }
    : scanning
      ? { text: ranked.length > 0 ? `${ranked.length} FOUND · STILL SCANNING` : 'SCANNING', tone: M.gold }
      : ranked.length > 0
        ? { text: `${ranked.length} DEVICE${ranked.length === 1 ? '' : 'S'} FOUND`, tone: M.gold }
        : { text: 'TAP THE RADAR TO SEARCH', tone: M.body };

  const title = connected ? 'Ring connected'
    : scanning ? 'Searching for rings'
      : ranked.length > 0 ? 'Tap your ring to pair'
        : 'Ready when you are';

  const body = connected
    ? 'Paired with ' + (connectedName ?? 'your ring') + '. Taps and vitals now sync automatically.'
    : scanning
      ? 'Keep the ring within arm’s reach. Tap STOP when yours appears.'
      : ranked.length > 0
        ? 'Rings are at the top. Tap the one on your finger.'
        : 'Make sure your ring is charged and near the phone, then tap the radar.';

  const coreScale = breath.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1.03] });
  const sweepSpin = sweep.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor={M.ground} />

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

      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          onPress={() => navigation?.goBack?.()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          style={styles.iconBtn}
        >
          <BackChevron />
        </TouchableOpacity>

        <Text style={styles.headerTitle}>SAADHANA RING</Text>

        <View style={styles.countSlot}>
          {ranked.length > 0 && !connected ? (
            <View style={styles.countPill}>
              <Text style={styles.countTxt}>{ranked.length}</Text>
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

          <View style={[styles.orbit, { width: RADAR, height: RADAR, borderRadius: RADAR / 2 }]} />
          <View style={[styles.orbit, { width: RADAR * 0.72, height: RADAR * 0.72, borderRadius: RADAR * 0.36 }]} />

          {/*
           * The core is the search button, no longer disguised as a ring
           * illustration. Big and legible: label on top, state underneath.
           * The breath animation runs only while NOT scanning — so an idle
           * screen reads as "button waiting to be pressed", a live scan
           * reads as "working", and connected reads as a steady green mark.
           */}
          <TouchableOpacity
            onPress={() => void startScan()}
            disabled={!!connectingId}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={scanning ? 'Stop scanning' : 'Search for rings'}
            accessibilityHint={scanning ? 'Stops the Bluetooth scan' : 'Starts a Bluetooth scan'}
          >
            <Animated.View
              style={[
                styles.core,
                connected && styles.coreConnected,
                scanning && styles.coreScanning,
                { transform: [{ scale: scanning ? 1 : coreScale }] },
              ]}
            >
              {connected ? (
                <>
                  <RingMark tone={M.green} />
                  <Text style={[styles.coreLabel, { color: M.green }]}>CONNECTED</Text>
                </>
              ) : (
                <>
                  <SearchGlyph tone={scanning ? M.gold : M.gold} />
                  <Text style={styles.coreLabel}>{scanning ? 'STOP' : 'SEARCH'}</Text>
                </>
              )}
            </Animated.View>
          </TouchableOpacity>
        </View>

        <View style={styles.eyebrowRow}>
          <View style={[styles.eyebrowDot, { backgroundColor: eyebrow.tone }]} />
          <Text style={[styles.eyebrow, { color: eyebrow.tone }]}>{eyebrow.text}</Text>
        </View>

        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{body}</Text>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Saved-ring card — reconnect without scanning first. */}
        {bound && !connected ? (
          <TouchableOpacity
            style={styles.saved}
            onPress={() => void reconnectSaved()}
            activeOpacity={0.85}
            disabled={reconnecting}
          >
            <View style={[styles.deviceDot, { backgroundColor: M.green }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.savedName} numberOfLines={1}>{boundName || 'Your paired ring'}</Text>
              <Text style={styles.savedId} numberOfLines={1}>{bound.toUpperCase()}</Text>
            </View>
            {reconnecting
              ? <ActivityIndicator color={M.green} />
              : <Text style={styles.savedCta}>Reconnect</Text>}
          </TouchableOpacity>
        ) : null}

        {connected ? (
          <TouchableOpacity style={styles.cta} onPress={() => navigation?.goBack?.()} activeOpacity={0.85}>
            <Text style={styles.ctaTxt}>Done</Text>
            <Text style={styles.ctaArrow}>→</Text>
          </TouchableOpacity>
        ) : null}

        {/* The list. Everything named shows up here, rings at the top. */}
        {ranked.length > 0 && !connected ? (
          <View style={styles.list}>
            <Text style={styles.listHead}>
              {scanning ? 'TAP A DEVICE TO PAIR' : 'DEVICES NEARBY · TAP TO PAIR'}
            </Text>
            {ranked.map((c) => {
              const s = signalOf(c.rssi);
              const isRing = c.hint !== 'other';
              const isBusy = connectingId === c.id;
              return (
                <TouchableOpacity
                  key={c.id}
                  style={[styles.device, isRing && styles.deviceRing]}
                  onPress={() => void connect(c)}
                  activeOpacity={0.8}
                  disabled={!!connectingId}
                >
                  <View style={[styles.deviceDot, { backgroundColor: isRing ? M.gold : M.label }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.deviceNameRow}>
                      <Text style={styles.deviceName} numberOfLines={1}>
                        {c.name || 'Unnamed device'}
                      </Text>
                      {isRing ? (
                        <View style={styles.ringTag}>
                          <Text style={styles.ringTagTxt}>RING</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.deviceId} numberOfLines={1}>
                      {c.id.toUpperCase()}
                    </Text>
                  </View>
                  {isBusy ? (
                    <ActivityIndicator color={M.gold} />
                  ) : (
                    <>
                      {s ? <SignalBars bars={s.bars} /> : null}
                      <Text style={styles.deviceRssi}>{c.rssi != null ? c.rssi : ''}</Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

        {scanning && ranked.length === 0 ? (
          <View style={styles.scanNote}>
            <ActivityIndicator color={M.gold} />
            <Text style={styles.scanNoteTxt}>Listening for nearby devices…</Text>
          </View>
        ) : null}

        {bound ? (
          <TouchableOpacity onPress={unbind} activeOpacity={0.7} style={styles.unbind}>
            <Text style={styles.unbindTxt}>Unbind this ring</Text>
            <Text style={styles.unbindId} numberOfLines={1}>{bound.toUpperCase()}</Text>
          </TouchableOpacity>
        ) : null}
      </ScrollView>
    </View>
  );
};

// ── Small subcomponents ──────────────────────────────────────────────

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

const RingMark: React.FC<{ tone: string }> = ({ tone }) => (
  <Svg width={64} height={64} viewBox="0 0 80 80">
    <Circle cx={40} cy={40} r={29} stroke={tone} strokeWidth={4.5} fill="none" />
    <Circle cx={40} cy={40} r={29} stroke={tone} strokeWidth={12} strokeOpacity={0.12} fill="none" />
    <Circle cx={40} cy={40} r={10} fill={tone} />
  </Svg>
);

/** Magnifying-glass glyph — the search button's visual hook. */
const SearchGlyph: React.FC<{ tone: string }> = ({ tone }) => (
  <Svg width={52} height={52} viewBox="0 0 24 24">
    <Circle cx={10.5} cy={10.5} r={6.5} stroke={tone} strokeWidth={2.2} fill="none" />
    <Path
      d="M15.5 15.5 L21 21"
      stroke={tone}
      strokeWidth={2.4}
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
);

const BackChevron: React.FC = () => (
  <Svg width={22} height={22} viewBox="0 0 22 22">
    <Path d="M14 4 L7 11 L14 18" stroke={M.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
  </Svg>
);

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

  hero: {
    width: RADAR, height: RADAR, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg, marginBottom: SPACING.xl,
  },
  ping: {
    position: 'absolute', width: RADAR, height: RADAR, borderRadius: RADAR / 2,
    borderWidth: 1.5, borderColor: M.gold,
  },
  sweep: { position: 'absolute', width: RADAR, height: RADAR },
  orbit: { position: 'absolute', borderWidth: 1, borderColor: M.line },
  core: {
    width: 136, height: 136, borderRadius: 68,
    backgroundColor: M.card,
    borderWidth: 2, borderColor: 'rgba(240,208,138,0.55)',
    alignItems: 'center', justifyContent: 'center',
    gap: 8,
    shadowColor: M.gold, shadowOpacity: 0.35, shadowRadius: 26,
    shadowOffset: { width: 0, height: 0 }, elevation: 10,
  },
  // While scanning, soften the border so the pings read as the primary
  // activity instead of fighting the core.
  coreScanning: { borderColor: 'rgba(240,208,138,0.32)' },
  coreConnected: { borderColor: 'rgba(123,228,184,0.55)', shadowColor: M.green },
  coreLabel: {
    fontSize: 13, fontWeight: '800', letterSpacing: 2.2,
    color: M.gold,
  },

  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  eyebrowDot: { width: 6, height: 6, borderRadius: 3 },
  eyebrow: { fontSize: 11, fontWeight: '800', letterSpacing: 1.8 },

  title: { color: M.ink, fontSize: 27, fontWeight: '700', textAlign: 'center', letterSpacing: -0.4 },
  subtitle: {
    color: M.body, fontSize: 14.5, textAlign: 'center',
    marginTop: 10, marginBottom: SPACING.xl, paddingHorizontal: 10, lineHeight: 22,
  },

  error: { color: M.danger, fontSize: 13, marginTop: SPACING.md, textAlign: 'center', lineHeight: 19 },

  cta: {
    alignSelf: 'stretch', flexDirection: 'row', gap: 10,
    backgroundColor: M.gold, borderRadius: 16,
    paddingVertical: 18, alignItems: 'center', justifyContent: 'center',
    marginTop: SPACING.lg,
    shadowColor: M.gold, shadowOpacity: 0.30, shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  ctaTxt: { color: M.ground, fontSize: 16.5, fontWeight: '800' },
  ctaArrow: { color: M.ground, fontSize: 17, fontWeight: '800' },

  scanNote: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: SPACING.lg },
  scanNoteTxt: { color: M.body, fontSize: 14 },

  saved: {
    alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(52,211,153,0.07)', borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.28)',
    paddingHorizontal: 14, paddingVertical: 14,
    marginTop: 4,
  },
  savedName: { color: M.ink, fontSize: 15, fontWeight: '700' },
  savedId: { color: M.label, fontSize: 11, marginTop: 2, letterSpacing: 0.4 },
  savedCta: { color: M.green, fontSize: 13, fontWeight: '700' },

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
  deviceRing: { borderColor: 'rgba(240,208,138,0.35)', backgroundColor: 'rgba(240,208,138,0.06)' },
  deviceDot: { width: 7, height: 7, borderRadius: 3.5 },
  deviceNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deviceName: { color: M.ink, fontSize: 14.5, fontWeight: '600', flexShrink: 1 },
  ringTag: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4,
    backgroundColor: 'rgba(240,208,138,0.18)',
    borderWidth: 1, borderColor: 'rgba(240,208,138,0.40)',
  },
  ringTagTxt: { color: M.gold, fontSize: 9, fontWeight: '800', letterSpacing: 0.8 },
  deviceId: { color: M.label, fontSize: 11, marginTop: 2, letterSpacing: 0.4 },
  deviceRssi: { color: M.body, fontSize: 11.5, fontWeight: '700', minWidth: 28, textAlign: 'right' },

  unbind: {
    alignSelf: 'stretch', marginTop: SPACING.lg,
    paddingVertical: 14, alignItems: 'center',
    borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,122,133,0.35)',
    backgroundColor: 'rgba(255,122,133,0.06)',
  },
  unbindTxt: { color: M.danger, fontSize: 14.5, fontWeight: '700' },
  unbindId: { color: M.label, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
});
