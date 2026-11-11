/**
 * EmergencyAlertModal — the sheet that appears when the VitalsSafetyWatcher
 * raises an EmergencyAlert.
 *
 * Three shapes, decided by the alert:
 *
 *   • rule 'lowSpo2' or 'highHr' at severity 'warn' → questionnaire. Ask if
 *     the user is resting, breathing normally, feels symptomatic. If yes
 *     → SMS + dialler. If no → dismiss.
 *
 *   • rule 'lowHr' at severity 'warn' → questionnaire about chest pain /
 *     dizziness / cold sweats / lightheadedness / fainting. Any yes → SMS +
 *     dialler, immediately.
 *
 *   • severity 'critical' (SpO2 < critical, HR < critical) → 10-second
 *     auto-send countdown with a CANCEL button. If not cancelled, SMS fires
 *     via the sms: URI and the dialler opens.
 *
 * SMS strategy: we open the sms: URI with the body and recipient prefilled,
 * which launches the user's own messaging app. The user still has to tap
 * Send. True silent auto-send would need SEND_SMS permission and a native
 * module; this is the honest compromise. "Auto-SMS" above means: the modal
 * opens the messaging app for them, they do not have to type anything.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Modal, View, Text, StyleSheet, TouchableOpacity, ScrollView, Linking,
  Alert, Vibration,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { emergencyPrefs, renderSms } from '../services/emergencyPrefs';
import type { EmergencyAlert } from '../soulsync/safety/VitalsSafetyWatcher';
import { useSadhana } from '../context';

interface Props {
  alert: EmergencyAlert | null;
  onDismiss: () => void;
  /** Navigate to Meditation with a preset — used by the stress-spike reroute. */
  onOpenMeditation?: () => void;
}

