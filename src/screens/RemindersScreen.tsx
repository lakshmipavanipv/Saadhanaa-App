/**
 * RemindersScreen — one-stop Settings page for every ring-driven reminder.
 *
 * Rows:
 *   • Alarms — add/edit/delete alarm entries (hour, minute, days, label)
 *   • Sedentary reminder — buzz if no motion for N min inside a window
 *   • Drink reminder — periodic buzz within a window
 *   • Do Not Disturb — mute window (also silences notification push)
 *   • Notification push — relay categories from the phone to the ring
 *
 * Config is stored in AsyncStorage under 'reminders_config'. When the user
 * hits "Sync to ring" (or toggles anything with a paired ring connected),
 * the values are pushed via RemindersApi.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, TextInput,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useTheme } from '../ThemeContext';
import { Storage } from '../storage';
import { SadhanaRing } from '../soulsync/ring/SadhanaRing';
import { readSr16DeviceId } from '../soulsync/ring/japaCounter';
import type {
  Alarm, SedentaryConfig, DrinkConfig, DndConfig, NotificationPushConfig,
} from '../soulsync/ring/reminders';

const STORAGE_KEY = 'reminders_config';

interface RemindersConfig {
  alarms: Alarm[];
  sedentary: SedentaryConfig;
  drink: DrinkConfig;
  dnd: DndConfig;
  notify: NotificationPushConfig;
}

const DEFAULTS: RemindersConfig = {
  alarms: [],
  sedentary: { enabled: false, intervalMin: 60, startHour: 9, endHour: 18 },
  drink:     { enabled: false, intervalMin: 120, startHour: 8, endHour: 22 },
  dnd:       { enabled: false, startHour: 22, endHour: 7 },
  notify:    { enabled: false, categories: { call: true, sms: true, whatsapp: false, email: false, generic: false } },
};

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

export const RemindersScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [cfg, setCfg] = useState<RemindersConfig>(DEFAULTS);
  const [addingAlarm, setAddingAlarm] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void (async () => {
      const saved = await Storage.get<RemindersConfig>(STORAGE_KEY, DEFAULTS);
      setCfg({ ...DEFAULTS, ...saved, alarms: saved.alarms ?? [] });
    })();
  }, []);

  const persist = useCallback(async (next: RemindersConfig) => {
    setCfg(next);
    await Storage.set(STORAGE_KEY, next);
  }, []);

  const syncToRing = useCallback(async () => {
    setBusy(true);
    try {
      const deviceId = await readSr16DeviceId();
      if (!deviceId) throw new Error('No SR16 paired — pair from Device Settings first.');
      const ring = await SadhanaRing.connect(deviceId, { keepAlive: false });
      try {
        await ring.reminders.setAlarms(cfg.alarms);
        await ring.reminders.setSedentaryReminder(cfg.sedentary);
        await ring.reminders.setDrinkReminder(cfg.drink);
        await ring.reminders.setDnd(cfg.dnd);
        Alert.alert('Reminders synced', 'All settings pushed to your ring.');
      } finally {
        await ring.disconnect().catch(() => {});
      }
    } catch (e) {
      Alert.alert('Sync failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [cfg]);

  const testNotification = useCallback(async () => {
    setBusy(true);
    try {
      const deviceId = await readSr16DeviceId();
      if (!deviceId) throw new Error('No SR16 paired.');
      const ring = await SadhanaRing.connect(deviceId, { keepAlive: false });
      try {
        await ring.reminders.pushNotification('Sadhana', 'Test notification from your app 🙏', 'generic');
        Alert.alert('Sent', 'Your ring should show the message.');
      } finally {
        await ring.disconnect().catch(() => {});
      }
    } catch (e) {
      Alert.alert('Notification failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }, []);

  const addAlarm = () => setAddingAlarm(true);
  const saveNewAlarm = (a: Alarm) => {
    void persist({ ...cfg, alarms: [...cfg.alarms, a] });
    setAddingAlarm(false);
  };
  const removeAlarm = (id: string) => {
    void persist({ ...cfg, alarms: cfg.alarms.filter((x) => x.id !== id) });
  };
  const toggleAlarm = (id: string) => {
    void persist({
      ...cfg,
      alarms: cfg.alarms.map((x) => x.id === id ? { ...x, enabled: !x.enabled } : x),
    });
  };

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <View style={styles.headerRow}>
        <TouchableOpacity style={styles.back} onPress={() => navigation?.goBack?.()} hitSlop={{top:8,bottom:8,left:8,right:8}}>
          <Text style={styles.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Reminders</Text>
        <TouchableOpacity
          style={[styles.syncBtn, busy && styles.syncBtnDisabled]}
          onPress={syncToRing}
          disabled={busy}
        >
          <Text style={styles.syncBtnTxt}>{busy ? '…' : 'Sync'}</Text>
        </TouchableOpacity>
      </View>

      {/* ── Alarms ─────────────────────────────────────────────── */}
      <SectionHeader label="Alarms" />
      {cfg.alarms.length === 0 && !addingAlarm ? (
        <Text style={styles.emptyLine}>No alarms yet. Tap + to add one.</Text>
      ) : null}
      {cfg.alarms.map((a) => (
        <View key={a.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.rowBig}>
              {String(a.hour).padStart(2, '0')}:{String(a.minute).padStart(2, '0')}
              {a.label ? <Text style={styles.rowSub}>  ·  {a.label}</Text> : null}
            </Text>
            <View style={styles.dayRow}>
              {DAY_LETTERS.map((letter, i) => (
                <View key={i} style={[
                  styles.dayPill,
                  a.daysOfWeek.includes(i) && styles.dayPillOn,
                ]}>
                  <Text style={[styles.dayPillTxt, a.daysOfWeek.includes(i) && styles.dayPillTxtOn]}>{letter}</Text>
                </View>
              ))}
            </View>
          </View>
          <Switch value={a.enabled} onValueChange={() => toggleAlarm(a.id)} thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }} />
          <TouchableOpacity onPress={() => removeAlarm(a.id)} hitSlop={{top:8,bottom:8,left:8,right:8}} style={styles.delBtn}>
            <Text style={styles.delTxt}>×</Text>
          </TouchableOpacity>
        </View>
      ))}
      {addingAlarm ? (
        <AlarmEditor
          onCancel={() => setAddingAlarm(false)}
          onSave={saveNewAlarm}
        />
      ) : (
        <TouchableOpacity style={styles.addBtn} onPress={addAlarm}>
          <Text style={styles.addBtnTxt}>+  Add alarm</Text>
        </TouchableOpacity>
      )}

      {/* ── Sedentary ───────────────────────────────────────────── */}
      <SectionHeader label="Sedentary reminder" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowBig}>Buzz after inactivity</Text>
          <Text style={styles.rowSub}>
            Every {cfg.sedentary.intervalMin} min · {fmtWindow(cfg.sedentary.startHour, cfg.sedentary.endHour)}
          </Text>
        </View>
        <Switch
          value={cfg.sedentary.enabled}
          onValueChange={(v) => persist({ ...cfg, sedentary: { ...cfg.sedentary, enabled: v } })}
          thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }}
        />
      </View>
      <IntervalRow
        label="Interval (min)"
        value={cfg.sedentary.intervalMin}
        step={15} min={15} max={180}
        onChange={(v) => persist({ ...cfg, sedentary: { ...cfg.sedentary, intervalMin: v } })}
      />
      <HourWindowRow
        startH={cfg.sedentary.startHour}
        endH={cfg.sedentary.endHour}
        onChange={(s, e) => persist({ ...cfg, sedentary: { ...cfg.sedentary, startHour: s, endHour: e } })}
      />

      {/* ── Drink ────────────────────────────────────────────── */}
      <SectionHeader label="Drink reminder" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowBig}>Water reminder</Text>
          <Text style={styles.rowSub}>
            Every {cfg.drink.intervalMin} min · {fmtWindow(cfg.drink.startHour, cfg.drink.endHour)}
          </Text>
        </View>
        <Switch
          value={cfg.drink.enabled}
          onValueChange={(v) => persist({ ...cfg, drink: { ...cfg.drink, enabled: v } })}
          thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }}
        />
      </View>
      <IntervalRow
        label="Interval (min)"
        value={cfg.drink.intervalMin}
        step={30} min={30} max={360}
        onChange={(v) => persist({ ...cfg, drink: { ...cfg.drink, intervalMin: v } })}
      />
      <HourWindowRow
        startH={cfg.drink.startHour}
        endH={cfg.drink.endHour}
        onChange={(s, e) => persist({ ...cfg, drink: { ...cfg.drink, startHour: s, endHour: e } })}
      />

      {/* ── DND ────────────────────────────────────────────── */}
      <SectionHeader label="Do Not Disturb" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowBig}>Silent hours</Text>
          <Text style={styles.rowSub}>{fmtWindow(cfg.dnd.startHour, cfg.dnd.endHour)}</Text>
        </View>
        <Switch
          value={cfg.dnd.enabled}
          onValueChange={(v) => persist({ ...cfg, dnd: { ...cfg.dnd, enabled: v } })}
          thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }}
        />
      </View>
      <HourWindowRow
        startH={cfg.dnd.startHour}
        endH={cfg.dnd.endHour}
        onChange={(s, e) => persist({ ...cfg, dnd: { ...cfg.dnd, startHour: s, endHour: e } })}
      />

      {/* ── Notification push ───────────────────────────── */}
      <SectionHeader label="Message push" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.rowBig}>Push app notifications to ring</Text>
          <Text style={styles.rowSub}>Ring shows the alert on its OLED</Text>
        </View>
        <Switch
          value={cfg.notify.enabled}
          onValueChange={(v) => persist({ ...cfg, notify: { ...cfg.notify, enabled: v } })}
          thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }}
        />
      </View>
      {(['call', 'sms', 'whatsapp', 'email', 'generic'] as const).map((k) => (
        <View key={k} style={styles.rowSlim}>
          <Text style={styles.rowSubBold}>{k.toUpperCase()}</Text>
          <Switch
            value={!!cfg.notify.categories?.[k]}
            onValueChange={(v) => persist({
              ...cfg,
              notify: { ...cfg.notify, categories: { ...cfg.notify.categories, [k]: v } },
            })}
            thumbColor={palette.gold} trackColor={{ true: palette.gold, false: '#333' }}
          />
        </View>
      ))}
      <TouchableOpacity style={styles.testBtn} onPress={testNotification}>
        <Text style={styles.testBtnTxt}>📲  Send test notification</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const SectionHeader: React.FC<{ label: string }> = ({ label }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return <Text style={styles.section}>{label}</Text>;
};

