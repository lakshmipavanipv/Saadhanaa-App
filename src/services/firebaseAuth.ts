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
    // The OAuth WEB client id (client_type:3) from google-services.json for
    // the body-and-soul-ring Firebase project. Hardcoded because the
    // 'autoDetect' string isn't reliably supported across @react-native-
    // google-signin versions — when unsupported it gets passed verbatim as
    // the web client id, which causes DEVELOPER_ERROR right after the
    // account picker. This value is embedded in the APK anyway (it's the
    // generated default_web_client_id resource), so it isn't a secret.
    const WEB_CLIENT_ID =
      '283536111171-6e2fs7u0f1t9rc6l56rqugufnsiga9kc.apps.googleusercontent.com';
    if (m.GoogleSignin) {
      m.GoogleSignin.configure({
        webClientId: WEB_CLIENT_ID,
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
 * Get the current user's Firebase ID token (JWT) for authenticating requests
 * to our own backend. Returns null if not signed in / unavailable. The backend
 * verifies this with the Firebase Admin SDK.
 */
export const getIdToken = async (): Promise<string | null> => {
  const m = await loadModules();
  if (!m) return null;
  try {
    const u = m.auth().currentUser;
    if (!u) return null;
    return await u.getIdToken();
  } catch {
    return null;
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

// ─── Email / password ───────────────────────────────────────────────

const toSignedInUser = (u: any, source: SignedInUser['source']): SignedInUser => ({
  uid: u.uid,
  email: u.email ?? null,
  name: u.displayName ?? null,
  photoUrl: u.photoURL ?? null,
  isAnonymous: !!u.isAnonymous,
  source,
});

/**
 * Create a new account with email + password.
 *
 * If the user is currently signed in anonymously, their anonymous UID is
 * preserved by LINKING the email credential onto it — so any sadhana data
 * written while they were anonymous stays attached to the same Firebase user.
 *
 * Common error codes surfaced verbatim so the UI can translate them:
 *   'auth/email-already-in-use'    → call signInWithEmail instead
 *   'auth/weak-password'           → Firebase minimum is 6 chars
 *   'auth/invalid-email'           → client-side validation didn't catch it
 */
export const signUpWithEmail = async (
  email: string,
  password: string,
  displayName?: string,
): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m) return null;
  const e = email.trim();
  try {
    const current = m.auth().currentUser;
    let userCred: any;

    if (current?.isAnonymous) {
      const credential = m.auth.EmailAuthProvider.credential(e, password);
      try {
        userCred = await current.linkWithCredential(credential);
      } catch (err: any) {
        // Someone already owns this email. Sign them in plainly (they lose the
        // anon UID — acceptable; their locally-stored data stays on device and
        // the migrator can lift it onto the new UID later).
        if (err?.code === 'auth/credential-already-in-use' ||
            err?.code === 'auth/email-already-in-use') {
          userCred = await m.auth().signInWithEmailAndPassword(e, password);
        } else {
          throw err;
        }
      }
    } else {
      userCred = await m.auth().createUserWithEmailAndPassword(e, password);
    }

    if (displayName && userCred.user?.updateProfile) {
      try { await userCred.user.updateProfile({ displayName }); } catch { /* non-fatal */ }
    }
    return toSignedInUser(userCred.user, 'manual');
  } catch (err: any) {
    console.warn('[firebaseAuth] signUpWithEmail failed:', err?.code, err?.message);
    throw err;
  }
};

/** Sign in to an existing email+password account. */
export const signInWithEmail = async (
  email: string,
  password: string,
): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m) return null;
  try {
    const userCred = await m.auth().signInWithEmailAndPassword(email.trim(), password);
    return toSignedInUser(userCred.user, 'manual');
  } catch (err: any) {
    console.warn('[firebaseAuth] signInWithEmail failed:', err?.code, err?.message);
    throw err;
  }
};

/** Send a password-reset email. Firebase handles the email itself. */
export const sendPasswordReset = async (email: string): Promise<boolean> => {
  const m = await loadModules();
  if (!m) return false;
  try {
    await m.auth().sendPasswordResetEmail(email.trim());
    return true;
  } catch (err: any) {
    console.warn('[firebaseAuth] sendPasswordReset failed:', err?.code, err?.message);
    throw err;
  }
};

// ─── Phone (OTP) ────────────────────────────────────────────────────

/**
 * A pending phone sign-in: hand this back to `confirmPhoneCode` with the
 * OTP the user typed to complete the flow. The object is opaque from the
 * caller's side; it carries the Firebase confirmation reference internally.
 */
export interface PhoneConfirmation {
  /** Internal — do not rely on this field's shape. */
  _confirmation: any;
}

/**
 * Start a phone number sign-in. Sends an SMS with a one-time code to the
 * number (E.164 format, e.g. "+91XXXXXXXXXX"). The returned confirmation
 * must be held in state and passed to `confirmPhoneCode`.
 *
 * Firebase Phone Auth prerequisites — must be configured ONCE in Firebase:
 *   1. Authentication → Sign-in method → enable "Phone"
 *   2. Project settings → Cloud Messaging → an APNs key (iOS) and
 *      SHA-1/SHA-256 (Android) registered so the ReCAPTCHA / Play Integrity
 *      check can run.
 *
 * In development, numbers on the Firebase console's "Phone numbers for
 * testing" list bypass the real SMS and accept a fixed code.
 */
export const sendPhoneVerification = async (
  phoneE164: string,
): Promise<PhoneConfirmation | null> => {
  const m = await loadModules();
  if (!m) return null;
  try {
    const confirmation = await m.auth().signInWithPhoneNumber(phoneE164.trim());
    return { _confirmation: confirmation };
  } catch (err: any) {
    console.warn('[firebaseAuth] sendPhoneVerification failed:', err?.code, err?.message);
    throw err;
  }
};

/**
 * Finish a phone sign-in by confirming the SMS code.
 *
 * If an anonymous user is currently signed in, the phone credential is
 * LINKED onto them so their anonymous UID is preserved. Otherwise a new
 * account is created on the phone number.
 */
export const confirmPhoneCode = async (
  pending: PhoneConfirmation,
  code: string,
): Promise<SignedInUser | null> => {
  const m = await loadModules();
  if (!m || !pending?._confirmation) return null;

  const trimmed = code.trim();
  try {
    const current = m.auth().currentUser;

    // The confirmation object has `.confirm(code)` which both verifies and
    // signs in. For the "link onto anonymous" path we need a Credential
    // explicitly, which the confirmation also carries internally.
    if (current?.isAnonymous && pending._confirmation.verificationId) {
      const credential = m.auth.PhoneAuthProvider.credential(
        pending._confirmation.verificationId,
        trimmed,
      );
      try {
        const userCred = await current.linkWithCredential(credential);
        return toSignedInUser(userCred.user, 'manual');
      } catch (err: any) {
        if (err?.code === 'auth/credential-already-in-use') {
          const userCred = await m.auth().signInWithCredential(credential);
          return toSignedInUser(userCred.user, 'manual');
        }
        throw err;
      }
    }

    // Normal path — the confirmation object handles both verify and sign-in.
    const userCred = await pending._confirmation.confirm(trimmed);
    return toSignedInUser(userCred.user, 'manual');
  } catch (err: any) {
    console.warn('[firebaseAuth] confirmPhoneCode failed:', err?.code, err?.message);
    throw err;
  }
};
