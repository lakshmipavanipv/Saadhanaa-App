/**
 * location — get the user's latitude / longitude (for sunrise, sunset, and
 * panchang calculations) and timezone (for displaying times correctly).
 *
 * Falls back gracefully:
 *   1. Cached location from AsyncStorage
 *   2. Live GPS via expo-location (with permission)
 *   3. Hardcoded default (Mumbai 19.07, 72.87) so the app never breaks
 */

import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'soulsync.location.v1';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;   // 12 h — location doesn't change often

export interface UserLocation {
  lat: number;
  lng: number;
  /** IANA timezone name, e.g. "Asia/Kolkata". */
  tz: string;
  /** Display label (city/region). May be empty if reverse-geocode failed. */
  label: string;
  /** Source of this fix. */
  source: 'gps' | 'cached' | 'default';
  /** Epoch ms when we fetched it. */
  fetchedAt: number;
}

/** Hardcoded Mumbai fallback so panchang/sunrise still work if GPS denied. */
const DEFAULT_LOCATION: UserLocation = {
  lat: 19.0760, lng: 72.8777,
  tz: 'Asia/Kolkata', label: 'Mumbai (default)',
  source: 'default', fetchedAt: 0,
};

const deviceTimezone = (): string => {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
  catch { return 'UTC'; }
};

/**
 * Get the user's location. Cached entries returned immediately; a fresh GPS
 * fix is requested in the background if the cache is stale.
 */
export const getUserLocation = async (
  opts: { forceFresh?: boolean } = {}
): Promise<UserLocation> => {
  // 1. Try cache first
  if (!opts.forceFresh) {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const cached: UserLocation = JSON.parse(raw);
        if (Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
          return cached;
        }
      }
    } catch { /* fall through */ }
  }

  // 2. Try GPS
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      // Permission denied — use default with device TZ
      const fallback: UserLocation = { ...DEFAULT_LOCATION, tz: deviceTimezone(), fetchedAt: Date.now() };
      return fallback;
    }
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    let label = '';
    try {
      const places = await Location.reverseGeocodeAsync({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
      const p = places[0];
      if (p) label = [p.city || p.subregion, p.region].filter(Boolean).join(', ');
    } catch { /* reverse-geocode failure isn't fatal */ }

    const loc: UserLocation = {
      lat: pos.coords.latitude,
      lng: pos.coords.longitude,
      tz: deviceTimezone(),
      label,
      source: 'gps',
      fetchedAt: Date.now(),
    };
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(loc)).catch(() => {});
    return loc;
  } catch (e) {
    return { ...DEFAULT_LOCATION, tz: deviceTimezone(), fetchedAt: Date.now() };
  }
};

/** Sync read of cached value — for non-async UI paths. */
export const cachedLocationSync = (): UserLocation | null => null;   // placeholder — UI should call getUserLocation()

/** Get just the IANA timezone name (always returns a value). */
export const getTimezone = (): string => deviceTimezone();
