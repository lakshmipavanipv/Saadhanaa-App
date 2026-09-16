/**
 * RespirationProbeScreen — settle, with the ring on a finger, whether this
 * hardware can give us a real respiration rate.
 *
 * WHY THIS EXISTS
 *
 * Breathing is recoverable from the heartbeat: you speed up slightly on the
 * inhale and slow on the exhale (respiratory sinus arrhythmia), so the gaps
 * between beats wobble in time with the breath. `analytics/Respiration.ts`
 * already implements that recovery correctly. What it needs is the gaps
 * themselves — a beat-to-beat series, several samples per breath.
 *
 * `SadhanaRingService.buildSample()` reports `rrMs: []` because the SR16 was
 * believed to stream no such thing. But its continuous-HR notify carries more
 * than we read:
 *
 *     // {2, 3, 16} continuous-HR notify — payload [minInterval, maxInterval, hr]
 *     const hr = frame.payload[2];
 *
 * Bytes 0 and 1 are named in that comment and then discarded, and the naming
 * was never verified against a capture. They are single bytes, so two readings
 * both fit and cannot be told apart from the code alone:
 *
 *   • R-R intervals in 10 ms units → 30-200 covers 300-2000 ms
 *   • min/max heart rate in bpm    → 20-220
 *
 * This screen decides it with data instead of argument. It records every
 * {2,3,16} frame with a wall-clock timestamp while you breathe to a fixed
 * pace, then reports three things:
 *
 *   1. HOW FAST the frames arrive. Breathing at 0.15-0.40 Hz needs samples
 *      faster than ~1.25 s (Nyquist). If the ring pushes every five seconds,
 *      the question is closed no matter what the bytes mean.
 *   2. WHETHER bytes 0/1 move at all, and over what range. Constant bytes are
 *      not per-beat data.
 *   3. AN INDICATIVE RATE, by feeding the reconstructed series to the real
 *      estimator, so a correct answer near the paced rate is strong evidence.
 *
 * Breathe to the pacer (12 breaths/min) for at least 90 seconds. If the
 * estimate lands near 12, bytes 0/1 are intervals and respiration is solved
 * for every screen at once.
 *
 * Nothing here is user-facing. Opened from Settings beside Ring Debug.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Animated, Easing, Share,
} from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../theme';
import {
  SadhanaRing,
  requestRingPermissions,
  waitForBluetoothOn,
  readSr16DeviceId,
  type JieliFrame,
} from '../soulsync/ring';
import { estimateRespirationRate } from '../soulsync/analytics/Respiration';

/** The frame under investigation. */
const CAP_CMD = 0x02, CAP_KEY = 0x03, CAP_FLAG = 0x10;

/** Paced breathing target. 12/min sits mid-band and is easy to hold. */
const PACE_BPM = 12;
const PACE_HALF_MS = (60_000 / PACE_BPM) / 2;   // 2500 ms in, 2500 ms out

/** Nyquist limit for the top of the respiration band (0.40 Hz). */
const MAX_USABLE_GAP_MS = 1250;

/** Below this we tell the user to keep breathing rather than guess. */
const MIN_SAMPLES = 40;

interface Cap { t: number; b0: number; b1: number; hr: number }

const HEX = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

type Reading = 'rr10ms' | 'bpm' | 'unknown';

/**
 * Decide what bytes 0/1 most plausibly are, from their observed range.
 * Deliberately conservative: overlapping ranges report 'unknown' rather than
 * picking, because a confident wrong label here would send us down a month of
 * decoding the wrong field.
 */
function readingOf(vals: number[]): Reading {
  if (vals.length < 10) return 'unknown';
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const asRr = lo >= 25 && hi <= 205;    // 250-2050 ms
  const asBpm = lo >= 30 && hi <= 220;
  if (asRr && !asBpm) return 'rr10ms';
  if (asBpm && !asRr) return 'bpm';
  return 'unknown';
}

