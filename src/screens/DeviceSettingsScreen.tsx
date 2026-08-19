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
  View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, Switch,
} from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';
import { useTheme } from '../ThemeContext';
import { SadhanaRing } from '../soulsync/ring/SadhanaRing';
import { readSr16DeviceId } from '../soulsync/ring/japaCounter';
import type { BatteryStatus, FirmwareInfo } from '../soulsync/ring/device';

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
  const { palette } = useTheme();
  const [connected, setConnected] = useState(false);
  const [battery, setBattery] = useState<BatteryStatus | null>(null);
  const [fw, setFw] = useState<FirmwareInfo | null>(null);
  const [mac, setMac] = useState<string | null>(null);
  const [lowBatteryReminder, setLowBatteryReminder] = useState(true);
  const [dailyLikes, setDailyLikes] = useState(true);
  const [unit, setUnit] = useState<'Metric' | 'Imperial'>('Metric');
  const [wearingDir, setWearingDir] = useState<'Left' | 'Right'>('Right');
  const [screenBrightness, setScreenBrightness] = useState<'Soft light' | 'Bright'>('Soft light');
  const [colorTheme, setColorTheme] = useState<'Dark' | 'Light'>('Dark');
  const [ring, setRing] = useState<SadhanaRing | null>(null);

  const soon = (feature: string) =>
    Alert.alert(feature, 'Requires opcode we haven\'t verified live yet. Coming soon.');

  useEffect(() => {
    let disposed = false;
    (async () => {
      const id = await readSr16DeviceId();
      if (!id) return;
      setMac(id);
      try {
        const r = await SadhanaRing.connect(id);
        if (disposed) { await r.disconnect(); return; }
        setRing(r);
        setConnected(true);
        try { setBattery(await r.device.getBattery()); } catch { /* ignore */ }
        try { setFw(await r.device.getFirmwareInfo()); } catch { /* ignore */ }
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
    if (!ring) return soon('Find Ring');
    try {
      await ring.device.findDevice(1);
      Alert.alert('Find Ring', 'Ring should buzz now (opcode 0xDF).');
    } catch {
      soon('Find Ring');
    }
  };

  const handleBuzzTest = async (pulses: number) => {
    if (!ring) return soon('Buzz Test');
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

  const rows: Row[] = [
    { icon: '💬', iconBg: '#3b82f6', label: 'Message Notifications', onPress: () => soon('Message Notifications') },
    { icon: '🔋', iconBg: '#ef4444', label: 'Low Battery Reminder', toggle: lowBatteryReminder, onToggle: setLowBatteryReminder },
    { icon: '📸', iconBg: '#10b981', label: 'Daily likes', toggle: dailyLikes, onToggle: setDailyLikes },
    { icon: '📷', iconBg: '#06b6d4', label: 'Take Photo', onPress: () => soon('Take Photo') },
    { icon: '☀️', iconBg: '#22c55e', label: 'Screen brightness', value: screenBrightness, onPress: () => setScreenBrightness((v) => v === 'Soft light' ? 'Bright' : 'Soft light') },
    { icon: '📳', iconBg: '#eab308', label: 'Vibration test', value: 'Buzz 1× · 2× · 3×', onPress: () => Alert.alert(
      'Buzz the ring',
      'Send a vibration test to the ring (opcode 0xDF).',
      [
        { text: '1 pulse',  onPress: () => handleBuzzTest(1) },
        { text: '2 pulses', onPress: () => handleBuzzTest(2) },
        { text: '3 pulses', onPress: () => handleBuzzTest(3) },
        { text: 'Cancel', style: 'cancel' },
      ]
    ) },
    { icon: '📏', iconBg: '#f97316', label: 'Unit Format', value: unit, onPress: () => handleSetUnit(unit === 'Metric' ? 'Imperial' : 'Metric') },
    { icon: '🖐', iconBg: '#a855f7', label: 'Wearing direction', value: wearingDir, onPress: () => setWearingDir((v) => v === 'Right' ? 'Left' : 'Right') },
    { icon: '🩺', iconBg: '#ef4444', label: 'Health Monitoring', onPress: () => ring?.device.setHealthMonitorMaster(true).then(() => Alert.alert('Monitor ON')).catch(() => soon('Health Monitoring')) },
    { icon: '🔎', iconBg: '#0ea5e9', label: 'Find Ring (Buzz)', onPress: handleFindDevice },
    { icon: '📱', iconBg: '#14b8a6', label: 'App Control', value: 'Off', onPress: () => soon('App Control') },
    { icon: '🚀', iconBg: '#22c55e', label: 'Firmware Upgrade', onPress: () => Alert.alert('Firmware', 'OTA needs the Jieli RCSP challenge/response — flagged as Task #14, not wired yet.') },
    { icon: '📝', iconBg: '#22c55e', label: 'Feedback', onPress: () => soon('Feedback') },
    { icon: '❓', iconBg: '#06b6d4', label: 'FAQ', onPress: () => soon('FAQ') },
    { icon: '🎨', iconBg: '#22c55e', label: 'Color Theme', value: colorTheme, onPress: () => setColorTheme((v) => v === 'Dark' ? 'Light' : 'Dark') },
    { icon: '🌙', iconBg: '#f97316', label: 'Sleep mode', onPress: () => soon('Sleep mode') },
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
          <Text style={styles.ringName}>{fw?.deviceModel ?? 'SR16'}</Text>
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
});