const IntervalRow: React.FC<{ label: string; value: number; step: number; min: number; max: number; onChange: (v: number) => void }> = ({
  label, value, step, min, max, onChange,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={styles.rowSlim}>
      <Text style={styles.rowSubBold}>{label}</Text>
      <View style={styles.stepper}>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))}>
          <Text style={styles.stepTxt}>−</Text>
        </TouchableOpacity>
        <Text style={styles.stepVal}>{value}</Text>
        <TouchableOpacity style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))}>
          <Text style={styles.stepTxt}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const HourWindowRow: React.FC<{ startH: number; endH: number; onChange: (s: number, e: number) => void }> = ({
  startH, endH, onChange,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={styles.rowSlim}>
      <Text style={styles.rowSubBold}>Active window</Text>
      <View style={styles.stepper}>
        <HourInput value={startH} onChange={(h) => onChange(h, endH)} />
        <Text style={{ color: palette.muted, marginHorizontal: 6 }}>→</Text>
        <HourInput value={endH} onChange={(h) => onChange(startH, h)} />
      </View>
    </View>
  );
};

const HourInput: React.FC<{ value: number; onChange: (h: number) => void }> = ({ value, onChange }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <TouchableOpacity style={styles.stepBtnSm} onPress={() => onChange((value + 23) % 24)}>
        <Text style={styles.stepTxt}>−</Text>
      </TouchableOpacity>
      <Text style={[styles.stepVal, { minWidth: 34 }]}>{String(value).padStart(2, '0')}h</Text>
      <TouchableOpacity style={styles.stepBtnSm} onPress={() => onChange((value + 1) % 24)}>
        <Text style={styles.stepTxt}>+</Text>
      </TouchableOpacity>
    </View>
  );
};

