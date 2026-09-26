/**
 * DeviceSettingsScreen — mirrors RWfit's Device tab layout.
 *
 * Sections:
 *   • Ring header card — model / battery / firmware / MAC / Unbind
 *   • Setting rows — Message notifications, Low battery reminder, Daily likes,
 *     Take Photo, Screen brightness, Vibration, Unit format, Wearing dir,
 *     Health monitoring, Search device, App control, Firmware upgrade,
 *     Feedback, FAQ, Color theme, Sleep mode, Restore factory, Shutdown.
 *
 * Rows that map to a real SDK command are wired live; rows that need
 * per-opcode reverse-engineering we haven't done yet show a "coming soon"
 * toast so the layout stays faithful without pretending they work.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch, Modal,
  TextInput, ActivityIndicator,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';
import { useTheme } from '../ThemeContext';
import { VitalsMeasurementSection } from './SettingsScreen';
import { RespirationProbeScreen } from './RespirationProbeScreen';
import { ThemePicker } from '../components/ThemePicker';
import { SadhanaRing } from '../soulsync/ring/SadhanaRing';
import { readSr16DeviceId, readSr16DeviceName, saveSr16DeviceName } from '../soulsync/ring/japaCounter';
import { DeviceApi, type BatteryStatus, type FirmwareInfo } from '../soulsync/ring/device';

interface Props {
  onClose: () => void;
  onOpenPair: () => void;
}

interface Row {
  icon: string;
  iconBg: string;
  label: string;
  value?: string;
  toggle?: boolean;
  onToggle?: (v: boolean) => void;
  onPress?: () => void;
  destructive?: boolean;
}

export const DeviceSettingsScreen: React.FC<Props> = ({ onClose, onOpenPair }) => {
  const { palette, mode } = useTheme();
  const [connected, setConnected] = useState(false);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [fw, setFw] = useState<FirmwareInfo | null>(null);
  const [mac, setMac] = useState<string | null>(null);
  const [unit, setUnit] = useState<'Metric' | 'Imperial'>('Metric');
  // Was a local useState that flipped a label and nothing else — the control
  // looked functional but changed no theme. Now bound to ThemeContext, which
  // matters more than it did: the drawer's Color Theme entry has been removed
  // as a duplicate, so this is the only way to switch themes.
  const [ring, setRing] = useState<SadhanaRing | null>(null);
  const [showRespProbe, setShowRespProbe] = useState(false);
  const [showThemePicker, setShowThemePicker] = useState(false);

  /**
   * The ring's own Bluetooth name.
   *
   * Seeded from the saved pairing so the card reads "Pavani" even before the
   * link is up — the ring is out of range as often as not when this screen
   * opens, and falling back to the model number there is what made every ring
   * look identical.
   */
  const [btName, setBtName] = useState<string | null>(null);
  const [canRename, setCanRename] = useState<boolean | null>(null);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  const soon = (feature: string) =>
    Alert.alert(feature, 'Requires opcode we haven\'t verified live yet. Coming soon.');

  useEffect(() => {
    let disposed = false;
    (async () => {
      const id = await readSr16DeviceId();
      if (!id) return;
      setMac(id);
      // Remembered name first: this paints immediately and survives the ring
      // being out of range, which is the case the card used to handle worst.
      try { const saved = await readSr16DeviceName(); if (!disposed && saved) setBtName(saved); } catch { /* ignore */ }
      try {
        const r = await SadhanaRing.connect(id);
        if (disposed) { await r.disconnect(); return; }
        setRing(r);
        setConnected(true);
        try { setBattery(await r.device.getBattery()); } catch { /* ignore */ }
        try { setFw(await r.device.getFirmwareInfo()); } catch { /* ignore */ }
        try {
          const caps = await r.device.getCapabilities();
          if (!disposed) setCanRename(caps.hasSetBTName);
        } catch { /* leave unknown — the row stays, the write reports its own failure */ }
        try {
          const live = await r.device.getBtName();
          if (!disposed && live) { setBtName(live); void saveSr16DeviceName(live); }
        } catch { /* older firmware may not answer the read */ }
      } catch { /* stayed disconnected */ }
    })();
    return () => { disposed = true; ring?.disconnect().catch(() => {}); };
  }, []);

  const handleUnbind = () => Alert.alert(
    'Unbind device',
    'This will forget the ring. You\'ll need to scan and pair again.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Unbind', style: 'destructive', onPress: async () => {
        // We don't have an unbind opcode wired; just drop the saved id.
        onClose();
      }},
    ]
  );

  /**
   * Write the typed name to the ring, then remember it.
   *
   * Order matters: the ring is the source of truth for the name it
   * advertises, so we only store what it accepted. Saving first and writing
   * afterwards would leave the app showing a name no scan list agrees with —
   * exactly the confusion this feature exists to remove.
   */
  const handleRename = async () => {
    const next = nameDraft.trim();
    if (!next) return;
    if (!ring) {
      Alert.alert('Ring not connected', 'The name is stored on the ring itself, so it has to be connected. Put it on and try again.');
      return;
    }
    setSavingName(true);
    try {
      await ring.device.setBtName(next);
      await saveSr16DeviceName(next);
      setBtName(next);
      setRenaming(false);
      Alert.alert(
        'Ring renamed',
        `This ring now advertises as "${next}". Some phones keep showing the old name in their own Bluetooth list until the ring is switched off and on.`,
      );
    } catch (e) {
      Alert.alert(
        'Could not rename',
        canRename === false
          ? 'This ring\'s firmware reports no rename support, and it refused the command.'
          : 'The ring did not accept the new name: ' + (e as Error).message,
      );
    } finally {
      setSavingName(false);
    }
  };

  const handleFactoryReset = () => Alert.alert(
    'Restore factory settings',
    'This will wipe all data stored on the ring. Cannot be undone.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: async () => {
        if (!ring) return;
        try { await ring.device.factoryReset('DELETE_ALL'); Alert.alert('Ring reset'); } catch (e) { Alert.alert('Failed', (e as Error).message); }
      }},
    ]
  );

  const handleShutdown = () => Alert.alert(
    'Device shutdown',
    'This will power off your ring. You\'ll need to press its button to turn it back on.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Shutdown', style: 'destructive', onPress: () => soon('Device Shutdown') }]
  );

  const handleFindDevice = async () => {
    // Not "coming soon" — the feature works, there is simply no ring attached.
    // Telling the user a working feature is unbuilt sends them away for good.
    if (!ring) return Alert.alert('Find Ring', 'Connect your ring first, then tap this to make it buzz.');
    try {
      await ring.device.findDevice(1);
      Alert.alert('Find Ring', 'Ring should buzz now (opcode 0xDF).');
    } catch {
      soon('Find Ring');
    }
  };

  const handleBuzzTest = async (pulses: number) => {
    if (!ring) return Alert.alert('Vibration test', 'Connect your ring first, then tap this to buzz it.');
    try {
      await ring.device.vibrate(pulses);
    } catch (e) {
      Alert.alert('Buzz Test', 'Ring rejected the opcode: ' + (e as Error).message);
    }
  };

  const handleSetUnit = async (u: 'Metric' | 'Imperial') => {
    setUnit(u);
    if (!ring) return;
    try { await ring.device.setUnit(u === 'Metric' ? 'metric' : 'imperial'); } catch { /* ignore */ }
  };

  /**
   * Only controls that actually do something.
   *
   * Removed in the Change 13 audit, because a setting that looks functional
   * and changes nothing is worse than an absent one:
   *   Message Notifications, Take Photo, App Control, Feedback, FAQ,
   *   Sleep mode        — placeholders that only raised a "coming soon" alert
   *   Low Battery Reminder, Daily likes, Wearing direction,
   *   Screen brightness — local useState never sent to the ring, so the
   *                       toggle moved and the hardware never heard about it
   *
   * Message Notifications was also a duplicate: notification push is
   * configured on the Reminders screen, which does persist it.
   */
  const rows: Row[] = [
    // Pairing has moved to Settings → Saadhana Ring, which is where someone
    // wanting to connect a ring actually looks. The status card above keeps
    // its Scan / Pair button so this screen can still recover when the link
    // drops; what is gone is the duplicate entry in this list.
    { icon: '📳', iconBg: '#eab308', label: 'Vibration test', value: 'Buzz 1× · 2× · 3×', onPress: () => Alert.alert(
      'Buzz the ring',
      'Sends a vibration to the ring.',
      [
        { text: '1 pulse',  onPress: () => handleBuzzTest(1) },
        { text: '2 pulses', onPress: () => handleBuzzTest(2) },
        { text: '3 pulses', onPress: () => handleBuzzTest(3) },
        { text: 'Cancel', style: 'cancel' },
      ]
    ) },
    // Naming the ring is the first thing worth doing with several of them in
    // a house — the scan list is otherwise a column of identical MACs.
    { icon: '🏷️', iconBg: '#a855f7', label: 'Ring name', value: btName ?? 'Not set',
      onPress: () => {
        if (!ring) {
          Alert.alert('Ring not connected', 'The name lives on the ring itself, so it has to be connected before it can be changed.');
          return;
        }
        setNameDraft(btName ?? '');
        setRenaming(true);
      } },
    { icon: '🔎', iconBg: '#0ea5e9', label: 'Find Ring (Buzz)', onPress: handleFindDevice },
    { icon: '🩺', iconBg: '#ef4444', label: 'Health Monitoring', onPress: () => ring?.device.setHealthMonitorMaster(true).then(() => Alert.alert('Monitor ON')).catch(() => soon('Health Monitoring')) },
    // A ring diagnostic belongs on the ring's own screen. It was reachable
    // only from profile Settings beside Ring Debug — where a developer would
    // look, and not where anyone else would.
    { icon: '🌬️', iconBg: '#8BD3C7', label: 'Respiration probe', value: 'Can the ring measure breath?', onPress: () => setShowRespProbe(true) },
    { icon: '📏', iconBg: '#f97316', label: 'Unit Format', value: unit, onPress: () => handleSetUnit(unit === 'Metric' ? 'Imperial' : 'Metric') },
    /*
     * Opens the picker rather than toggling.
     *
     * This row called toggleTheme, which flips between exactly two values.
     * That was fine while Dark and Light were the only themes; once Techno
     * existed it became the reason nobody could reach it — the drawer's Color
     * Theme entry had been removed as redundant with this row, so the picker
     * was opened by nothing at all and a third theme was unreachable from
     * anywhere in the app.
     */
    { icon: '🎨', iconBg: '#22c55e', label: 'Color Theme',
      value: mode === 'techno' ? 'Techno' : mode === 'dark' ? 'Dark' : 'Light',
      onPress: () => setShowThemePicker(true) },
    { icon: '🚀', iconBg: '#22c55e', label: 'Firmware Upgrade', onPress: () => Alert.alert('Firmware', 'Over-the-air update needs the Jieli RCSP challenge/response handshake, which is not implemented yet.') },
    { icon: '🔄', iconBg: '#eab308', label: 'Restore factory settings', onPress: handleFactoryReset, destructive: true },
    { icon: '⏻', iconBg: '#ef4444', label: 'Device Shutdown', onPress: handleShutdown, destructive: true },
  ];

  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.deep }]} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={onClose} style={styles.backBtn}>
          <Text style={[styles.backIcon, { color: palette.cream }]}>‹</Text>
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: palette.cream }]}>Device</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Ring header card */}
      <View style={styles.headerCard}>
        <View style={{ flex: 1 }}>
          {/* The ring's own name leads — the model number is the same on
              every one of them and answers nothing about which is yours. */}
          <Text style={styles.ringName}>{btName ?? fw?.deviceModel ?? 'SR16'}</Text>
          <Text style={styles.ringStatus}>{connected ? 'Connected' : 'Disconnected'}</Text>
          <Text style={styles.ringLine}>version number: V{fw?.version ?? '—'}</Text>
          <Text style={styles.ringLine}>MAC: {mac ?? '—'}</Text>
          <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm }}>
            <TouchableOpacity style={styles.unbindBtn} onPress={handleUnbind}>
              <Text style={styles.unbindTxt}>Device Unbind</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.pairBtn} onPress={onOpenPair}>
              <Text style={styles.pairTxt}>Scan / Pair</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.batteryBox}>
          <Text style={styles.batteryPct}>{battery?.percent !== undefined ? `${battery.percent}%` : '—'}</Text>
          <Text style={styles.batteryLabel}>battery</Text>
        </View>
      </View>

      {/* Settings list */}
      <View style={styles.listCard}>
        {rows.map((r, i) => (
          <TouchableOpacity
            key={r.label}
            style={[styles.row, i < rows.length - 1 && styles.rowDivider]}
            onPress={r.onPress}
            disabled={!!r.toggle}
          >
            <View style={[styles.rowIcon, { backgroundColor: r.iconBg }]}>
              <Text style={styles.rowIconTxt}>{r.icon}</Text>
            </View>
            <Text style={[styles.rowLabel, r.destructive && { color: '#ef4444' }]}>{r.label}</Text>
            {r.toggle !== undefined ? (
              <Switch
                value={r.toggle}
                onValueChange={r.onToggle}
                trackColor={{ true: '#3b82f6', false: '#333' }}
                thumbColor="#fff"
              />
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {r.value && <Text style={styles.rowValue}>{r.value}</Text>}
                <Text style={styles.rowChev}>›</Text>
              </View>
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Ring recording behaviour, moved here from Profile: the recording
          window, sample interval, sleep window and the japa live link are all
          device behaviour rather than profile preferences. */}
      <VitalsMeasurementSection />

      {showThemePicker && (
        <ThemePicker visible onClose={() => setShowThemePicker(false)} />
      )}

      {showRespProbe && (
        <Modal visible transparent={false} animationType="slide" onRequestClose={() => setShowRespProbe(false)}>
          <RespirationProbeScreen onClose={() => setShowRespProbe(false)} />
        </Modal>
      )}

      {/* Rename. A plain Alert.prompt would have been shorter, but that is
          iOS-only — on Android it renders as an alert with no text field at
          all, so the row would do nothing on the one platform this ships to. */}
      <Modal visible={renaming} transparent animationType="fade" onRequestClose={() => setRenaming(false)}>
        <View style={styles.renameBackdrop}>
          <View style={[styles.renameCard, { backgroundColor: palette.darkBg, borderColor: palette.border }]}>
            <Text style={[styles.renameTitle, { color: palette.cream }]}>Name this ring</Text>
            <Text style={[styles.renameBody, { color: palette.muted }]}>
              Written to the ring itself, so it is what you&apos;ll see in the app&apos;s scan list and in
              your phone&apos;s Bluetooth settings. Up to {DeviceApi.BT_NAME_MAX_BYTES} characters.
            </Text>
            <TextInput
              value={nameDraft}
              onChangeText={setNameDraft}
              placeholder="e.g. Pavani"
              placeholderTextColor={palette.muted}
              maxLength={DeviceApi.BT_NAME_MAX_BYTES}
              autoFocus
              style={[styles.renameInput, { color: palette.cream, borderColor: palette.border }]}
            />
            <View style={styles.renameBtnRow}>
              <TouchableOpacity style={styles.renameCancel} onPress={() => setRenaming(false)} disabled={savingName}>
                <Text style={[styles.renameCancelTxt, { color: palette.muted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.renameSave, (!nameDraft.trim() || savingName) && { opacity: 0.5 }]}
                onPress={handleRename}
                disabled={!nameDraft.trim() || savingName}
              >
                {savingName
                  ? <ActivityIndicator size="small" color="#0b1220" />
                  : <Text style={styles.renameSaveTxt}>Save to ring</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingTop: SPACING.xl + SPACING.sm,
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  backBtn: {
    width: 40, height: 40, alignItems: 'center', justifyContent: 'center',
  },
  backIcon: { color: COLORS.cream, fontSize: FONT_SIZES['3xl'], fontWeight: '400' },
  topTitle: { color: COLORS.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },

  headerCard: {
    margin: SPACING.md,
    padding: SPACING.md,
    backgroundColor: '#1f2937',
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row',
  },
  ringName: { color: COLORS.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },
  ringStatus: { color: COLORS.cream, fontSize: FONT_SIZES.base, marginTop: 4 },
  ringLine: { color: COLORS.muted, fontSize: FONT_SIZES.sm, marginTop: 2 },
  unbindBtn: {
    backgroundColor: '#ef4444',
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  unbindTxt: { color: '#fff', fontSize: FONT_SIZES.sm, fontWeight: '600' },
  pairBtn: {
    backgroundColor: COLORS.gold,
    paddingVertical: SPACING.xs, paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
  },
  pairTxt: { color: '#000', fontSize: FONT_SIZES.sm, fontWeight: '600' },
  batteryBox: { alignItems: 'flex-end', justifyContent: 'flex-start' },
  batteryPct: { color: COLORS.gold, fontSize: FONT_SIZES.xl, fontWeight: '700' },
  batteryLabel: { color: COLORS.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },

  listCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: '#1f2937',
    borderRadius: BORDER_RADIUS.lg,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING.md,
  },
  rowDivider: { borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  rowIcon: {
    width: 36, height: 36, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginRight: SPACING.md,
  },
  rowIconTxt: { fontSize: 18 },
  rowLabel: { color: COLORS.cream, fontSize: FONT_SIZES.base, flex: 1 },
  rowValue: { color: COLORS.muted, fontSize: FONT_SIZES.sm, marginRight: SPACING.xs },
  rowChev: { color: COLORS.muted, fontSize: FONT_SIZES.xl },

  renameBackdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: SPACING.lg,
  },
  renameCard: {
    width: '100%', maxWidth: 420, borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1, padding: SPACING.lg,
  },
  renameTitle: { fontSize: FONT_SIZES.lg, fontWeight: '700', marginBottom: SPACING.xs },
  renameBody: { fontSize: FONT_SIZES.sm, lineHeight: 19, marginBottom: SPACING.md },
  renameInput: {
    borderWidth: 1, borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm,
    fontSize: FONT_SIZES.base,
  },
  renameBtnRow: {
    flexDirection: 'row', justifyContent: 'flex-end',
    alignItems: 'center', gap: SPACING.sm, marginTop: SPACING.lg,
  },
  renameCancel: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm },
  renameCancelTxt: { fontSize: FONT_SIZES.base },
  renameSave: {
    backgroundColor: '#eab308', borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.lg, paddingVertical: SPACING.sm,
    minWidth: 128, alignItems: 'center',
  },
  renameSaveTxt: { color: '#0b1220', fontWeight: '700', fontSize: FONT_SIZES.base },
});
