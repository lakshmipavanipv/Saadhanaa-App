import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Modal,
  Alert,
  Switch,
} from 'react-native';
import { useSadhana } from '../context';
import { UserProfile } from '../types';
import { COLORS, SPACING } from '../theme';
import { RingDebugScreen } from './RingDebugScreen';
import {
  vitalsPrefs, INTERVAL_CHOICES, SLEEP_INTERVAL_MIN, describeInterval, RING_MONITOR_INTERVALS,
  type VitalsPrefs,
} from '../soulsync/settings/vitalsPrefs';
import { vitalsScheduler, type SchedulerStatus } from '../soulsync/ring/vitalsScheduler';
import { vitalsRepo } from '../soulsync/db/vitalsRepo';

const APP_VERSION = '1.0.9';

export const SettingsScreen = ({ onClose }: { onClose: () => void }) => {
  const {
    userProfile, setUserProfile, resetAll, deities, history, showToast,
    bleConnected, requestBlePair, disconnectBleRing,
  } = useSadhana();
  const [editing, setEditing] = useState(false);
  const [showRingDebug, setShowRingDebug] = useState(false);


  const confirmReset = () => {
    Alert.alert(
      'Reset everything?',
      'This will remove your profile, deities, history, festival checklists and all reminders. The app will go back to the welcome screen. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            await resetAll();
            showToast('Everything reset 🪷');
          },
        },
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        {/* v48: title left, X close upper-RIGHT for app-wide consistency */}
        <View style={styles.header}>
          <Text style={styles.title}>Settings</Text>
          <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
            <Text style={styles.closeBtnText}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* Profile card */}
        {userProfile && (
          <View style={styles.profileCard}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {userProfile.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <Text style={styles.profileName}>{userProfile.name}</Text>
            {userProfile.email && <Text style={styles.profileMeta}>📧 {userProfile.email}</Text>}
            {userProfile.phone && <Text style={styles.profileMeta}>📱 {userProfile.phone}</Text>}
            <Text style={styles.profileSince}>
              Since {new Date(userProfile.createdAt).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </Text>
            <TouchableOpacity style={styles.editBtn} onPress={() => setEditing(true)}>
              <Text style={styles.editBtnText}>Edit profile</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* "Your sadhana so far" removed — practice totals belong on History,
            not Profile, and duplicating them here meant two places to keep in
            agreement. */}

        {/* Saadhana Ring (BLE) */}
        <Text style={styles.sectionTitle}>Saadhana Ring</Text>
        <View style={styles.ringRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>
              {bleConnected ? '🟢 Ring paired & listening' : '⚪️ No ring paired'}
            </Text>
            <Text style={styles.rowHint}>
              {bleConnected
                ? 'Hardware button auto-counts your malas'
                : 'Tap to pair your physical Saadhana counter'}
            </Text>
          </View>
          <TouchableOpacity
            style={[styles.ringBtn, bleConnected && styles.ringBtnConnected]}
            onPress={() => (bleConnected ? disconnectBleRing() : requestBlePair())}
          >
            <Text style={[styles.ringBtnText, bleConnected && styles.ringBtnTextConnected]}>
              {bleConnected ? 'Disconnect' : 'Pair Bluetooth'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Smart Ring (Jieli SDK — developer preview) */}
        <TouchableOpacity style={styles.ringRow} onPress={() => setShowRingDebug(true)}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>💍 Smart Ring — Debug</Text>
            <Text style={styles.rowHint}>Scan / connect / read battery / view live BLE frames</Text>
          </View>
          <Text style={[styles.rowValue, { color: COLORS.gold }]}>Open ›</Text>
        </TouchableOpacity>

        {/* Vitals measurement cadence moved to Device Settings — recording
            window, sample interval, sleep window and japa live-link are ring
            behaviour, not profile preferences. */}

        {/* About */}
        <Text style={styles.sectionTitle}>About</Text>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>App version</Text>
          <Text style={styles.rowValue}>{APP_VERSION}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.rowLabel}>Storage</Text>
          <Text style={styles.rowValue}>On-device only</Text>
        </View>

        {/* Danger zone */}
        <Text style={[styles.sectionTitle, { color: COLORS.error, marginTop: SPACING.lg }]}>
          Danger zone
        </Text>
        <TouchableOpacity style={styles.dangerBtn} onPress={confirmReset}>
          <Text style={styles.dangerBtnText}>Reset all data</Text>
          <Text style={styles.dangerBtnHint}>
            Removes profile, deities, history, reminders. App returns to welcome.
          </Text>
        </TouchableOpacity>

        <Text style={styles.footer}>🪷 Body &amp; Soul · Made with devotion</Text>
      </ScrollView>

      {editing && userProfile && (
        <ProfileEditor
          profile={userProfile}
          onSave={p => {
            setUserProfile(p);
            setEditing(false);
            showToast('Profile updated');
          }}
          onClose={() => setEditing(false)}
        />
      )}

      {showRingDebug && (
        <Modal visible transparent={false} animationType="slide" onRequestClose={() => setShowRingDebug(false)}>
          <RingDebugScreen onClose={() => setShowRingDebug(false)} />
        </Modal>
      )}
    </View>
  );
};

/**
 * How often the ring is asked for a measurement.
 *
 * Three cadences, applied automatically by `vitalsScheduler`: the interval
 * chosen here during the day, every 30 minutes inside the sleep window, and a
 * continuously-held link during japa.
 */
export const VitalsMeasurementSection = () => {
  const [prefs, setPrefs] = useState<VitalsPrefs>(() => vitalsPrefs.peek());
  const [status, setStatus] = useState<SchedulerStatus | null>(null);
  const [stored, setStored] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    void vitalsPrefs.get().then((p) => { if (!cancelled) setPrefs(p); });
    const unsubPrefs = vitalsPrefs.subscribe((p) => { if (!cancelled) setPrefs(p); });
    const unsubStatus = vitalsScheduler.subscribe((st) => { if (!cancelled) setStatus(st); });
    return () => { cancelled = true; unsubPrefs(); unsubStatus(); };
  }, []);

  // Refresh the stored-sample receipt whenever a sync completes.
  useEffect(() => {
    let cancelled = false;
    void vitalsRepo.counts()
      .then((c) => {
        if (cancelled) return;
        setStored(Object.values(c).reduce((a, b) => a + b, 0));
      })
      .catch(() => { /* DB not ready */ });
    return () => { cancelled = true; };
  }, [status?.lastRunAt]);

  const cycleInterval = useCallback(() => {
    const idx = INTERVAL_CHOICES.indexOf(prefs.intervalMin);
    const next = INTERVAL_CHOICES[(idx + 1) % INTERVAL_CHOICES.length];
    void vitalsPrefs.set({ intervalMin: next });
  }, [prefs.intervalMin]);

  // ── The ring's own sampling schedule ──────────────────────────────────
  // Distinct from "Measure every" above, which only sets how often the phone
  // reads the ring. This tells the RING how often to take a reading; without
  // it the ring stores almost nothing and every history channel comes back
  // empty no matter how often we ask.
  const cycleRingInterval = useCallback(() => {
    const idx = RING_MONITOR_INTERVALS.indexOf(prefs.ringMonitorIntervalMin);
    const next = RING_MONITOR_INTERVALS[(idx + 1) % RING_MONITOR_INTERVALS.length];
    void vitalsPrefs.set({ ringMonitorIntervalMin: next });
  }, [prefs.ringMonitorIntervalMin]);

  const toggleRingMonitor = useCallback(() => {
    void vitalsPrefs.set({ ringMonitorEnabled: !prefs.ringMonitorEnabled });
  }, [prefs.ringMonitorEnabled]);

  const cycleRingStart = useCallback(() => {
    void vitalsPrefs.set({ ringMonitorStartHour: (prefs.ringMonitorStartHour + 1) % 24 });
  }, [prefs.ringMonitorStartHour]);

  const cycleRingEnd = useCallback(() => {
    void vitalsPrefs.set({ ringMonitorEndHour: (prefs.ringMonitorEndHour + 1) % 24 });
  }, [prefs.ringMonitorEndHour]);

  const cycleSleepStart = useCallback(() => {
    void vitalsPrefs.set({ sleepStartHour: (prefs.sleepStartHour + 1) % 24 });
  }, [prefs.sleepStartHour]);

  const cycleSleepEnd = useCallback(() => {
    void vitalsPrefs.set({ sleepEndHour: (prefs.sleepEndHour + 1) % 24 });
  }, [prefs.sleepEndHour]);

  const hh = (h: number) => `${`${h}`.padStart(2, '0')}:00`;

  const modeLabel =
    status?.mode === 'japa' ? '📿 Japa — live link, streaming'
    : status?.mode === 'sleep' ? `😴 Sleep — every ${SLEEP_INTERVAL_MIN} min`
    : `☀️ Daytime — ${describeInterval(prefs.intervalMin).toLowerCase()}`;

  const lastSync = status?.lastRunAt
    ? new Date(status.lastRunAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })
    : 'not yet';

  return (
    <>
      <Text style={styles.sectionTitle}>Vitals measurement</Text>

      {/* On-ring recording — the setting that decides whether history exists */}
      <TouchableOpacity style={styles.row} onPress={toggleRingMonitor}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Ring records vitals</Text>
          <Text style={styles.rowHint}>
            Lets the ring sample HR, HRV, SpO₂, temperature and stress on its own
          </Text>
        </View>
        <Text style={[styles.rowValue, { color: prefs.ringMonitorEnabled ? COLORS.gold : COLORS.muted }]}>
          {prefs.ringMonitorEnabled ? 'On' : 'Off'}
        </Text>
      </TouchableOpacity>

      {prefs.ringMonitorEnabled && (
        <>
          <TouchableOpacity style={styles.row} onPress={cycleRingInterval}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Ring samples every</Text>
              <Text style={styles.rowHint}>Shorter means denser history and more ring battery</Text>
            </View>
            <Text style={[styles.rowValue, { color: COLORS.gold }]}>
              {prefs.ringMonitorIntervalMin} min ›
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={cycleRingStart}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Recording from</Text>
              <Text style={styles.rowHint}>Start of the daily window the ring samples in</Text>
            </View>
            <Text style={[styles.rowValue, { color: COLORS.gold }]}>{hh(prefs.ringMonitorStartHour)} ›</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.row} onPress={cycleRingEnd}>
            <View style={{ flex: 1 }}>
              <Text style={styles.rowLabel}>Recording until</Text>
              <Text style={styles.rowHint}>Keep this at 23:00 to capture overnight HRV and sleep</Text>
            </View>
            <Text style={[styles.rowValue, { color: COLORS.gold }]}>{hh(prefs.ringMonitorEndHour)} ›</Text>
          </TouchableOpacity>
        </>
      )}

      {/* Daytime cadence */}
      <TouchableOpacity style={styles.row} onPress={cycleInterval}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Measure every</Text>
          <Text style={styles.rowHint}>How often the ring is read during the day</Text>
        </View>
        <Text style={[styles.rowValue, { color: COLORS.gold }]}>{prefs.intervalMin} min ›</Text>
      </TouchableOpacity>

      {/* Sleep cadence */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Sleep tracking</Text>
          <Text style={styles.rowHint}>
            Measures every {SLEEP_INTERVAL_MIN} min while you sleep
          </Text>
        </View>
        <Switch
          value={prefs.sleepModeEnabled}
          onValueChange={(v) => { void vitalsPrefs.set({ sleepModeEnabled: v }); }}
          trackColor={{ false: '#3a3a3a', true: COLORS.gold }}
        />
      </View>

      {prefs.sleepModeEnabled && (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowLabel}>Sleep window</Text>
            <Text style={styles.rowHint}>Tap a time to adjust</Text>
          </View>
          <TouchableOpacity onPress={cycleSleepStart}>
            <Text style={[styles.rowValue, { color: COLORS.gold }]}>{hh(prefs.sleepStartHour)}</Text>
          </TouchableOpacity>
          <Text style={styles.rowValue}>  →  </Text>
          <TouchableOpacity onPress={cycleSleepEnd}>
            <Text style={[styles.rowValue, { color: COLORS.gold }]}>{hh(prefs.sleepEndHour)}</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Japa live link */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Live vitals during japa</Text>
          <Text style={styles.rowHint}>
            Holds the Bluetooth link open for the whole session
          </Text>
        </View>
        <Switch
          value={prefs.japaLiveEnabled}
          onValueChange={(v) => { void vitalsPrefs.set({ japaLiveEnabled: v }); }}
          trackColor={{ false: '#3a3a3a', true: COLORS.gold }}
        />
      </View>

      {/* Live status + a receipt that data really landed */}
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowLabel}>Right now</Text>
          <Text style={styles.rowHint}>
            {modeLabel}{'\n'}Last sync {lastSync}
            {stored != null ? ` \u00b7 ${stored.toLocaleString()} readings stored` : ''}
            {status?.lastError ? `\n\u26a0 ${status.lastError}` : ''}
          </Text>
        </View>
        <TouchableOpacity onPress={() => { void vitalsScheduler.syncNow(); }}>
          <Text style={[styles.rowValue, { color: COLORS.gold }]}>Sync now</Text>
        </TouchableOpacity>
      </View>
    </>
  );
};

