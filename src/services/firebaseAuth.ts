/**
 * firebaseAuth — Firebase-backed authentication for Sadhana.
 *
 * Three sign-in paths supported:
 *   1. Google      — native account picker → Firebase Google credential.
 *                    Best UX for elderly users (one tap).
 *   2. Anonymous   — silent, zero-touch. Used as the default when the
 *                    user "skips" sign-in. Creates a stable Firebase UID
 *                    so we can sync later if they upgrade to Google.
 *   3. Linking     — anonymous → Google upgrade preserves the UID, so
 *                    locally-stored sadhana data stays attached to the
 *                    same Firebase user.
 *
 * Gracefully degrades when:
 *   • Firebase isn't configured (missing google-services.json) — all
 *     methods return null and the app proceeds with local-only state.
 *   • Running on web preview — same behaviour, no crash.
 *
 * Setup (one-time, developer-side):
 *   1. console.firebase.google.com → Create project "Sadhana"
 *   2. Add Android app: package "com.sadhana.app"
 *   3. SHA-1 fingerprint from `eas credentials` (Android)
 *   4. Download google-services.json → place at sadhana-rn/google-services.json
 *   5. Authentication → Sign-in method → enable Google + Anonymous
 *   6. Rebuild APK
 *   No client IDs to copy — Firebase handles it via google-services.json.
 */

import { Platform } from 'react-native';

export interface SignedInUser {
  uid: string;
  email: string | null;
  name: string | null;
  photoUrl: string | null;
  isAnonymous: boolean;
  source: 'google' | 'anonymous' | 'manual';
}

let firebaseAvailable: boolean | null = null;
let modules: any = null;

/** Lazy-load the native modules. Returns null if unavailable. */
const loadModules = async (): Promise<any | null> => {
  if (firebaseAvailable === false) return null;
  if (modules) return modules;
  if (Platform.OS === 'web') {
    firebaseAvailable = false;
    return null;
  }
  try {
    const appMod  = await import('@react-native-firebase/app');
    const authMod = await import('@react-native-firebase/auth');
    const signinMod = await import('@react-native-google-signin/google-signin');
    modules = {
      app: (appMod as any).default || appMod,
      auth: (authMod as any).default || authMod,
      GoogleSignin: (signinMod as any).GoogleSignin || (signinMod as any).default?.GoogleSignin,
    };
    firebaseAvailable = true;
    return modules;
  } catch (e) {
    console.warn('[firebaseAuth] modules unavailable:', (e as any)?.message?.slice?.(0, 80));
    firebaseAvailable = false;
    return null;
  }
};

/** Whether Firebase Auth is available and configured on this build. */
export const isFirebaseAvailable = async (): Promise<boolean> => {
  const m = await loadModules();
  return m !== null;
};

/**
 * Initialise Google Sign-In with Firebase's web client ID (read from
 * google-services.json automatically — no manual webClientId needed).
 * Safe to call multiple times.
 */
let googleConfigured = false;
const configureGoogle = async (): Promise<boolean> => {
  const m = await loadModules();
  if (!m) return false;
  if (googleConfigured) return true;
  try {
    // 'autoDetect' makes Google Sign-In read R.string.default_web_client_id,
    // the resource the com.google.gms.google-services Gradle plugin emits
    // from google-services.json (the client_type:3 web OAuth client). The
    // previous code read app().options.webClientId — a field that is
    // undefined on Android — so no idToken was ever returned and sign-in
    // failed silently.
    if (m.GoogleSignin) {
      m.GoogleSignin.configure({
        webClientId: 'autoDetect',
        offlineAccess: false,
        scopes: ['profile', 'email'],
      });
      googleConfigured = true;
    }
    return true;
  } catch (e) {
    console.warn('[firebaseAuth] configureGoogle failed:', (e as any)?.message);
    return false;
  }
};

/**
 * Get the currently-signed-in user (across app restarts). Returns null
 * if nobody is signed in or Firebase isn't available.
 */
