/**
 * otpClient — calls the Soulsync OTP backend (Cloudflare Worker).
 *
 * Gracefully falls back to "demo mode" (returns a known OTP) if no backend
 * URL is configured — keeps development unblocked while the worker is set up.
 *
 * Configure via app.json → expo.extra.OTP_BACKEND_URL  or  Settings UI.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

const STORAGE_KEY = 'soulsync.otpBackendUrl';

const fromConstants = (): string | undefined => {
  const extra = (Constants?.expoConfig?.extra ?? Constants?.manifest?.extra) as any;
  return extra?.OTP_BACKEND_URL;
};

export const otpClient = {
  async getBackendUrl(): Promise<string | null> {
    const stored = await AsyncStorage.getItem(STORAGE_KEY);
    return stored || fromConstants() || null;
  },

  async setBackendUrl(url: string): Promise<void> {
    if (!url.trim()) await AsyncStorage.removeItem(STORAGE_KEY);
    else            await AsyncStorage.setItem(STORAGE_KEY, url.trim());
  },

  /**
   * Send an OTP. Returns the demo code when running in mock mode so the
   * OnboardingScreen can still display "Demo OTP: NNNNNN" UX.
   */
  async send(contact: string, type: 'email' | 'phone'):
    Promise<{ sent: true; demoOtp?: string; expiresAt?: string } | { sent: false; error: string }> {
    const url = await this.getBackendUrl();
    if (!url) {
      // Mock mode — return a deterministic OTP that the OnboardingScreen
      // can display on-screen (preserves current dev UX).
      const otp = String(Math.floor(100_000 + Math.random() * 900_000));
      return { sent: true, demoOtp: otp };
    }
    try {
      const resp = await fetch(`${url}/api/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, type }),
      });
      if (!resp.ok) {
        const body = await resp.text().catch(() => '');
        return { sent: false, error: `HTTP ${resp.status}: ${body.slice(0, 100)}` };
      }
      const j = await resp.json();
      return { sent: true, expiresAt: j.expiresAt };
    } catch (e: any) {
      return { sent: false, error: e?.message ?? 'network_error' };
    }
  },

  async verify(contact: string, otp: string, expectedDemoOtp?: string):
    Promise<{ verified: true; token?: string } | { verified: false; reason: string }> {
    const url = await this.getBackendUrl();
    if (!url) {
      // Mock mode — compare against the demoOtp the OnboardingScreen holds
      if (expectedDemoOtp && otp.trim() === expectedDemoOtp) {
        return { verified: true };
      }
      return { verified: false, reason: 'mismatch' };
    }
    try {
      const resp = await fetch(`${url}/api/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, otp: otp.trim() }),
      });
      const j = await resp.json();
      if (resp.ok && j.verified) return { verified: true, token: j.token };
      return { verified: false, reason: j.reason ?? `http_${resp.status}` };
    } catch (e: any) {
      return { verified: false, reason: e?.message ?? 'network_error' };
    }
  },
};
