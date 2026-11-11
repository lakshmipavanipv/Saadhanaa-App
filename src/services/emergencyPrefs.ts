/**
 * emergencyPrefs — the user's emergency contact, toggles, and thresholds for
 * physical-crisis detection.
 *
 * Distinct from the emotional engine (AnxietyDetector / AggressionDetector)
 * which handles stress and anger. This file is about the hard physical
 * boundaries — low SpO2, racing or crashing heart rate — that could mean a
 * person needs help from someone, not a breathing exercise.
 *
 * Stored as a single JSON blob in AsyncStorage so the form can read and
 * write it atomically; no SQLite schema change for a handful of fields.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'sr.emergency.prefs.v1';

export interface EmergencyPrefs {
  enabled: boolean;
  contactName: string;
  contactPhone: string;             // E.164 preferred, but any dialable string
  // Which rules fire. All default on, so a user who sets a contact
  // immediately gets the whole safety net rather than ticking five boxes.
  rules: {
    lowSpo2: boolean;
    highHr: boolean;
    lowHr: boolean;
    stressSpike: boolean;
  };
  // Thresholds — defaults chosen for a resting adult. The form exposes them
  // so a clinician or a patient with atypical baselines can override them
  // without cornering themselves on a hard-coded number.
  thresholds: {
    spo2LowPct: number;              // alert below this
    spo2CriticalPct: number;         // auto-escalate below this (no confirm)
    hrHighBpm: number;               // alert above this
    hrLowBpm: number;                // alert below this
    hrCriticalLowBpm: number;        // auto-escalate below this
    // All thresholds must hold for this long before an alert fires. Stops a
    // single noisy reading from dialling a contact at 3am.
    sustainedSeconds: number;
  };
  // The message pre-filled into the SMS. {contact} and {name} get replaced
  // with the user's name and the alert reason.
  smsTemplate: string;
}

export const DEFAULTS: EmergencyPrefs = {
  enabled: false,
  contactName: '',
  contactPhone: '',
  rules: {
    lowSpo2: true,
    highHr: true,
    lowHr: true,
    stressSpike: true,
  },
  thresholds: {
    spo2LowPct: 90,
    spo2CriticalPct: 85,
    hrHighBpm: 120,
    hrLowBpm: 50,
    hrCriticalLowBpm: 40,
    sustainedSeconds: 60,
  },
  smsTemplate:
    'This is an automated message from {name}\'s Saadhana Ring app. ' +
    'It detected {reason}. Please check on them. ' +
    'Sent at {time}.',
};

export const emergencyPrefs = {
  async read(): Promise<EmergencyPrefs> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (!raw) return { ...DEFAULTS };
      const parsed = JSON.parse(raw);
      // Shallow-merge defaults so a prefs blob from an older build that is
      // missing newer fields (a new rule, a new threshold) still loads with
      // sensible values rather than crashing the form.
      return {
        ...DEFAULTS,
        ...parsed,
        rules: { ...DEFAULTS.rules, ...(parsed.rules ?? {}) },
        thresholds: { ...DEFAULTS.thresholds, ...(parsed.thresholds ?? {}) },
      };
    } catch {
      return { ...DEFAULTS };
    }
  },

  async write(prefs: EmergencyPrefs): Promise<void> {
    await AsyncStorage.setItem(KEY, JSON.stringify(prefs));
  },

  async update(patch: Partial<EmergencyPrefs>): Promise<EmergencyPrefs> {
    const cur = await emergencyPrefs.read();
    const next: EmergencyPrefs = { ...cur, ...patch };
    await emergencyPrefs.write(next);
    return next;
  },
};

/**
 * Fill {contact}, {name}, {reason}, {time} placeholders in the SMS template.
 */
export const renderSms = (template: string, args: {
  name: string;
  contact: string;
  reason: string;
}): string => {
  const now = new Date();
  const hh = `${now.getHours()}`.padStart(2, '0');
  const mm = `${now.getMinutes()}`.padStart(2, '0');
  return template
    .replaceAll('{name}', args.name || 'the user')
    .replaceAll('{contact}', args.contact || 'you')
    .replaceAll('{reason}', args.reason)
    .replaceAll('{time}', `${hh}:${mm}`);
};