const AlarmEditor: React.FC<{ onSave: (a: Alarm) => void; onCancel: () => void }> = ({ onSave, onCancel }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]); // weekdays
  const [label, setLabel] = useState('');

  const toggleDay = (d: number) => {
    setDays((prev) => prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort());
  };

  const save = () => {
    onSave({
      id: `a_${Date.now()}`,
      hour, minute, daysOfWeek: days, enabled: true, label: label.trim() || undefined,
    });
  };

  return (
    <View style={styles.editorCard}>
      <View style={styles.editorRow}>
        <HourInput value={hour} onChange={setHour} />
        <Text style={{ color: palette.cream, fontSize: 18 }}>:</Text>
        <HourInput value={minute} onChange={setMinute} />
      </View>
      <View style={styles.dayRow}>
        {DAY_LETTERS.map((letter, i) => (
          <TouchableOpacity
            key={i}
            onPress={() => toggleDay(i)}
            style={[styles.dayPill, days.includes(i) && styles.dayPillOn]}
          >
            <Text style={[styles.dayPillTxt, days.includes(i) && styles.dayPillTxtOn]}>{letter}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TextInput
        style={styles.labelInput}
        placeholder="Label (optional)"
        placeholderTextColor={palette.muted}
        value={label}
        onChangeText={setLabel}
        maxLength={32}
      />
      <View style={styles.editorActions}>
        <TouchableOpacity style={styles.editorBtn} onPress={onCancel}>
          <Text style={styles.editorBtnTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.editorBtn, styles.editorBtnPrimary]} onPress={save}>
          <Text style={[styles.editorBtnTxt, styles.editorBtnTxtPrimary]}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtWindow(s: number, e: number): string {
  return `${String(s).padStart(2, '0')}:00 – ${String(e).padStart(2, '0')}:00`;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 40, paddingTop: 6 },

  headerRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginBottom: 8 },
  back: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  backTxt: { fontSize: 22, color: C.cream, marginTop: -3 },
  title: { flex: 1, fontSize: 22, color: C.cream, fontWeight: '700' },
  syncBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    backgroundColor: C.gold, borderRadius: 8,
  },
  syncBtnDisabled: { opacity: 0.4 },
  syncBtnTxt: { color: '#0a0a0a', fontWeight: '700', fontSize: 13 },

  section: {
    fontSize: 10, fontWeight: '700', color: C.gold,
    letterSpacing: 1.4, textTransform: 'uppercase',
    marginTop: 18, marginBottom: 6, paddingHorizontal: 4,
  },

  emptyLine: {
    fontSize: 12, color: C.muted, fontStyle: 'italic',
    paddingHorizontal: 4, paddingVertical: 8,
  },

  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 14, marginBottom: 8,
    backgroundColor: C.cardBg,
    borderColor: C.border, borderWidth: 1,
    borderRadius: 12,
  },
  rowSlim: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
  },
  rowBig: { fontSize: 15, color: C.cream, fontWeight: '600' },
  rowSub: { fontSize: 12, color: C.muted, marginTop: 3 },
  rowSubBold: { fontSize: 12, color: C.cream, fontWeight: '600' },

  dayRow: { flexDirection: 'row', gap: 4, marginTop: 8, flexWrap: 'wrap' },
  dayPill: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    borderColor: C.border, borderWidth: 1,
  },
  dayPillOn: { backgroundColor: C.gold, borderColor: C.gold },
  dayPillTxt: { fontSize: 10, color: C.muted, fontWeight: '700' },
  dayPillTxtOn: { color: '#0a0a0a' },

  delBtn: { padding: 4 },
  delTxt: { fontSize: 22, color: C.muted },

  addBtn: {
    padding: 12, alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth, borderColor: C.gold, borderStyle: 'dashed',
    borderRadius: 10, marginTop: 4,
  },
  addBtnTxt: { color: C.gold, fontWeight: '600' },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepBtn: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  stepBtnSm: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  stepTxt: { fontSize: 16, color: C.cream, marginTop: -2 },
  stepVal: { minWidth: 30, textAlign: 'center', color: C.cream, fontWeight: '600', fontVariant: ['tabular-nums'] },

  editorCard: {
    padding: 14, marginBottom: 8,
    backgroundColor: C.cardBg, borderColor: C.gold, borderWidth: 1,
    borderRadius: 12,
  },
  editorRow: { flexDirection: 'row', alignItems: 'center', gap: 4, justifyContent: 'center', marginBottom: 12 },
  labelInput: {
    marginTop: 12, padding: 10,
    color: C.cream, borderColor: C.border, borderWidth: 1, borderRadius: 8,
    fontSize: 14,
  },
  editorActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  editorBtn: {
    flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8,
    borderColor: C.border, borderWidth: 1,
  },
  editorBtnPrimary: { backgroundColor: C.gold, borderColor: C.gold },
  editorBtnTxt: { color: C.muted, fontWeight: '600' },
  editorBtnTxtPrimary: { color: '#0a0a0a' },

  testBtn: {
    marginTop: 12, padding: 12, borderRadius: 10, alignItems: 'center',
    borderColor: C.gold, borderWidth: 1,
    backgroundColor: 'rgba(212,160,23,0.10)',
  },
  testBtnTxt: { color: C.gold, fontWeight: '700' },
});
