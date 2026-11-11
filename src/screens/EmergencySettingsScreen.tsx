/**
 * EmergencySettingsScreen — the user's emergency contact, which rules fire,
 * and the thresholds each one uses.
 *
 * Opened from the side menu → "Emergency & Safety". Writes through
 * `emergencyPrefs`; the live watcher re-reads prefs each time this screen
 * saves, so changes take effect immediately.
 */

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Switch,
  KeyboardAvoidingView, Platform, Alert, StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SPACING } from '../theme';
import { emergencyPrefs, type EmergencyPrefs } from '../services/emergencyPrefs';
import { vitalsSafetyWatcher } from '../soulsync/safety/VitalsSafetyWatcher';

interface Props {
  onClose: () => void;
}

export const EmergencySettingsScreen: React.FC<Props> = ({ onClose }) => {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<EmergencyPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    void emergencyPrefs.read().then((p) => { if (alive) setPrefs(p); });
    return () => { alive = false; };
  }, []);

  if (!prefs) {
    return <View style={styles.screen} />;
  }

  const patch = (next: Partial<EmergencyPrefs>) => setPrefs((p) => p ? { ...p, ...next } : p);
  const setRule = (k: keyof EmergencyPrefs['rules'], v: boolean) =>
    setPrefs((p) => p ? { ...p, rules: { ...p.rules, [k]: v } } : p);
  const setThreshold = (k: keyof EmergencyPrefs['thresholds'], v: number) =>
    setPrefs((p) => p ? { ...p, thresholds: { ...p.thresholds, [k]: v } } : p);

  const save = async () => {
    if (prefs.enabled) {
      if (!prefs.contactPhone.trim()) {
        Alert.alert(
          'Contact needed',
          'An emergency contact phone number is required before Emergency alerts can be enabled. ' +
          'Add one, or turn the main switch off.',
        );
        return;
      }
    }
    setSaving(true);
    try {
      await emergencyPrefs.write(prefs);
      await vitalsSafetyWatcher.reloadPrefs();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar barStyle="light-content" backgroundColor={COLORS.deep} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.closeTxt}>✕</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>EMERGENCY & SAFETY</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.lead}>
          If your vitals go outside safe bounds for a sustained window, the app
          will check in with you. If you confirm symptoms — or if the reading is
          so extreme it cannot wait — it sends your emergency contact an SMS
          and opens the phone dialler on their number.
        </Text>

        {/* Master switch */}
        <View style={styles.card}>
          <View style={styles.rowSplit}>
            <View style={{ flex: 1, paddingRight: 12 }}>
              <Text style={styles.cardTitle}>Emergency alerts</Text>
              <Text style={styles.cardHint}>
                Master switch. Off means no alerts of any kind — including
                critical ones.
              </Text>
            </View>
            <Switch
              value={prefs.enabled}
              onValueChange={(v) => patch({ enabled: v })}
              trackColor={{ false: COLORS.border, true: COLORS.gold }}
              thumbColor={prefs.enabled ? COLORS.cream : COLORS.muted}
            />
          </View>
        </View>

        {/* Contact */}
        <Text style={styles.sectionTitle}>Emergency contact</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Name</Text>
          <TextInput
            style={styles.input}
            value={prefs.contactName}
            onChangeText={(t) => patch({ contactName: t })}
            placeholder="e.g. Aditi (spouse)"
            placeholderTextColor={COLORS.muted}
          />
          <Text style={[styles.fieldLabel, { marginTop: SPACING.md }]}>Phone</Text>
          <TextInput
            style={styles.input}
            value={prefs.contactPhone}
            onChangeText={(t) => patch({ contactPhone: t })}
            placeholder="+91 98765 43210"
            placeholderTextColor={COLORS.muted}
            keyboardType="phone-pad"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <Text style={styles.cardHint}>
            Include the country code. We will not call or text anyone without
            a confirmed alert — or, for critical thresholds, a 10-second
            cancel window.
          </Text>
        </View>

        {/* Rules */}
        <Text style={styles.sectionTitle}>What to watch for</Text>

        <RuleCard
          title="Low SpO₂ while resting"
          hint={`Trigger below ${prefs.thresholds.spo2LowPct}% sustained ${prefs.thresholds.sustainedSeconds}s. Auto-SMS below ${prefs.thresholds.spo2CriticalPct}%.`}
          on={prefs.rules.lowSpo2}
          onToggle={(v) => setRule('lowSpo2', v)}
        >
          <NumberRow label="Warn below" value={prefs.thresholds.spo2LowPct}
            unit="%" min={70} max={99} onChange={(v) => setThreshold('spo2LowPct', v)} />
          <NumberRow label="Auto-escalate below" value={prefs.thresholds.spo2CriticalPct}
            unit="%" min={60} max={95} onChange={(v) => setThreshold('spo2CriticalPct', v)} />
        </RuleCard>

        <RuleCard
          title="Heart rate too high"
          hint={`Trigger above ${prefs.thresholds.hrHighBpm} bpm sustained ${prefs.thresholds.sustainedSeconds}s.`}
          on={prefs.rules.highHr}
          onToggle={(v) => setRule('highHr', v)}
        >
          <NumberRow label="Warn above" value={prefs.thresholds.hrHighBpm}
            unit="bpm" min={90} max={200} onChange={(v) => setThreshold('hrHighBpm', v)} />
        </RuleCard>

        <RuleCard
          title="Heart rate too low"
          hint={`Trigger below ${prefs.thresholds.hrLowBpm} bpm sustained ${prefs.thresholds.sustainedSeconds}s. Auto-SMS below ${prefs.thresholds.hrCriticalLowBpm} bpm.`}
          on={prefs.rules.lowHr}
          onToggle={(v) => setRule('lowHr', v)}
        >
          <NumberRow label="Warn below" value={prefs.thresholds.hrLowBpm}
            unit="bpm" min={30} max={60} onChange={(v) => setThreshold('hrLowBpm', v)} />
          <NumberRow label="Auto-escalate below" value={prefs.thresholds.hrCriticalLowBpm}
            unit="bpm" min={25} max={55} onChange={(v) => setThreshold('hrCriticalLowBpm', v)} />
        </RuleCard>

        <RuleCard
          title="Sudden stress / anger spike"
          hint="HR jumps while HRV drops. Opens a check-in and offers to take you to Meditation for a 1-minute box-breathing session."
          on={prefs.rules.stressSpike}
          onToggle={(v) => setRule('stressSpike', v)}
        />

        {/* Sustained window */}
        <Text style={styles.sectionTitle}>Sensitivity</Text>
        <View style={styles.card}>
          <NumberRow label="Must stay out of range for" value={prefs.thresholds.sustainedSeconds}
            unit="sec" min={15} max={300}
            onChange={(v) => setThreshold('sustainedSeconds', v)} />
          <Text style={styles.cardHint}>
            A single noisy reading does not raise an alert. A vital must stay
            outside the threshold for this long before anything fires.
          </Text>
        </View>

        {/* Test alert — fires the full modal + SMS pre-fill + dialler flow
            with a fake low-SpO2 reading. No real vital trigger needed. */}
        <Text style={styles.sectionTitle}>Test the alert</Text>
        <View style={styles.card}>
          <Text style={styles.cardHint}>
            Fires a fake low-SpO₂ alert so you can walk through the whole
            check-in → messaging app → dialler sequence before you actually
            need it. Your emergency contact is NOT messaged unless you pick
            "Alert my contact" in the modal and tap Send in the SMS app.
          </Text>
          <TouchableOpacity
            style={styles.testBtn}
            activeOpacity={0.85}
            onPress={() => {
              if (!prefs.contactPhone.trim()) {
                Alert.alert(
                  'Set a contact first',
                  'Add an emergency contact phone number above, save, then try the test.',
                );
                return;
              }
              onClose();
              setTimeout(() => vitalsSafetyWatcher.fireTestAlert('lowSpo2'), 400);
            }}
          >
            <Text style={styles.testBtnTxt}>🔔  Fire a test alert now</Text>
          </TouchableOpacity>
        </View>

        {/* SMS template */}
        <Text style={styles.sectionTitle}>SMS message</Text>
        <View style={styles.card}>
          <TextInput
            style={[styles.input, { minHeight: 90, textAlignVertical: 'top' }]}
            value={prefs.smsTemplate}
            onChangeText={(t) => patch({ smsTemplate: t })}
            multiline
            placeholder="Message to send on alert"
            placeholderTextColor={COLORS.muted}
          />
          <Text style={styles.cardHint}>
            Placeholders: <Text style={styles.mono}>&#123;name&#125;</Text>,{' '}
            <Text style={styles.mono}>&#123;contact&#125;</Text>,{' '}
            <Text style={styles.mono}>&#123;reason&#125;</Text>,{' '}
            <Text style={styles.mono}>&#123;time&#125;</Text>
            {'\n'}SMS is composed in your phone's messaging app — you tap Send,
            or a 10-second auto-send kicks in on critical thresholds.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.saveBar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onClose}>
          <Text style={styles.cancelBtnTxt}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
          <Text style={styles.saveBtnTxt}>{saving ? 'Saving…' : 'Save'}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ─── Reusable bits ───────────────────────────────────────────────────

