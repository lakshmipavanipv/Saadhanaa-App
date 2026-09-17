/**
 * RespirationProbeScreen — settle, with the ring on a finger, whether this
 * hardware can give us a real respiration rate.
 *
 * WHY THIS EXISTS
 *
 * Breathing is recoverable from the heartbeat: you speed up slightly on the
 * inhale and slow on the exhale (respiratory sinus arrhythmia), so the gaps
 * between beats wobble in time with the breath. `analytics/Respiration.ts`
 * implements that recovery and is correct. What it needs is the gaps
 * themselves — a beat-to-beat series, several samples per breath.
 *
 * WHAT THE FIRST CAPTURE SHOWED
 *
 * This screen was written to examine `{2,3,16}`, the "continuous-HR notify"
 * whose payload `SadhanaRingService` documents as [minInterval, maxInterval,
 * hr] while reading only byte 2. On an SR16 on a finger, that frame never
 * arrives — not once. The comment describes a frame this firmware does not
 * send, and every plan built on recovering intervals from it was built on
 * nothing.
 *
 * What the ring actually streams is `{2,36,0}`, six bytes, about every 2.6
 * seconds:
 *
 *     50 62 72 88 70 00
 *     50 62 72 90 71 00
 *     50 62 72 97 65 00
 *
 * Bytes 0-2 are frozen; byte 3 climbs; byte 4 drifts down through a plausible
 * resting heart rate; byte 5 is always zero.
 *
 * THE CADENCE IS THE ANSWER, NOT THE BYTES
 *
 * A 2.6 s sample spacing puts the Nyquist ceiling at about 11.5 breaths per
 * minute. Ordinary breathing, 12-20, sits above it and aliases: it is not
 * that we have not decoded the right byte, it is that the rhythm cannot be
 * represented in this stream at all. Only slow pranayama, below that ceiling,
 * remains open.
 *
 * SO THIS SCREEN ASSUMES NOTHING
 *
 * It records every frame, finds the dominant repeating one, reports each
 * byte's range and how many distinct values it takes, and states the ceiling
 * the observed cadence allows. The byte that moves most is the only candidate
 * for a rhythm, and it gets handed to the real estimator. Presuming a frame
 * identity is what produced the fabricated 14 on the Health hub; the fix is
 * to let the capture say what is there.
 *
 * Breathe to the pacer (12 breaths/min) for at least 90 seconds.
 *
 * Nothing here is user-facing. Opened from Device Settings.
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
  saveSr16DeviceId,
  type JieliFrame,
} from '../soulsync/ring';
import { estimateRespirationRate } from '../soulsync/analytics/Respiration';

/** Paced breathing target. 12/min sits mid-band and is easy to hold. */
const PACE_BPM = 12;
const PACE_HALF_MS = (60_000 / PACE_BPM) / 2;   // 2500 ms in, 2500 ms out

/** Nyquist limit for the top of the respiration band (0.40 Hz). */
const MAX_USABLE_GAP_MS = 1250;

/** Below this we tell the user to keep breathing rather than guess. */
const MIN_SAMPLES = 40;

interface Cap { t: number; kind: string; bytes: number[] }

/** Frame identity, e.g. "2/36/0". */
const kindOf = (f: JieliFrame) => `${f.cmd}/${f.key}/${f.keyFlag}`;