export const RespirationProbeScreen = ({ onClose }: { onClose: () => void }) => {
  const [ring, setRing] = useState<SadhanaRing | null>(null);
  const [status, setStatus] = useState('Not connected');
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [caps, setCaps] = useState<Cap[]>([]);
  const [otherFrames, setOtherFrames] = useState(0);
  const [lastRaw, setLastRaw] = useState<string | null>(null);
  const [probeOut, setProbeOut] = useState<string[]>([]);

  const ringRef = useRef<SadhanaRing | null>(null);
  const offFrameRef = useRef<null | (() => void)>(null);
  const startedAt = useRef<number>(0);

  // ── Breathing pacer ────────────────────────────────────────────────────
  const pace = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!capturing) { pace.setValue(0); return; }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pace, { toValue: 1, duration: PACE_HALF_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pace, { toValue: 0, duration: PACE_HALF_MS, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [capturing, pace]);

  useEffect(() => () => { offFrameRef.current?.(); }, []);

  // ── Connect ────────────────────────────────────────────────────────────
  const connect = useCallback(async () => {
    setBusy(true);
    try {
      if (!(await requestRingPermissions())) { setStatus('Bluetooth permission denied'); return; }
      if (!(await waitForBluetoothOn())) { setStatus('Bluetooth is off'); return; }
      const id = await readSr16DeviceId();
      if (!id) { setStatus('No saved ring — pair it first from Settings'); return; }
      setStatus('Connecting…');
      const r = await SadhanaRing.connect(id);
      ringRef.current = r;
      setRing(r);
      setStatus('Connected to ' + id.toUpperCase());
    } catch (e) {
      setStatus('Connect failed: ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  // ── Capture ────────────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    const r = ringRef.current;
    if (!r) return;
    setCaps([]);
    setOtherFrames(0);
    setLastRaw(null);
    startedAt.current = Date.now();

    offFrameRef.current = r.onFrame((f: JieliFrame) => {
      if (f.cmd === CAP_CMD && f.key === CAP_KEY && f.keyFlag === CAP_FLAG) {
        setLastRaw(HEX(f.payload));
        if (f.payload.length >= 3) {
          setCaps((prev) => [...prev, {
            t: Date.now(),
            b0: f.payload[0],
            b1: f.payload[1],
            hr: f.payload[2],
          }]);
        }
      } else {
        setOtherFrames((n) => n + 1);
      }
    });

    try {
      // Ask the ring to stream heart rate continuously. Every start must be
      // paired with a stop — see setLiveMetric's contract.
      await r.setLiveMetric('hr', true);
      setCapturing(true);
      setStatus('Capturing — breathe with the circle');
    } catch (e) {
      offFrameRef.current?.();
      offFrameRef.current = null;
      setStatus('Could not start live HR: ' + (e as Error).message);
    }
  }, []);

  const stopCapture = useCallback(async () => {
    const r = ringRef.current;
    offFrameRef.current?.();
    offFrameRef.current = null;
    setCapturing(false);
    try { await r?.setLiveMetric('hr', false); } catch { /* link already gone */ }
    setStatus('Capture stopped');
  }, []);

  // ── Raw opcode probe ───────────────────────────────────────────────────
  // The opcode table we were handed is a different dialect (single bytes like
  // 0x91) from the {cmd,key,keyFlag} triples this firmware speaks, so we probe
  // the triples this ring is known to accept and dump whatever comes back.
  const probe = useCallback(async (cmd: number, key: number, keyFlag: number, label: string) => {
    const r = ringRef.current;
    if (!r) return;
    const name = `${label} {${cmd},${key},${keyFlag}}`;
    try {
      const reply = await r.queue.send(
        { cmd, key, keyFlag, sendMsgId: 0x00, category: 'UNKNOWN', name: label },
        new Uint8Array(0),
        { expectReply: true, timeoutMs: 3000, maxRetries: 0 }
      );
      setProbeOut((p) => [
        `${name} → ${reply.payload.length} bytes: ${HEX(reply.payload) || '(empty)'}`,
        ...p,
      ].slice(0, 12));
    } catch (e) {
      setProbeOut((p) => [`${name} → no reply (${(e as Error).message})`, ...p].slice(0, 12));
    }
  }, []);

  // ── Analysis ───────────────────────────────────────────────────────────
  const analysis = useMemo(() => {
    if (caps.length < 2) return null;
    const gaps: number[] = [];
    for (let i = 1; i < caps.length; i++) gaps.push(caps[i].t - caps[i - 1].t);
    const gap = median(gaps);

    const b0 = caps.map((c) => c.b0);
    const b1 = caps.map((c) => c.b1);
    const hr = caps.map((c) => c.hr);
    const spread = (xs: number[]) => Math.max(...xs) - Math.min(...xs);
    const distinct = (xs: number[]) => new Set(xs).size;

    const reading = readingOf([...b0, ...b1]);

    // Reconstruct a millisecond series from the two bytes, under whichever
    // reading the ranges support, and hand it to the real estimator.
    let rrMs: number[] | null = null;
    if (reading === 'rr10ms') rrMs = caps.map((c) => ((c.b0 + c.b1) / 2) * 10);
    else if (reading === 'bpm') rrMs = caps.map((c) => 60_000 / Math.max(1, (c.b0 + c.b1) / 2));

    const est = rrMs && rrMs.length >= MIN_SAMPLES ? estimateRespirationRate(rrMs) : null;

    return {
      gap,
      seconds: (caps[caps.length - 1].t - caps[0].t) / 1000,
      b0: { min: Math.min(...b0), max: Math.max(...b0), spread: spread(b0), distinct: distinct(b0) },
      b1: { min: Math.min(...b1), max: Math.max(...b1), spread: spread(b1), distinct: distinct(b1) },
      hr: { min: Math.min(...hr), max: Math.max(...hr) },
      reading,
      est,
    };
  }, [caps]);

  const verdict = useMemo(() => {
    if (!analysis) return { tone: COLORS.muted, text: 'No frames captured yet.' };
    if (caps.length < MIN_SAMPLES) {
      return { tone: COLORS.warning, text: `Keep breathing — ${caps.length}/${MIN_SAMPLES} frames so far.` };
    }
    if (analysis.gap > MAX_USABLE_GAP_MS) {
      return {
        tone: COLORS.error,
        text: `Frames arrive every ${(analysis.gap / 1000).toFixed(1)} s. Breathing needs faster than ${(MAX_USABLE_GAP_MS / 1000).toFixed(2)} s, so this channel cannot carry it — whatever the bytes mean.`,
      };
    }
    if (analysis.b0.distinct <= 2 && analysis.b1.distinct <= 2) {
      return {
        tone: COLORS.error,
        text: 'Bytes 0 and 1 barely change. They are not per-beat values, so there is no wobble to read a breath from.',
      };
    }
    if (analysis.est) {
      const near = Math.abs(analysis.est.bpm - PACE_BPM) <= 2.5;
      return {
        tone: near ? COLORS.success : COLORS.warning,
        text: near
          ? `Estimate ${analysis.est.bpm.toFixed(1)} br/min against a paced ${PACE_BPM}. That is a match — bytes 0/1 carry beat-to-beat timing and respiration is recoverable on this hardware.`
          : `Estimate ${analysis.est.bpm.toFixed(1)} br/min against a paced ${PACE_BPM}. Not a match yet — capture longer, or the bytes mean something else.`,
      };
    }
    return {
      tone: COLORS.warning,
      text: 'Frames are fast enough and the bytes move, but no clear breathing rhythm stood above the noise yet. Keep going to 2 minutes.',
    };
  }, [analysis, caps.length]);

  const exportCapture = useCallback(() => {
    const head = [
      `Saadhana Ring respiration probe`,
      `frames=${caps.length} others=${otherFrames} medianGap=${analysis?.gap ?? '-'}ms`,
      `reading=${analysis?.reading ?? '-'} pacedAt=${PACE_BPM}br/min`,
      `t_ms,b0,b1,hr`,
    ].join('\n');
    const rows = caps.map((c) => `${c.t - startedAt.current},${c.b0},${c.b1},${c.hr}`).join('\n');
    void Share.share({ message: head + '\n' + rows });
  }, [caps, otherFrames, analysis]);

  const paceScale = pace.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>Respiration probe</Text>
        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Text style={styles.close}>Close</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Text style={styles.status}>{status}</Text>

        {!ring ? (
          <TouchableOpacity style={styles.btn} onPress={() => void connect()} disabled={busy}>
            <Text style={styles.btnTxt}>{busy ? 'Working…' : 'Connect to saved ring'}</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Pacer ───────────────────────────────────────────────────── */}
        {capturing ? (
          <View style={styles.pacerBox}>
            <Animated.View style={[styles.pacer, { transform: [{ scale: paceScale }] }]} />
            <Text style={styles.pacerTxt}>Breathe in as it grows, out as it shrinks — {PACE_BPM}/min</Text>
          </View>
        ) : null}

        {ring ? (
          <TouchableOpacity
            style={[styles.btn, capturing ? styles.btnStop : null]}
            onPress={() => void (capturing ? stopCapture() : startCapture())}
          >
            <Text style={styles.btnTxt}>{capturing ? 'Stop capture' : 'Start capture'}</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Live numbers ────────────────────────────────────────────── */}
        {analysis ? (
          <View style={styles.card}>
            <Text style={styles.cardHead}>{'{2,3,16} frames'}</Text>
            <Row k="Captured" v={`${caps.length}  (${analysis.seconds.toFixed(0)}s)`} />
            <Row k="Median gap" v={`${analysis.gap.toFixed(0)} ms`} />
            <Row k="Other frames" v={String(otherFrames)} />
            <Row k="byte 0" v={`${analysis.b0.min}–${analysis.b0.max}  (${analysis.b0.distinct} distinct)`} />
            <Row k="byte 1" v={`${analysis.b1.min}–${analysis.b1.max}  (${analysis.b1.distinct} distinct)`} />
            <Row k="byte 2 (hr)" v={`${analysis.hr.min}–${analysis.hr.max} bpm`} />
            <Row k="Reads as" v={
              analysis.reading === 'rr10ms' ? 'R-R intervals (×10 ms)'
                : analysis.reading === 'bpm' ? 'heart rate (bpm)'
                  : 'ambiguous'
            } />
            {lastRaw ? <Row k="Last payload" v={lastRaw} /> : null}
          </View>
        ) : null}

        <View style={[styles.card, { borderColor: verdict.tone }]}>
          <Text style={[styles.cardHead, { color: verdict.tone }]}>Verdict</Text>
          <Text style={styles.verdict}>{verdict.text}</Text>
        </View>

        {caps.length > 0 ? (
          <TouchableOpacity style={styles.btnGhost} onPress={exportCapture}>
            <Text style={styles.btnGhostTxt}>Export capture ({caps.length} rows)</Text>
          </TouchableOpacity>
        ) : null}

        {/* ── Raw opcode probe ────────────────────────────────────────── */}
        {ring ? (
          <View style={styles.card}>
            <Text style={styles.cardHead}>Ask the ring directly</Text>
            <Text style={styles.hint}>
              Does any channel hand over the beat list rather than a summary?
            </Text>
            <View style={styles.probeRow}>
              <Probe label="HRV timed" onPress={() => void probe(0x02, 106, 0x00, 'HRV timed')} />
              <Probe label="HRV live" onPress={() => void probe(0x02, 0x0a, 0x10, 'HRV live')} />
              <Probe label="HR timed" onPress={() => void probe(0x02, 22, 0x00, 'HR timed')} />
              <Probe label="0x91" onPress={() => void probe(0x02, 0x91, 0x00, 'table 0x91')} />
            </View>
            {probeOut.map((line, i) => (
              <Text key={i} style={styles.probeOut}>{line}</Text>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
};

const Row: React.FC<{ k: string; v: string }> = ({ k, v }) => (
  <View style={styles.row}>
    <Text style={styles.rowK}>{k}</Text>
    <Text style={styles.rowV} numberOfLines={1}>{v}</Text>
  </View>
);

const Probe: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => (
  <TouchableOpacity style={styles.probeBtn} onPress={onPress}>
    <Text style={styles.probeBtnTxt}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.deep },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingTop: SPACING.xl, paddingBottom: SPACING.sm,
  },
  title: { color: COLORS.cream, fontSize: FONT_SIZES.lg, fontWeight: '700' },
  close: { color: COLORS.gold, fontSize: FONT_SIZES.base, fontWeight: '600' },

  body: { padding: SPACING.md, paddingBottom: SPACING.xl * 2 },
  status: { color: COLORS.muted, fontSize: FONT_SIZES.sm, marginBottom: SPACING.md },

  btn: {
    backgroundColor: COLORS.gold, borderRadius: BORDER_RADIUS.md,
    paddingVertical: 14, alignItems: 'center', marginBottom: SPACING.md,
  },
  btnStop: { backgroundColor: COLORS.error },
  btnTxt: { color: COLORS.deep, fontSize: FONT_SIZES.base, fontWeight: '700' },

  btnGhost: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.md,
    paddingVertical: 12, alignItems: 'center', marginBottom: SPACING.md,
  },
  btnGhostTxt: { color: COLORS.cream, fontSize: FONT_SIZES.sm, fontWeight: '600' },

  pacerBox: { alignItems: 'center', marginBottom: SPACING.md },
  pacer: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: 'rgba(212,160,23,0.18)',
    borderWidth: 2, borderColor: COLORS.gold,
  },
  pacerTxt: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: SPACING.sm, textAlign: 'center' },

  card: {
    backgroundColor: COLORS.cardBg, borderRadius: BORDER_RADIUS.md,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  cardHead: {
    color: COLORS.gold, fontSize: FONT_SIZES.xs, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 5, gap: 12 },
  rowK: { color: COLORS.muted, fontSize: FONT_SIZES.sm },
  rowV: { color: COLORS.cream, fontSize: FONT_SIZES.sm, fontWeight: '600', flexShrink: 1 },

  verdict: { color: COLORS.cream, fontSize: FONT_SIZES.sm, lineHeight: 20 },
  hint: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginBottom: SPACING.sm, lineHeight: 17 },

  probeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.sm },
  probeBtn: {
    borderWidth: 1, borderColor: COLORS.border, borderRadius: BORDER_RADIUS.sm,
    paddingHorizontal: 12, paddingVertical: 8,
  },
  probeBtnTxt: { color: COLORS.cream, fontSize: FONT_SIZES.xs, fontWeight: '600' },
  probeOut: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 4, fontFamily: 'monospace' },
});
