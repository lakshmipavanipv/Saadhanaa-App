/**
 * consentRepo — stores the user's DPDP consent locally. Telemetry is gated
 * on this: nothing leaves the device unless consent.granted is true.
 *
 * CONSENT_VERSION must be bumped whenever the consent text/categories change,
 * so returning users are re-prompted (DPDP: consent is tied to a stated notice).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export const CONSENT_VERSION = '2026-06-14';

export interface ConsentRecord {
  version: string;
  granted: boolean;
  categories: {
    identity: boolean;     // name, email, phone
    usage: boolean;        // screens, features, diagnostics
    spiritual: boolean;    // deities, japa, sadhana minutes
    health: boolean;       // BPM/HRV/SpO2/steps/sleep — sensitive, opt-in
  };
  at: string;              // ISO timestamp
}

const KEY = 'soulsync.consent.v1';

export const consentRepo = {
  async get(): Promise<ConsentRecord | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as ConsentRecord) : null;
    } catch { return null; }
  },

  /** True only if the user granted the CURRENT consent version. */
  async needsConsent(): Promise<boolean> {
    const c = await this.get();
    return !(c && c.granted && c.version === CONSENT_VERSION);
  },

  async save(rec: Omit<ConsentRecord, 'version' | 'at'>): Promise<ConsentRecord> {
    const full: ConsentRecord = { ...rec, version: CONSENT_VERSION, at: new Date().toISOString() };
    await AsyncStorage.setItem(KEY, JSON.stringify(full));
    return full;
  },

  /** Withdraw consent (DPDP right). Telemetry stops immediately. */
  async withdraw(): Promise<void> {
    const c = await this.get();
    const rec: ConsentRecord = {
      version: CONSENT_VERSION, granted: false, at: new Date().toISOString(),
      categories: { identity: false, usage: false, spiritual: false, health: false },
      ...(c ? {} : {}),
    };
    await AsyncStorage.setItem(KEY, JSON.stringify(rec));
  },
};