const HEX = (b: Uint8Array) => [...b].map((x) => x.toString(16).padStart(2, '0')).join(' ');

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const RespirationProbeScreen = ({ onClose }: { onClose: () => void }) => {
  const [ring, setRing] = useState<SadhanaRing | null>(null);
  const [status, setStatus] = useState('Not connected');
  const [busy, setBusy] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [caps, setCaps] = useState<Cap[]>([]);
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
      // Prefer the paired ring, but do not dead-end when nothing is saved:
      // this screen is opened to answer a hardware question, and sending the
      // user back to pair first is friction for no reason when we can find
      // the ring ourselves. Anything the classifier did not recognise is
      // ignored — connecting the probe to a television proves nothing.
      let id = await readSr16DeviceId();
      if (!id) {
        setStatus('No saved ring — scanning…');
        id = await new Promise<string | null>((resolve) => {
          let best: { id: string; rssi: number } | null = null;
          const stop = SadhanaRing.scan(
            (c) => {
              if (c.hint === 'other') return;
              const rssi = c.rssi ?? -999;
              if (!best || rssi > best.rssi) best = { id: c.id, rssi };
            },
            () => { /* surfaced by the timeout below */ },
            { timeoutMs: 8000 }
          );
          setTimeout(() => { stop(); resolve(best ? best.id : null); }, 8200);
        });
        if (!id) { setStatus('No ring found. Wear it, keep it close, try again.'); return; }
        await saveSr16DeviceId(id);
      }
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
    setLastRaw(null);
    startedAt.current = Date.now();

    offFrameRef.current = r.onFrame((f: JieliFrame) => {
      // Every frame is logged, not just the one under investigation. The
      // opcode table is only partly decoded, so a channel we have never
      // identified may be carrying exactly what respiration needs; that is
      // invisible if we only print the frame we already suspect.
      // Readable from a release build with: adb logcat -s ReactNativeJS:V
      console.log(
        `[RRPROBE] t=${Date.now() - startedAt.current} cmd=${f.cmd} key=${f.key} ` +
        `flag=${f.keyFlag} len=${f.payload.length} hex=${HEX(f.payload)}`
      );

      // Record everything. The frame this screen was written to expect,
      // {2,3,16}, never arrived from this firmware — the live stream is
      // {2,36,0} — so presuming a frame identity here is exactly the mistake
      // that produced the fabricated 14 in the first place. Whichever frame
      // actually repeats is the stream, and the analysis below finds it.
      setLastRaw(`${kindOf(f)}  ${HEX(f.payload)}`);
      setCaps((prev) => [...prev, {
        t: Date.now(),
        kind: kindOf(f),
        bytes: [...f.payload],
      }]);
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
  //
  // Nothing here assumes which frame carries what. The dominant repeating
  // frame is the stream; within it, the byte that moves most is the only
  // candidate for a breathing signal. Both are found from the data.
  const analysis = useMemo(() => {
    if (caps.length < 2) return null;

    const byKind = new Map<string, Cap[]>();
    for (const c of caps) {
      const list = byKind.get(c.kind) ?? [];
      list.push(c);
      byKind.set(c.kind, list);
    }
    const kinds = [...byKind.entries()].sort((a, b) => b[1].length - a[1].length);
    const [kind, rows] = kinds[0];
    if (rows.length < 3) return null;

    const gaps: number[] = [];
    for (let i = 1; i < rows.length; i++) gaps.push(rows[i].t - rows[i - 1].t);
    const gap = median(gaps);

    const width = Math.max(...rows.map((r) => r.bytes.length));
    const cols = Array.from({ length: width }, (_, i) =>
      rows.map((r) => r.bytes[i]).filter((v) => v != null) as number[]
    );
    const stats = cols.map((vals, i) => ({
      i,
      min: Math.min(...vals),
      max: Math.max(...vals),
      distinct: new Set(vals).size,
    }));

    // The byte with the most distinct values is the only one that could be
    // carrying a rhythm; a frozen byte is configuration, not a measurement.
    const live = [...stats].sort((a, b) => b.distinct - a.distinct)[0];

    // Highest breathing rate this cadence can represent at all (Nyquist).
    const ceilingBpm = gap > 0 ? (1000 / gap / 2) * 60 : 0;

    const est = live && live.distinct > 3 && rows.length >= MIN_SAMPLES
      ? estimateRespirationRate(rows.map((r) => r.bytes[live.i] * 10))
      : null;

    return {
      kind,
      kinds: kinds.map(([k, v]) => `${k} ×${v.length}`),
      gap,
      ceilingBpm,
      seconds: (rows[rows.length - 1].t - rows[0].t) / 1000,
      count: rows.length,
      stats,
      live,
      est,
    };
  }, [caps]);

  const verdict = useMemo(() => {
    if (!analysis) return { tone: COLORS.muted, text: 'No frames captured yet.' };
    const { gap, ceilingBpm, live, count } = analysis;

    if (gap > MAX_USABLE_GAP_MS) {
      return {
        tone: COLORS.error,
        text:
          `Frames arrive every ${(gap / 1000).toFixed(1)} s. That caps what can be seen at ` +
          `${ceilingBpm.toFixed(1)} breaths/min, and normal breathing is 12-20. ` +
          `Ordinary breathing cannot be recovered from this stream at any sampling ` +
          `rate this ring offers — slow pranayama below ${ceilingBpm.toFixed(0)}/min is the only case left open.`,
      };
    }
    if (!live || live.distinct <= 2) {
      return { tone: COLORS.error, text: 'No byte in this frame changes. There is no rhythm here to read.' };
    }
    if (count < MIN_SAMPLES) {
      return { tone: COLORS.warning, text: `Keep breathing — ${count}/${MIN_SAMPLES} frames so far.` };
    }
    if (analysis.est) {
      const near = Math.abs(analysis.est.bpm - PACE_BPM) <= 2.5;
      return {
        tone: near ? COLORS.success : COLORS.warning,
        text: near
          ? `Estimate ${analysis.est.bpm.toFixed(1)} br/min against a paced ${PACE_BPM} — a match. Byte ${live.i} carries the breath.`
          : `Estimate ${analysis.est.bpm.toFixed(1)} br/min against a paced ${PACE_BPM}. Not a match; byte ${live.i} moves, but not with your breathing.`,
      };
    }
    return { tone: COLORS.warning, text: 'Frames are fast enough and a byte moves, but no clear rhythm yet.' };
  }, [analysis]);

  const exportCapture = useCallback(() => {
    const head = [
      `Saadhana Ring respiration probe`,
      `frames=${caps.length} kinds=${analysis?.kinds.join(' ') ?? '-'}`,
      `stream=${analysis?.kind ?? '-'} medianGap=${analysis?.gap ?? '-'}ms ceiling=${analysis?.ceilingBpm.toFixed(1) ?? '-'}br/min`,
      `pacedAt=${PACE_BPM}br/min`,
      `t_ms,kind,bytes`,
    ].join('\n');
    const rows = caps
      .map((c) => `${c.t - startedAt.current},${c.kind},${c.bytes.join(' ')}`)
      .join('\n');
    void Share.share({ message: head + '\n' + rows });
  }, [caps, analysis]);

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
            <Text style={styles.cardHead}>What the ring actually sends</Text>
            <Row k="Stream" v={`{${analysis.kind.replace(/\//g, ',')}}  ×${analysis.count}`} />
            <Row k="All frames" v={analysis.kinds.join('  ')} />
            <Row k="Captured" v={`${caps.length}  (${analysis.seconds.toFixed(0)}s)`} />
            <Row k="Median gap" v={`${analysis.gap.toFixed(0)} ms`} />
            <Row k="Can show up to" v={`${analysis.ceilingBpm.toFixed(1)} br/min`} />
            {analysis.stats.map((b) => (
              <Row
                key={b.i}
                k={`byte ${b.i}${analysis.live && b.i === analysis.live.i ? ' ←moves' : ''}`}
                v={b.min === b.max ? `${b.min} (fixed)` : `${b.min}–${b.max}  (${b.distinct} distinct)`}
              />
            ))}
            {lastRaw ? <Row k="Last frame" v={lastRaw} /> : null}
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