const Stat = ({ value, label }: { value: string; label: string }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
  </View>
);

const ProfileEditor = ({
  profile,
  onSave,
  onClose,
}: {
  profile: UserProfile;
  onSave: (p: UserProfile) => void;
  onClose: () => void;
}) => {
  const [name, setName] = useState(profile.name);
  const [email, setEmail] = useState(profile.email || '');
  const [phone, setPhone] = useState(profile.phone || '');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Edit profile</Text>

          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={COLORS.muted}
          />

          <Text style={styles.fieldLabel}>Email</Text>
          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={COLORS.muted}
            keyboardType="email-address"
            autoCapitalize="none"
          />

          <Text style={styles.fieldLabel}>Phone</Text>
          <TextInput
            style={styles.input}
            value={phone}
            onChangeText={setPhone}
            placeholder="+91 ..."
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
          />

          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => {
              if (!name.trim()) return;
              onSave({
                ...profile,
                name: name.trim(),
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
              });
            }}
          >
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingBottom: SPACING.xl },
  header: {
    paddingTop: 50,
    paddingHorizontal: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING.lg,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeBtnText: { color: COLORS.gold, fontSize: 18, fontWeight: '700' },
  title: { fontSize: 22, color: COLORS.cream, fontWeight: '700' },

  profileCard: {
    margin: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    padding: SPACING.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  avatar: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: COLORS.gold,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  avatarText: { fontSize: 28, color: COLORS.deep, fontWeight: '700' },
  profileName: { fontSize: 18, color: COLORS.cream, fontWeight: '700' },
  profileMeta: { fontSize: 12, color: COLORS.muted, marginTop: 4 },
  profileSince: { fontSize: 11, color: COLORS.gold, marginTop: 8, fontStyle: 'italic' },
  editBtn: {
    marginTop: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: 8,
    backgroundColor: 'rgba(212, 160, 23, 0.15)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: COLORS.gold,
  },
  editBtnText: { color: COLORS.gold, fontSize: 12, fontWeight: '600' },

  statsCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  statsTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
  },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontSize: 18, color: COLORS.gold, fontWeight: '700' },
  statLabel: { fontSize: 10, color: COLORS.muted, marginTop: 2, letterSpacing: 1 },

  sectionTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    paddingHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  rowLabel: { fontSize: 13, color: COLORS.cream },
  rowValue: { fontSize: 13, color: COLORS.muted },
  rowHint:  { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  ringRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.sm,
    padding: SPACING.md, borderRadius: 12,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: COLORS.border,
  },
  ringBtn: {
    paddingHorizontal: SPACING.md, paddingVertical: 8,
    borderRadius: 8, borderWidth: 1, borderColor: COLORS.gold,
    backgroundColor: 'rgba(212,160,23,0.12)',
  },
  ringBtnConnected: { borderColor: COLORS.muted, backgroundColor: 'rgba(255,255,255,0.06)' },
  ringBtnText: { color: COLORS.gold, fontWeight: '700', fontSize: 12 },
  ringBtnTextConnected: { color: COLORS.muted },

  dangerBtn: {
    margin: SPACING.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: 10,
    padding: SPACING.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  dangerBtnText: { fontSize: 14, color: COLORS.error, fontWeight: '700', marginBottom: 4 },
  dangerBtnHint: { fontSize: 11, color: COLORS.muted },

  footer: {
    textAlign: 'center',
    fontSize: 12,
    color: COLORS.muted,
    marginTop: SPACING.lg,
    fontStyle: 'italic',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
  },
  modalHandle: {
    width: 40,
    height: 4,
    backgroundColor: COLORS.border,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: SPACING.md,
  },
  modalTitle: {
    fontSize: 18,
    color: COLORS.cream,
    fontWeight: '700',
    marginBottom: SPACING.md,
  },
  fieldLabel: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '600',
    marginBottom: 6,
    marginTop: SPACING.sm,
    letterSpacing: 1,
  },
  input: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    color: COLORS.cream,
    fontSize: 14,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  saveBtn: {
    backgroundColor: COLORS.gold,
    borderRadius: 10,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.lg,
  },
  saveBtnText: { color: COLORS.deep, fontWeight: '700', fontSize: 15 },
  cancelBtn: {
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginTop: SPACING.sm,
  },
  cancelBtnText: { color: COLORS.muted, fontSize: 14 },
});