export const EmergencyAlertModal: React.FC<Props> = ({ alert, onDismiss, onOpenMeditation }) => {
  const { userProfile } = useSadhana();
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [countdown, setCountdown] = useState<number | null>(null);
  const cancelledRef = useRef(false);

  // Vibrate when the modal opens, and reset state when it closes.
  useEffect(() => {
    if (!alert) {
      setConfirmed(new Set());
      setCountdown(null);
      cancelledRef.current = false;
      return;
    }
    try { Vibration.vibrate([0, 180, 120, 180, 120, 360]); } catch { /* */ }
    if (alert.severity === 'critical') {
      // 10-second auto-escalate.
      cancelledRef.current = false;
      setCountdown(10);
    }
  }, [alert]);

  // Countdown tick.
  useEffect(() => {
    if (countdown == null) return;
    if (countdown <= 0) {
      if (!cancelledRef.current && alert) {
        void escalate(alert, userProfile?.name ?? '');
      }
      setCountdown(null);
      onDismiss();
      return;
    }
    const id = setTimeout(() => setCountdown((n) => (n == null ? null : n - 1)), 1000);
    return () => clearTimeout(id);
  }, [countdown, alert, onDismiss, userProfile?.name]);

  if (!alert) return null;

  const copy = QUESTIONNAIRE[alert.rule];
  const anyYes = confirmed.size > 0;

  const toggle = (key: string) => {
    setConfirmed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEscalate = () => { void escalate(alert, userProfile?.name ?? ''); onDismiss(); };
  const handleDismiss = () => onDismiss();
  const handleCancel = () => { cancelledRef.current = true; setCountdown(null); onDismiss(); };

  // Critical: countdown view.
  if (alert.severity === 'critical' && countdown != null) {
    return (
      <Modal visible transparent animationType="fade" onRequestClose={handleCancel}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, styles.sheetCritical]}>
            <Text style={styles.criticalBadge}>CRITICAL</Text>
            <Text style={styles.title}>Calling your emergency contact</Text>
            <Text style={styles.body}>
              The app detected {alert.reason}. In {countdown} second
              {countdown === 1 ? '' : 's'} it will text and open the dialler for
              your emergency contact. Tap Cancel if you are safe.
            </Text>
            <Text style={styles.countdownBig}>{countdown}</Text>
            <TouchableOpacity style={styles.cancelBigBtn} onPress={handleCancel}>
              <Text style={styles.cancelBigBtnTxt}>Cancel — I'm OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  // Warn: questionnaire view.
  return (
    <Modal visible transparent animationType="fade" onRequestClose={handleDismiss}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.warnBadge}>CHECK-IN</Text>
          <Text style={styles.title}>{copy.title}</Text>
          <Text style={styles.body}>{copy.lead(alert)}</Text>

          <ScrollView style={{ maxHeight: 280 }}>
            {copy.questions.map((q) => (
              <TouchableOpacity
                key={q.key}
                style={[styles.optRow, confirmed.has(q.key) && styles.optRowOn]}
                onPress={() => toggle(q.key)}
                activeOpacity={0.75}
              >
                <View style={[styles.optCheck, confirmed.has(q.key) && styles.optCheckOn]}>
                  {confirmed.has(q.key) ? <Text style={styles.optCheckMark}>✓</Text> : null}
                </View>
                <Text style={[styles.optTxt, confirmed.has(q.key) && styles.optTxtOn]}>{q.label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>

          {/* Stress-spike special: offer the meditation reroute. */}
          {alert.rule === ('stressSpike' as any) && onOpenMeditation ? (
            <TouchableOpacity
              style={[styles.btn, styles.btnMeditate]}
              onPress={() => { onOpenMeditation(); onDismiss(); }}
            >
              <Text style={styles.btnMeditateTxt}>🫁  1-minute box breathing</Text>
            </TouchableOpacity>
          ) : null}

          <View style={styles.footer}>
            <TouchableOpacity style={[styles.btn, styles.btnSecondary]} onPress={handleDismiss}>
              <Text style={styles.btnSecondaryTxt}>I'm fine</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btn, styles.btnPrimary, !anyYes && { opacity: 0.4 }]}
              onPress={handleEscalate}
              disabled={!anyYes}
            >
              <Text style={styles.btnPrimaryTxt}>Alert my contact</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ─── Escalation ──────────────────────────────────────────────────────

async function escalate(alert: EmergencyAlert, userName: string): Promise<void> {
  const prefs = await emergencyPrefs.read();
  if (!prefs.contactPhone) {
    Alert.alert(
      'No emergency contact',
      'Set one up in the side menu → Emergency & Safety.',
    );
    return;
  }

  const body = renderSms(prefs.smsTemplate, {
    name: userName || 'the user',
    contact: prefs.contactName || 'you',
    reason: alert.reason,
  });

  const smsUri = buildSmsUri(prefs.contactPhone, body);
  const telUri = `tel:${prefs.contactPhone.replace(/\s+/g, '')}`;

  try {
    // Open the messaging app first (user confirms send), THEN the dialler
    // right after, so both are queued and the user can hit Send → Back →
    // Call without digging through launchers.
    await Linking.openURL(smsUri);
    setTimeout(() => { void Linking.openURL(telUri).catch(() => { /* */ }); }, 400);
  } catch (e) {
    Alert.alert('Could not reach messaging app', String(e));
  }
}

const buildSmsUri = (phone: string, body: string): string => {
  const num = phone.replace(/\s+/g, '');
  const encoded = encodeURIComponent(body);
  // Android accepts sms:NUMBER?body=..., iOS prefers sms:NUMBER&body=... but
  // most modern iOS also accepts the Android form.
  return `sms:${num}?body=${encoded}`;
};

// ─── Questionnaires ──────────────────────────────────────────────────

const QUESTIONNAIRE: Record<string, {
  title: string;
  lead: (a: EmergencyAlert) => string;
  questions: { key: string; label: string }[];
}> = {
  lowSpo2: {
    title: 'Low SpO₂ reading',
    lead: (a) =>
      `The ring has been reading ${a.value.toFixed(0)}% for a while. Tick ` +
      'anything that applies right now.',
    questions: [
      { key: 'resting', label: 'I am resting, not moving' },
      { key: 'breath-short', label: 'I feel short of breath' },
      { key: 'lightheaded', label: 'I feel lightheaded or dizzy' },
      { key: 'chest', label: 'My chest feels tight' },
      { key: 'bluish', label: 'My lips or fingertips look bluish' },
    ],
  },
  highHr: {
    title: 'Heart rate is high',
    lead: (a) =>
      `The ring has been reading ${a.value.toFixed(0)} bpm for a while. ` +
      'Tick anything that applies right now.',
    questions: [
      { key: 'resting', label: 'I am sitting down, resting' },
      { key: 'chest', label: 'I feel chest pain or tightness' },
      { key: 'palpitations', label: 'I can feel my heart racing or skipping' },
      { key: 'short-breath', label: 'I am short of breath' },
      { key: 'dizzy', label: 'I feel dizzy or faint' },
    ],
  },
  lowHr: {
    title: 'Heart rate is low',
    lead: (a) =>
      `The ring has been reading ${a.value.toFixed(0)} bpm for a while. ` +
      'Tick anything that applies right now.',
    questions: [
      { key: 'chest', label: 'Chest pain or tightness' },
      { key: 'dizzy', label: 'Dizziness or lightheadedness' },
      { key: 'cold-sweats', label: 'Cold sweats' },
      { key: 'fainting', label: 'I nearly fainted or did faint' },
      { key: 'confusion', label: 'I feel confused or very weak' },
    ],
  },
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.72)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: SPACING.md,
  },
  sheet: {
    width: '100%', maxWidth: 480,
    backgroundColor: COLORS.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  sheetCritical: { borderColor: '#FF7A85', backgroundColor: '#1E0F13' },

  warnBadge: {
    alignSelf: 'flex-start',
    color: COLORS.gold, fontSize: 10, fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: COLORS.gold, borderRadius: 4,
    marginBottom: SPACING.sm,
  },
  criticalBadge: {
    alignSelf: 'flex-start',
    color: '#FF7A85', fontSize: 10, fontWeight: '900',
    letterSpacing: 1.6,
    paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: '#FF7A85', borderRadius: 4,
    marginBottom: SPACING.sm,
  },
  title: { color: COLORS.cream, fontSize: 20, fontWeight: '800', marginBottom: 8 },
  body: { color: COLORS.muted, fontSize: 13.5, lineHeight: 20, marginBottom: SPACING.md },

  optRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 11, paddingHorizontal: 12,
    borderRadius: 10, marginBottom: 6,
    backgroundColor: COLORS.deep,
    borderWidth: 1, borderColor: COLORS.border,
  },
  optRowOn: { backgroundColor: 'rgba(240,208,138,0.08)', borderColor: COLORS.gold },
  optCheck: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 1.5, borderColor: COLORS.muted,
    alignItems: 'center', justifyContent: 'center',
  },
  optCheckOn: { backgroundColor: COLORS.gold, borderColor: COLORS.gold },
  optCheckMark: { color: COLORS.deep, fontSize: 13, fontWeight: '900' },
  optTxt: { color: COLORS.cream, fontSize: 14, flex: 1 },
  optTxtOn: { fontWeight: '600' },

  footer: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md },
  btn: {
    flex: 1, paddingVertical: 13, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  btnPrimary: { backgroundColor: '#FF7A85' },
  btnPrimaryTxt: { color: '#1E0F13', fontSize: 15, fontWeight: '800' },
  btnSecondary: { borderWidth: 1, borderColor: COLORS.border },
  btnSecondaryTxt: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  btnMeditate: {
    marginTop: SPACING.sm,
    backgroundColor: 'rgba(192,132,252,0.15)',
    borderWidth: 1, borderColor: '#c084fc',
  },
  btnMeditateTxt: { color: '#c084fc', fontSize: 15, fontWeight: '700' },

  countdownBig: {
    color: '#FF7A85', fontSize: 72, fontWeight: '900',
    textAlign: 'center', marginVertical: SPACING.md,
  },
  cancelBigBtn: {
    backgroundColor: COLORS.gold, paddingVertical: 15, borderRadius: 12,
    alignItems: 'center',
  },
  cancelBigBtnTxt: { color: COLORS.deep, fontSize: 16, fontWeight: '800' },
});
