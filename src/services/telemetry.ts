/**
 * telemetry — sends consented data to our own backend (api.velvue.in).
 *
 * Hard gates (privacy-first):
 *   • does nothing if no API_BASE_URL is configured (extra.API_BASE_URL),
 *   • does nothing unless the user has GRANTED consent (consentRepo),
 *   • health data is sent ONLY if the health category was opted in,
 *   • every request carries the Firebase ID token; the server verifies it.
 *
 * All calls are best-effort and never throw into the UI.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getIdToken } from './firebaseAuth';
import { consentRepo } from './consentRepo';

const baseUrl = (): string | null => {
  const extra = (Constants?.expoConfig?.extra ?? (Constants as any)?.manifest?.extra) as any;
  const u = extra?.API_BASE_URL;
  return typeof u === 'string' && u.startsWith('http') ? u.replace(/\/$/, '') : null;
};

const post = async (path: string, body: any): Promise<boolean> => {
  const url = baseUrl();
  if (!url) return false;
  try {
    const token = await getIdToken();
    if (!token) return false;
    const res = await fetch(`${url}/v1${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch { return false; }
};

const consentAllows = async (category?: 'identity' | 'usage' | 'spiritual' | 'health'): Promise<boolean> => {
  const c = await consentRepo.get();
  if (!c || !c.granted) return false;
  if (!category) return true;
  return !!c.categories[category];
};

export const telemetry = {
  /** Push the latest consent record to the server (audit trail). */
  async syncConsent(): Promise<void> {
    const c = await consentRepo.get();
    if (!c) return;
    await post('/consent', { version: c.version, granted: c.granted, categories: c.categories });
  },

  /** Upsert the user profile on login / app open. */
  async profile(p: { name?: string; phone?: string; signInMethod?: string }): Promise<void> {
    if (!(await consentAllows('identity'))) return;
    await post('/profile', {
      ...p,
      deviceModel: `${Platform.OS} ${Platform.Version}`,
      appVersion: (Constants?.expoConfig as any)?.version,
    });
  },

  /** Queue-free batch of usage events (screen views, feature use, AI adoption…). */
  async events(events: { type: string; payload?: any; clientTs?: string }[]): Promise<void> {
    if (!(await consentAllows('usage')) || events.length === 0) return;
    await post('/events', { events });
  },

  /** Single usage event convenience. */
  async event(type: string, payload?: any): Promise<void> {
    await this.events([{ type, payload, clientTs: new Date().toISOString() }]);
  },

  /** Daily health aggregate — only sent if the health category was opted in. */
  async health(day: string, vitals: {
    bpm?: number; hrv?: number; spo2?: number; steps?: number;
    calories?: number; sleepMin?: number; sadhanaMin?: number; workoutMin?: number;
  }): Promise<void> {
    if (!(await consentAllows('health'))) return;
    await post('/health', { day, ...vitals });
  },

  /** Japa log (deity + counts). */
  async japa(log: { deity?: string; japas?: number; malas?: number; day?: string }): Promise<void> {
    if (!(await consentAllows('spiritual'))) return;
    await post('/japa', log);
  },
};