const RuleCard: React.FC<{
  title: string;
  hint: string;
  on: boolean;
  onToggle: (v: boolean) => void;
  children?: React.ReactNode;
}> = ({ title, hint, on, onToggle, children }) => (
  <View style={[styles.card, !on && { opacity: 0.6 }]}>
    <View style={styles.rowSplit}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardHint}>{hint}</Text>
      </View>
      <Switch
        value={on}
        onValueChange={onToggle}
        trackColor={{ false: COLORS.border, true: COLORS.gold }}
        thumbColor={on ? COLORS.cream : COLORS.muted}
      />
    </View>
    {on && children ? <View style={{ marginTop: SPACING.md }}>{children}</View> : null}
  </View>
);

const NumberRow: React.FC<{
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
}> = ({ label, value, unit, min, max, onChange }) => (
  <View style={styles.numRow}>
    <Text style={styles.numLabel}>{label}</Text>
    <View style={styles.numRight}>
      <TouchableOpacity
        style={styles.numStep}
        onPress={() => onChange(Math.max(min, value - 1))}
      >
        <Text style={styles.numStepTxt}>−</Text>
      </TouchableOpacity>
      <TextInput
        style={styles.numInput}
        value={String(value)}
        keyboardType="numeric"
        onChangeText={(t) => {
          const n = parseInt(t.replace(/[^\d]/g, ''), 10);
          if (!Number.isFinite(n)) return;
          onChange(Math.max(min, Math.min(max, n)));
        }}
      />
      <TouchableOpacity
        style={styles.numStep}
        onPress={() => onChange(Math.min(max, value + 1))}
      >
        <Text style={styles.numStepTxt}>+</Text>
      </TouchableOpacity>
      <Text style={styles.numUnit}>{unit}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.deep },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: SPACING.md, paddingBottom: SPACING.md,
    borderBottomWidth: 1, borderBottomColor: COLORS.border,
  },
  closeBtn: { width: 36, height: 36, alignItems: 'flex-start', justifyContent: 'center' },
  closeTxt: { color: COLORS.cream, fontSize: 20, fontWeight: '700' },
  headerTitle: { color: COLORS.cream, fontSize: 13, fontWeight: '700', letterSpacing: 2.2 },

  body: { paddingHorizontal: SPACING.md, paddingTop: SPACING.md },
  lead: { color: COLORS.muted, fontSize: 13, lineHeight: 20, marginBottom: SPACING.lg },

  sectionTitle: {
    color: COLORS.gold, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.6, textTransform: 'uppercase',
    marginTop: SPACING.lg, marginBottom: SPACING.sm,
  },
  card: {
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    padding: SPACING.md, marginBottom: SPACING.sm,
    borderWidth: 1, borderColor: COLORS.border,
  },
  cardTitle: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  cardHint: { color: COLORS.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },

  rowSplit: { flexDirection: 'row', alignItems: 'center' },

  fieldLabel: {
    color: COLORS.muted, fontSize: 11, fontWeight: '800',
    letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 6,
  },
  input: {
    color: COLORS.cream, backgroundColor: COLORS.deep,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15,
  },
  mono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', color: COLORS.cream, fontSize: 11 },

  numRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8,
  },
  numLabel: { color: COLORS.cream, fontSize: 13.5, flex: 1 },
  numRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  numStep: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: COLORS.deep, borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  numStepTxt: { color: COLORS.cream, fontSize: 18, fontWeight: '700' },
  numInput: {
    color: COLORS.cream, backgroundColor: COLORS.deep,
    borderWidth: 1, borderColor: COLORS.border, borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6, fontSize: 15,
    minWidth: 52, textAlign: 'center',
  },
  numUnit: { color: COLORS.muted, fontSize: 12, marginLeft: 4, minWidth: 28 },

  saveBar: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    flexDirection: 'row', gap: SPACING.sm,
    paddingHorizontal: SPACING.md, paddingTop: SPACING.sm,
    backgroundColor: COLORS.deep,
    borderTopWidth: 1, borderTopColor: COLORS.border,
  },
  cancelBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 12,
    borderWidth: 1, borderColor: COLORS.border,
    alignItems: 'center', justifyContent: 'center',
  },
  cancelBtnTxt: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 12,
    backgroundColor: COLORS.gold,
    alignItems: 'center', justifyContent: 'center',
  },
  saveBtnTxt: { color: COLORS.deep, fontSize: 15, fontWeight: '800' },

  testBtn: {
    marginTop: SPACING.md,
    paddingVertical: 14, borderRadius: 12,
    backgroundColor: 'rgba(255,122,133,0.12)',
    borderWidth: 1, borderColor: 'rgba(255,122,133,0.45)',
    alignItems: 'center',
  },
  testBtnTxt: { color: '#FF7A85', fontSize: 15, fontWeight: '700' },
});
