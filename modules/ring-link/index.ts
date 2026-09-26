import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

/**
 * Native handle on the Android foreground service that keeps the ring linked
 * while the app is closed.
 *
 * `requireOptionalNativeModule` rather than the throwing version: this module
 * is Android-only and is not present in Expo Go, and a missing service must
 * degrade to "the ring only stays connected while the app is open" rather
 * than to a white screen.
 */
interface RingLinkNative {
  start(): boolean;
  stop(): boolean;
  isRunning(): boolean;
}

const native = requireOptionalNativeModule<RingLinkNative>('RingLink');

/** True when the foreground service is available on this build/platform. */
export const isRingServiceAvailable = (): boolean =>
  Platform.OS === 'android' && native != null;

/**
 * Keep the app's process alive so the ring stays connected in the background,
 * and mark that it should come back after a phone restart.
 */
export const startRingService = (): boolean => {
  try {
    return native?.start() ?? false;
  } catch {
    return false;
  }
};

/** Stop holding the process open, and stop restarting after boot. */
export const stopRingService = (): boolean => {
  try {
    return native?.stop() ?? false;
  } catch {
    return false;
  }
};

export const isRingServiceRunning = (): boolean => {
  try {
    return native?.isRunning() ?? false;
  } catch {
    return false;
  }
};