export const getCurrentUser = async (): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m) return null;
  try {
    const u = m.auth().currentUser;
    if (!u) return null;
    return {
      uid: u.uid,
      email: u.email,
      name: u.displayName,
      photoUrl: u.photoURL,
      isAnonymous: u.isAnonymous,
      source: u.isAnonymous ? 'anonymous' : (u.providerData?.[0]?.providerId === 'google.com' ? 'google' : 'manual'),
    };
  } catch {
    return null;
  }
};

/**
 * Sign in (or link) with Google via the native Android account picker.
 * If the user is already signed in anonymously, this LINKS the Google
 * account to that anonymous UID — preserving local data continuity.
 */
export const signInWithGoogle = async (): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m || !m.GoogleSignin) return null;
  if (!(await configureGoogle())) return null;

  try {
    await m.GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await m.GoogleSignin.signIn();
    const payload = result?.data ?? result;
    const idToken = payload?.idToken;
    // v67: surface the real reason rather than a silent null. A missing
    // idToken after a successful account pick almost always means the
    // web client id / SHA-1 isn't wired — throw so the UI can show it.
    if (!idToken) {
      throw new Error('No idToken from Google — check webClientId (default_web_client_id) and the SHA-1 registered in Firebase.');
    }

    const credential = m.auth.GoogleAuthProvider.credential(idToken);

    // If already signed in anonymously, LINK to preserve UID/local data
    const current = m.auth().currentUser;
    let userCred: any;
    if (current?.isAnonymous) {
      try {
        userCred = await current.linkWithCredential(credential);
      } catch (e: any) {
        // 'auth/credential-already-in-use' = user picked an account that
        // already has a different Firebase UID. Fall back to plain sign-in
        // (loses the anonymous UID — acceptable for first-time onboarding).
        if (e?.code === 'auth/credential-already-in-use') {
          userCred = await m.auth().signInWithCredential(credential);
        } else {
          throw e;
        }
      }
    } else {
      userCred = await m.auth().signInWithCredential(credential);
    }

    const u = userCred.user;
    return {
      uid: u.uid,
      email: u.email,
      name: u.displayName,
      photoUrl: u.photoURL,
      isAnonymous: u.isAnonymous,
      source: 'google',
    };
  } catch (e: any) {
    // User cancelled — not an error, return null quietly.
    if (e?.code === 'SIGN_IN_CANCELLED' || e?.code === '12501' || e?.code === '-5') return null;
    // v67: re-throw real failures so the onboarding screen can show the
    // actual code (e.g. DEVELOPER_ERROR / 10 = SHA-1 mismatch) instead of
    // a generic "not available". Tag the code into the message.
    const code = e?.code ? ` [${e.code}]` : '';
    console.warn('[firebaseAuth] Google sign-in failed:', e?.code, e?.message);
    throw new Error(`${e?.message || 'Google sign-in failed'}${code}`);
  }
};

/**
 * Silent anonymous sign-in. Creates a stable Firebase UID without
 * any user interaction. Used when the user "skips" the Google flow.
 */
export const signInAnonymously = async (): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m) return null;
  try {
    const current = m.auth().currentUser;
    if (current) {
      return {
        uid: current.uid, email: current.email,
        name: current.displayName, photoUrl: current.photoURL,
        isAnonymous: current.isAnonymous,
        source: current.isAnonymous ? 'anonymous' : 'google',
      };
    }
    const userCred = await m.auth().signInAnonymously();
    const u = userCred.user;
    return {
      uid: u.uid, email: null, name: null, photoUrl: null,
      isAnonymous: true, source: 'anonymous',
    };
  } catch (e) {
    console.warn('[firebaseAuth] anonymous sign-in failed:', (e as any)?.message);
    return null;
  }
};

/** Sign out (both Firebase + Google). */
export const signOut = async (): Promise<void> => {
  const m = await loadModules();
  if (!m) return;
  try {
    if (m.GoogleSignin && (await m.GoogleSignin.getCurrentUser())) {
      await m.GoogleSignin.signOut();
    }
    await m.auth().signOut();
  } catch { /* ignore */ }
};
