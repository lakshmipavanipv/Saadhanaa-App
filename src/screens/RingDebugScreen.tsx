/**
 * RingDebugScreen — a self-contained pane for pairing / probing the smart
 * ring. Not part of normal user flow — opened from Settings while we're
 * still bringing the SDK online. Every incoming BLE frame is logged so we
 * can decode opcodes we haven't fully mapped yet.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { COLORS, SPACING, BORDER_RADIUS, FONT_SIZES } from '../theme';
import {
  SadhanaRing,
  requestRingPermissions,
  waitForBluetoothOn,
  saveSr16DeviceId,
  SYNC_METRICS,
  type ScannedRing,
  type JieliFrame,
  type SyncMetric,
} from '../soulsync/ring';
import { VIB_CANDIDATES, resolveCandidate } from '../soulsync/ring/vibrationCandidates';

interface LogLine {
  t: number;
  kind: 'info' | 'error' | 'rx' | 'tx' | 'ok';
  text: string;
}

const HEX = (b: Uint8Array | number[]) =>
  [...b].map((x) => (x & 0xff).toString(16).padStart(2, '0')).join(' ');

export const RingDebugScreen = ({ onClose }: { onClose: () => void }) => {
  const [ring, setRing] = useState<SadhanaRing | null>(null);
  const [candidates, setCandidates] = useState<ScannedRing[]>([]);
  const [scanning, setScanning] = useState(false);
  const [connectedId, setConnectedId] = useState<string | null>(null);
  const [battery, setBattery] = useState<number | null>(null);
  const [firmware, setFirmware] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [lastTapFrame, setLastTapFrame] = useState<string | null>(null);
  const [tapByOpcode, setTapByOpcode] = useState<Record<string, number>>({});

  const stopScanRef = useRef<(() => void) | null>(null);
  const ringRef = useRef<SadhanaRing | null>(null);

  const append = useCallback((line: Omit<LogLine, 't'>) => {
    setLog((prev) => [...prev.slice(-499), { t: Date.now(), ...line }]);
  }, []);

  useEffect(() => () => {
    stopScanRef.current?.();
    // NOTE: intentionally NOT calling ringRef.current?.disconnect() on unmount.
    // The Ring shared singleton (SadhanaRing.connect() registry) is also used
    // by JapaScreen's JapaRingCounter, and tearing down here would kill Japa's
    // live tap stream every time the user closes this modal. The user can
    // still explicitly Disconnect via the button on the connection card.
  }, []);

  const doPermissions = useCallback(async () => {
    const ok = await requestRingPermissions();
    if (!ok) { append({ kind: 'error', text: 'BLE permission denied' }); return false; }
    const on = await waitForBluetoothOn();
    if (!on) { append({ kind: 'error', text: 'Bluetooth is off — please enable it' }); return false; }
    return true;
  }, [append]);

  const startScan = useCallback(async () => {
    if (!(await doPermissions())) return;
    setCandidates([]);
    setScanning(true);
    append({ kind: 'info', text: 'scanning…' });
    stopScanRef.current = SadhanaRing.scan(
      (r) => {
        setCandidates((prev) => prev.some((p) => p.id === r.id) ? prev : [...prev, r]);
      },
      (err) => append({ kind: 'error', text: `scan error: ${err}` }),
      { timeoutMs: 15000, permissive: true }
    );
    // stop indicator after the scan window closes
    setTimeout(() => setScanning(false), 15000);
  }, [append, doPermissions]);

  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setScanning(false);
    append({ kind: 'info', text: 'scan stopped' });
  }, [append]);

  const connect = useCallback(async (id: string, name: string | null) => {
    try {
      append({ kind: 'info', text: `connecting to ${name || id}…` });
      stopScanRef.current?.();
      setScanning(false);

      const r = await SadhanaRing.connect(id, {
        onFrame: (f: JieliFrame) => {
          append({
            kind: 'rx',
            text: `cmd=0x${f.cmd.toString(16).padStart(2,'0')} key=0x${f.key.toString(16).padStart(2,'0')} kf=0x${f.keyFlag.toString(16).padStart(2,'0')} flag=0x${f.flag.toString(16).padStart(2,'0')} len=${f.payload.length}${f.payload.length ? '  [' + HEX(f.payload) + ']' : ''}`,
          });
        },
      });
      ringRef.current = r;
      setRing(r);
      setConnectedId(id);
      // Remember this device so the Japa tab can auto-connect without a rescan.
      void saveSr16DeviceId(id);
      // Tactile confirm: buzz once so the user knows the ring is paired.
      // Fire-and-forget — some SR16 firmware revs may nack, doesn't matter.
      void r.device.vibrate(1).catch(() => { /* silent */ });
      append({ kind: 'ok', text: `connected — platform=${r.info.platform} mtu=${r.info.mtu}` });
      append({ kind: 'info', text: `bound service: ${r.info.dataServiceUuid}` });
      append({ kind: 'info', text: `write: ${r.info.writeCharUuid.slice(0, 8)}…  notify: ${r.info.notifyCharUuid.slice(0, 8)}…` });
      append({ kind: 'info', text: `${r.info.services.length} GATT services total` });
      for (const s of r.info.services) {
        const chars = s.characteristics
          .map((c) => `${c.uuid.slice(0, 8)}${c.write ? 'w' : ''}${c.notify ? 'n' : ''}${c.indicate ? 'i' : ''}`)
          .join(' ');
        append({ kind: 'info', text: `  ${s.service.slice(0, 8)}: ${chars}` });
      }

      r.onDisconnect(() => {
        append({ kind: 'error', text: 'disconnected' });
        setRing(null);
        setConnectedId(null);
        setBattery(null);
        setFirmware(null);
        ringRef.current = null;
      });

      // Tap detector — every non-keep-alive frame bumps the count, remembers
      // the last opcode, AND increments a per-opcode tally. This lets us
      // visually distinguish hold-click vs single-click on the ring: if the
      // firmware treats them as different actions, they'll land on different
      // opcodes and appear as separate rows in the breakdown.
      r.onFrame((f) => {
        const opKey = `${f.cmd.toString(16).padStart(2,'0')}.${f.key.toString(16).padStart(2,'0')}.${f.keyFlag.toString(16).padStart(2,'0')}.len${f.payload.length}`;
        setTapCount((c) => c + 1);
        setLastTapFrame(`cmd=0x${f.cmd.toString(16).padStart(2,'0')} key=0x${f.key.toString(16).padStart(2,'0')} kf=0x${f.keyFlag.toString(16).padStart(2,'0')} len=${f.payload.length}`);
        setTapByOpcode((prev) => ({ ...prev, [opKey]: (prev[opKey] ?? 0) + 1 }));
      });

      // Probe battery + firmware right away — validates the send queue end-to-end.
      try {
        const bat = await r.device.getBattery();
        setBattery(bat.percent);
        append({ kind: 'ok', text: `battery: ${bat.percent}%  (voltage raw ${bat.voltageRaw ?? '—'})` });
      } catch (e) {
        append({ kind: 'error', text: `getBattery: ${(e as Error).message}` });
      }
      try {
        const fw = await r.device.getFirmwareInfo();
        setFirmware(fw.version);
        append({ kind: 'ok', text: `firmware: ${fw.version}  model=${fw.deviceModel || '—'}  ui=${fw.uiVersion}` });
      } catch (e) {
        append({ kind: 'error', text: `getFirmwareInfo: ${(e as Error).message}` });
      }
    } catch (e) {
      append({ kind: 'error', text: `connect: ${(e as Error).message}` });
    }
  }, [append]);

  const doAction = useCallback(async (label: string, fn: () => Promise<void>) => {
    if (!ring) return;
    try {
      append({ kind: 'tx', text: `→ ${label}` });
      await fn();
      append({ kind: 'ok', text: `✓ ${label}` });
    } catch (e) {
      append({ kind: 'error', text: `✗ ${label}: ${(e as Error).message}` });
    }
  }, [append, ring]);

  /**
   * Vibration sweep — fires each candidate opcode 2s apart while every
   * incoming frame stays in the RX log. Whichever numbered candidate makes
   * the ring buzz is the correct opcode for this firmware. User then tells
   * us the number so we can promote it to the primary in device.ts.
   */
  const runVibrationSweep = useCallback(async () => {
    if (!ring) return;
    append({ kind: 'info', text: `▶ Vibration sweep starting — ${VIB_CANDIDATES.length} candidates, 2s apart. Watch the ring — note which numbered candidate buzzes.` });
    for (const c of VIB_CANDIDATES) {
      const op = resolveCandidate(c);
      if (!op) {
        append({ kind: 'error', text: `#${c.n}  ${c.label}  · SKIPPED (opcode not in registry)` });
        continue;
      }
      append({ kind: 'tx', text: `#${c.n}  ${c.label}` });
      try {
        await ring.queue.send(op, new Uint8Array(c.payload), { expectReply: false, maxRetries: 0 });
      } catch (e) {
        append({ kind: 'error', text: `#${c.n}  ${c.label}  · nack: ${(e as Error).message}` });
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    append({ kind: 'info', text: `■ Sweep complete. Tell me which # buzzed.` });
  }, [ring, append]);

  const disconnect = useCallback(async () => {
    if (!ring) return;
    await ring.disconnect();
    setRing(null);
    setConnectedId(null);
    setBattery(null);
    setFirmware(null);
    ringRef.current = null;
    append({ kind: 'info', text: 'disconnected (manual)' });
  }, [append, ring]);

  const clearLog = () => setLog([]);
  const copyLogHint = () => Alert.alert('Copy log', 'Long-press any line to copy; or take a screenshot and share the whole log.');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Ring Debug</Text>
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
          <Text style={styles.iconTxt}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Connection panel */}
      <View style={styles.card}>
        {connectedId ? (
          <>
            <Text style={styles.label}>Connected</Text>
            <Text style={styles.value}>{connectedId}</Text>
            <View style={styles.row}>
              <Text style={styles.stat}>🔋 {battery ?? '—'}%</Text>
              <Text style={styles.stat}>fw {firmware ?? '—'}</Text>
            </View>
            <TouchableOpacity style={[styles.btn, styles.btnDanger]} onPress={disconnect}>
              <Text style={styles.btnTxt}>Disconnect</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TouchableOpacity style={styles.btn} onPress={scanning ? stopScan : startScan}>
              <Text style={styles.btnTxt}>{scanning ? 'Stop Scan' : 'Scan for Rings'}</Text>
            </TouchableOpacity>
            {candidates.length > 0 && (
              <View style={{ marginTop: SPACING.sm }}>
                {candidates.map((c) => (
                  <TouchableOpacity key={c.id} style={styles.candidate} onPress={() => connect(c.id, c.name)}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.candidateName}>{c.name || '(no name)'}</Text>
                      <Text style={styles.candidateMeta}>{c.id}  ·  {c.hint}  ·  rssi {c.rssi ?? '?'}</Text>
                    </View>
                    <Text style={styles.candidateGo}>→</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* Actions */}
      {ring && (
        <View style={styles.card}>
          <Text style={styles.label}>Probe</Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('getBattery', async () => {
              const b = await ring.device.getBattery(); setBattery(b.percent);
            })}>
              <Text style={styles.actTxt}>Battery</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('getFirmwareInfo', async () => {
              const f = await ring.device.getFirmwareInfo(); setFirmware(f.version);
            })}>
              <Text style={styles.actTxt}>Firmware</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('getCapabilities', async () => {
              const c = await ring.device.getCapabilities();
              append({ kind: 'info', text: `caps: ${JSON.stringify(c, (k, v) => k === 'raw' ? undefined : v)}` });
            })}>
              <Text style={styles.actTxt}>Caps</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('setDateTime', async () => {
              await ring.device.setDateTime();
            })}>
              <Text style={styles.actTxt}>Push Time</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('healthMonitor ON', async () => {
              await ring.device.setHealthMonitorMaster(true);
            })}>
              <Text style={styles.actTxt}>Monitor ON</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('healthMonitor OFF', async () => {
              await ring.device.setHealthMonitorMaster(false);
            })}>
              <Text style={styles.actTxt}>Monitor OFF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('findDevice', async () => {
              await ring.device.findDevice();
            })}>
              <Text style={styles.actTxt}>Find</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actBtn, { backgroundColor: 'rgba(255,159,69,0.20)', borderColor: '#FF9F45' }]} onPress={runVibrationSweep}>
              <Text style={[styles.actTxt, { color: '#FF9F45' }]}>🔍 Vib Sweep</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actBtn} onPress={() => doAction('live HR 10s', async () => {
              // Exercises {6,9,0} the way RWfit does: start, wait, stop.
              // The old "KeepAlive" button fired the start half on a 500ms
              // loop and never stopped it, which is what froze the ring.
              append({ kind: 'info', text: 'live HR ON — watch the ring, stopping in 10s' });
              await ring.withLiveMetric('hr', () => new Promise(r => setTimeout(r, 10_000)));
              append({ kind: 'info', text: 'live HR OFF — ring should be responsive' });
            })}>
              <Text style={styles.actTxt}>Live HR</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tap detector — tap your ring physically; watch this count go up */}
      {ring && (
        <View style={styles.card}>
          <Text style={styles.label}>Tap detector</Text>
          <Text style={{ color: COLORS.gold, fontSize: FONT_SIZES['2xl'], fontWeight: '700' }}>{tapCount}</Text>
          <Text style={{ color: COLORS.muted, fontSize: FONT_SIZES.xs }}>
            events (excludes keep-alive). Tap your ring 5–10× — if this counter goes up, the tap frame is decodable.
          </Text>
          {lastTapFrame && (
            <Text style={{ color: COLORS.cream, fontSize: FONT_SIZES.xs, fontFamily: 'Courier', marginTop: SPACING.xs }}>
              last: {lastTapFrame}
            </Text>
          )}
          {Object.keys(tapByOpcode).length > 0 && (
            <View style={{ marginTop: SPACING.sm }}>
              <Text style={{ color: COLORS.muted, fontSize: FONT_SIZES.xs, marginBottom: 4 }}>Breakdown by opcode:</Text>
              {Object.entries(tapByOpcode)
                .sort((a, b) => b[1] - a[1])
                .map(([opKey, n]) => (
                  <Text
                    key={opKey}
                    style={{ color: COLORS.cream, fontFamily: 'Courier', fontSize: FONT_SIZES.xs }}
                  >
                    {opKey.padEnd(28)}  ×{n}
                  </Text>
                ))}
            </View>
          )}
          <TouchableOpacity style={[styles.smallBtn, { marginTop: SPACING.xs }]} onPress={() => { setTapCount(0); setLastTapFrame(null); setTapByOpcode({}); }}>
            <Text style={styles.smallBtnTxt}>Reset counter</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Sync historical data from ring storage */}
      {ring && (
        <View style={styles.card}>
          <Text style={styles.label}>Sync (CMD 5)</Text>
          <View style={styles.actionsRow}>
            {SYNC_METRICS.map((m: SyncMetric) => (
              <TouchableOpacity
                key={m}
                style={styles.actBtn}
                onPress={() => doAction(`sync ${m}`, async () => {
                  const res = await ring.sync.sync(m);
                  append({ kind: 'info', text: `${res.label}: ${res.samples.length} samples (${res.rawPayload.length}B raw)` });
                  // Log up to 3 samples as JSON so we can eyeball the shape.
                  for (const s of res.samples.slice(0, 3)) {
                    append({ kind: 'info', text: `  ${JSON.stringify(s)}` });
                  }
                  // Fire-and-forget monitor OFF so the ring exits HRV/measurement
                  // mode after each sync completes — otherwise the on-ring
                  // display gets stuck showing the sync target.
                  ring.device.setHealthMonitorMaster(false).catch(() => {});
                })}
              >
                <Text style={styles.actTxt}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* Log */}
      <View style={[styles.card, { flex: 1, minHeight: 200 }]}>
        <View style={styles.logHeader}>
          <Text style={styles.label}>Log ({log.length})</Text>
          <TouchableOpacity onPress={copyLogHint} style={styles.smallBtn}><Text style={styles.smallBtnTxt}>?</Text></TouchableOpacity>
          <TouchableOpacity onPress={clearLog} style={styles.smallBtn}><Text style={styles.smallBtnTxt}>Clear</Text></TouchableOpacity>
        </View>
        <ScrollView style={styles.logBox}>
          {log.map((l, i) => (
            <Text key={i} selectable style={[styles.logLine, styles[`log_${l.kind}`]]}>
              {new Date(l.t).toISOString().slice(11, 23)}  {l.text}
            </Text>
          ))}
        </ScrollView>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep, padding: SPACING.md },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: SPACING.xl, marginBottom: SPACING.md,
  },
  title: { color: COLORS.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },
  iconBtn: { padding: SPACING.sm },
  iconTxt: { color: COLORS.muted, fontSize: FONT_SIZES.xl },

  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: BORDER_RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  label: { color: COLORS.muted, fontSize: FONT_SIZES.xs, textTransform: 'uppercase', marginBottom: SPACING.xs },
  value: { color: COLORS.cream, fontSize: FONT_SIZES.base, marginBottom: SPACING.sm, fontFamily: 'Courier' },
  row: { flexDirection: 'row', gap: SPACING.md, marginBottom: SPACING.sm },
  stat: { color: COLORS.gold, fontSize: FONT_SIZES.base },

  btn: {
    backgroundColor: COLORS.gold, paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.sm, alignItems: 'center',
  },
  btnDanger: { backgroundColor: COLORS.error },
  btnTxt: { color: '#000', fontSize: FONT_SIZES.base, fontWeight: '600' },

  candidate: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: COLORS.deep,
    padding: SPACING.sm, marginTop: SPACING.xs,
    borderRadius: BORDER_RADIUS.sm,
  },
  candidateName: { color: COLORS.cream, fontSize: FONT_SIZES.base, fontWeight: '600' },
  candidateMeta: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },
  candidateGo: { color: COLORS.gold, fontSize: FONT_SIZES.xl },

  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.xs },
  actBtn: {
    backgroundColor: COLORS.deep, paddingVertical: SPACING.xs, paddingHorizontal: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  actTxt: { color: COLORS.cream, fontSize: FONT_SIZES.sm },

  logHeader: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  logBox: { flex: 1, marginTop: SPACING.xs, backgroundColor: COLORS.deep, padding: SPACING.xs, borderRadius: BORDER_RADIUS.sm },
  logLine: { color: COLORS.cream, fontFamily: 'Courier', fontSize: FONT_SIZES.xs, marginBottom: 2 },
  log_info: { color: COLORS.muted },
  log_error: { color: COLORS.error },
  log_rx: { color: COLORS.leaf },
  log_tx: { color: COLORS.saffron },
  log_ok: { color: COLORS.success },
  smallBtn: {
    marginLeft: 'auto', backgroundColor: COLORS.deep, paddingHorizontal: SPACING.sm,
    paddingVertical: 2, borderRadius: BORDER_RADIUS.sm, borderWidth: 1, borderColor: COLORS.border,
  },
  smallBtnTxt: { color: COLORS.muted, fontSize: FONT_SIZES.xs },
});
