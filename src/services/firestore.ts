/**
 * firestore — thin, typed wrapper around @react-native-firebase/firestore.
 *
 * Purpose
 *   Everything the app writes locally (sessions, sadhana logs, ambient
 *   baselines, preferences) is the source of truth on-device. Firestore is
 *   the remote mirror: a place for the same rows to live so the user can
 *   sign in on a new phone and get their data back. Local writes continue
 *   even when Firebase is unavailable; the sync job replays them later.
 *
 * Shape on the server
 *   /users/{uid}/                        ← one doc per user (profile)
 *   /users/{uid}/sessions/{sessionId}    ← Soul Sync sittings
 *   /users/{uid}/japa_logs/{id}          ← bead counts per day
 *   /users/{uid}/sadhana_goals/{id}      ← Plan Your Wellbeing goals
 *   /users/{uid}/health_baselines/{day}  ← daily ambient roll-up
 *
 * Why thin
 *   The native module's API is already imperative; wrapping it in a class
 *   would hide behaviour callers need to see (snapshot listeners, offline
 *   persistence, batch limits). This module exports helpers for the parts
 *   this codebase actually uses — nothing more.
 *
 * Firestore prerequisites (configured in the Firebase console, once):
 *   1. Build → Firestore Database → "Create database" (pick region close to
 *      user; nam5 for US multi-region, asia-south1 for India)
 *   2. Start in production mode and paste the default rules below:
 *
 *      rules_version = '2';
 *      service cloud.firestore {
 *        match /databases/{db}/documents {
 *          match /users/{uid} {
 *            allow read, write: if request.auth != null && request.auth.uid == uid;
 *            match /{subcol}/{doc=**} {
 *              allow read, write: if request.auth != null && request.auth.uid == uid;
 *            }
 *          }
 *        }
 *      }
 *
 *      This restricts every doc to its owner — what the app actually needs.
 */

import { Platform } from 'react-native';

let firestoreAvailable: boolean | null = null;
let firestoreModule: any = null;

/** Lazy-load @react-native-firebase/firestore. Returns null on web / missing. */
const loadFirestore = async (): Promise<any | null> => {
  if (firestoreAvailable === false) return null;
  if (firestoreModule) return firestoreModule;
  if (Platform.OS === 'web') { firestoreAvailable = false; return null; }
  try {
    const mod = await import('@react-native-firebase/firestore');
    firestoreModule = (mod as any).default || mod;
    firestoreAvailable = true;
    return firestoreModule;
  } catch (e) {
    console.warn('[firestore] module unavailable:', (e as any)?.message?.slice?.(0, 80));
    firestoreAvailable = false;
    return null;
  }
};

/** Whether Firestore is loadable on this build. */
export const isFirestoreAvailable = async (): Promise<boolean> => {
  const m = await loadFirestore();
  return m !== null;
};

/** The `firestore()` instance, or null when unavailable. */
const db = async (): Promise<any | null> => {
  const mod = await loadFirestore();
  if (!mod) return null;
  // `mod` is the default export, callable to get the Firestore instance.
  return typeof mod === 'function' ? mod() : mod;
};

// ─── Reads ─────────────────────────────────────────────────────────

/**
 * Fetch one document by path (e.g. 'users/abc123'). Returns null when the
 * document does not exist or Firestore is unavailable.
 */
export const getDoc = async <T = any>(path: string): Promise<T | null> => {
  const f = await db();
  if (!f) return null;
  try {
    const snap = await f.doc(path).get();
    return snap.exists ? (snap.data() as T) : null;
  } catch (e) {
    console.warn('[firestore] getDoc', path, (e as any)?.message);
    return null;
  }
};

/**
 * Fetch every document in a collection path. Caller is responsible for not
 * using this on collections large enough to care about pagination — for those
 * paths, write a query helper here instead of listing the whole thing.
 */
export const listCollection = async <T = any>(path: string): Promise<T[]> => {
  const f = await db();
  if (!f) return [];
  try {
    const snap = await f.collection(path).get();
    return snap.docs.map((d: any) => ({ id: d.id, ...(d.data() as any) })) as T[];
  } catch (e) {
    console.warn('[firestore] listCollection', path, (e as any)?.message);
    return [];
  }
};

// ─── Writes ────────────────────────────────────────────────────────

/** Create or replace a document. Merges by default so partial writes stay partial. */
export const setDoc = async (
  path: string,
  data: Record<string, any>,
  opts: { merge?: boolean } = { merge: true },
): Promise<boolean> => {
  const f = await db();
  if (!f) return false;
  try {
    await f.doc(path).set(data, opts);
    return true;
  } catch (e) {
    console.warn('[firestore] setDoc', path, (e as any)?.message);
    return false;
  }
};

/** Partial update — does not create the doc if missing. */
export const updateDoc = async (
  path: string,
  data: Record<string, any>,
): Promise<boolean> => {
  const f = await db();
  if (!f) return false;
  try {
    await f.doc(path).update(data);
    return true;
  } catch (e) {
    console.warn('[firestore] updateDoc', path, (e as any)?.message);
    return false;
  }
};

/** Append a document to a collection. Returns the new id. */
export const addToCollection = async (
  path: string,
  data: Record<string, any>,
): Promise<string | null> => {
  const f = await db();
  if (!f) return null;
  try {
    const ref = await f.collection(path).add(data);
    return ref.id;
  } catch (e) {
    console.warn('[firestore] addToCollection', path, (e as any)?.message);
    return null;
  }
};

/** Delete one document. No-op when missing — that is Firestore's behaviour. */
export const deleteDoc = async (path: string): Promise<boolean> => {
  const f = await db();
  if (!f) return false;
  try {
    await f.doc(path).delete();
    return true;
  } catch (e) {
    console.warn('[firestore] deleteDoc', path, (e as any)?.message);
    return false;
  }
};

// ─── Convenience: user-scoped paths ────────────────────────────────

/**
 * Compose a path under the signed-in user's document.
 *
 * `userPath(uid, 'sessions', '2026-11-13T09:00')`
 *   → 'users/<uid>/sessions/2026-11-13T09:00'
 */
export const userPath = (uid: string, ...segments: string[]): string =>
  ['users', uid, ...segments].join('/');

/**
 * Write a timestamped event into a user's subcollection with a server
 * timestamp — the one write pattern most calls want.
 */
export const logEvent = async (
  uid: string,
  collection: string,
  payload: Record<string, any>,
): Promise<string | null> => {
  const mod = await loadFirestore();
  if (!mod) return null;
  const Timestamp = (mod as any).firestore?.FieldValue?.serverTimestamp
    ? (mod as any).firestore.FieldValue.serverTimestamp()
    : new Date().toISOString();
  return addToCollection(userPath(uid, collection), { ...payload, createdAt: Timestamp });
};
