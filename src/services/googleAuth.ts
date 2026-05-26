/**
 * googleAuth — one-tap Google account picker for onboarding.
 *
 * Elderly-friendly UX: opens the Android system account picker (no typing,
 * no OTP, no password). Returns the user's verified email + display name.
 *
 * Setup (one-time, developer-side):
 *   1. console.cloud.google.com → create project (or reuse one)
 *   2. APIs & Services → Credentials → Create OAuth 2.0 Client ID
 *      • Type: Android — package name "com.sadhana.app" + SHA-1 from EAS
 *      • Type: Web      — used as `webClientId` below
 *   3. Set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in .env (or app.json `extra`)
 *   4. Rebuild APK (needed — not Expo Go compatible)
 *
 * Without webClientId, the service falls back to a "manual entry" mode so
 * the rest of the app keeps working in dev/web preview.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';

export interface GoogleUser {
  email: string;
  name: string;
  photoUrl?: string;
  /** ID token — server-side verifiable proof of email ownership. */
  idToken?: string;
  /** Source: 'google' = real sign-in, 'manual' = fallback typed entry. */
  source: 'google' | 'manual';
}

const WEB_CLIENT_ID: string | undefined =
  (Constants.expoConfig?.extra as any)?.googleWebClientId ??
  (process.env as any)?.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ??
  undefined;

let configured = false;

/**
 * Lazy-import the native module. Falls back to null if unavailable (web,
 * Expo Go, missing config). Caller should treat null as "feature not
 * supported on this platform — show manual entry instead".
 */
const getModule = async (): Promise<any | null> => {
  if (Platform.OS === 'web') return null;
  if (!WEB_CLIENT_ID) return null;
  try {
    const mod = await import('@react-native-google-signin/google-signin');
    const GoogleSignin = (mod as any).GoogleSignin || (mod as any).default?.GoogleSignin;
    if (!GoogleSignin) return null;
    if (!configured) {
      GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
        offlineAccess: false,
        scopes: ['profile', 'email'],
      });
      configured = true;
    }
    return GoogleSignin;
  } catch (e) {
    console.warn('[googleAuth] module unavailable:', (e as any)?.message?.slice?.(0, 80));
    return null;
  }
};

/** Whether real Google Sign-In is wired up on this build. */
export const isGoogleAuthAvailable = async (): Promise<boolean> => {
  const m = await getModule();
  return m !== null;
};

/**
 * Open the native account picker. Returns the picked user, or null if
 * cancelled / unsupported (caller should show manual entry).
 */
export const signInWithGoogle = async (): Promise<GoogleUser | null> => {
  const GoogleSignin = await getModule();
  if (!GoogleSignin) return null;

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    // SDK v13+ returns { data: { user: {...}, idToken } }; earlier returns
    // { user: {...}, idToken } directly. Normalise both.
    const payload = result?.data ?? result;
    const u = payload?.user ?? {};
    if (!u.email) return null;
    return {
      email: u.email,
      name: u.name || u.email.split('@')[0],
      photoUrl: u.photo || undefined,
      idToken: payload.idToken,
      source: 'google',
    };
  } catch (e: any) {
    // statusCode 12501 = SIGN_IN_CANCELLED — user backed out, not an error
    if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '12501') return null;
    console.warn('[googleAuth] sign-in failed:', e?.message);
    return null;
  }
};

/** Best-effort sign-out (clears the cached session). */
export const signOutGoogle = async (): Promise<void> => {
  const GoogleSignin = await getModule();
  if (!GoogleSignin) return;
  try { await GoogleSignin.signOut(); } catch { /* ignore */ }
};
