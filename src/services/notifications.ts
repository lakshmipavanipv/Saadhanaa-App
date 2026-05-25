/**
 * notifications — schedule + cancel daily deity prayer reminders.
 *
 * Uses expo-notifications' `DAILY` trigger which fires at the same local
 * wall-clock time every day in the device's timezone (handles DST changes
 * automatically). One scheduled notification per (deity × day-of-week).
 *
 * Custom sounds: Android only supports notification sounds bundled at
 * BUILD time (placed in android/app/src/main/res/raw). At runtime we can
 * select the default sound or one of a pre-bundled set. For the user-picked
 * custom file, the notification will use the default sound — the custom
 * audio still plays inside the app when the user taps the notification.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Deity } from '../types';

// ─── One-time app setup ────────────────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Call once at app launch to make sure the Android channel exists. */
export const initNotifications = async (): Promise<void> => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('prayer-reminders', {
      name: 'Prayer Reminders',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FFB800',
      sound: 'default',
    });
  }
};

export const requestNotificationPermission = async (): Promise<boolean> => {
  const settings = await Notifications.getPermissionsAsync();
  if (settings.granted) return true;
  if (settings.canAskAgain === false) return false;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
};

// ─── Scheduling helpers ────────────────────────────────────────────

const parseHHMM = (s: string): { hour: number; minute: number } => {
  const [hStr = '6', mStr = '0'] = (s || '').split(':');
  const hour = Math.max(0, Math.min(23, parseInt(hStr, 10) || 0));
  const minute = Math.max(0, Math.min(59, parseInt(mStr, 10) || 0));
  return { hour, minute };
};

/**
 * Cancel all existing reminders for a deity. Idempotent — safe to call
 * even if `notificationIds` is missing.
 */
export const cancelDeityReminders = async (deity: Deity): Promise<void> => {
  const ids = deity.notificationIds;
  if (!ids) return;
  for (const id of Object.values(ids)) {
    try { await Notifications.cancelScheduledNotificationAsync(id); }
    catch { /* already cancelled — ignore */ }
  }
};

/**
 * Schedule one DAILY notification per day-of-week for this deity at the
 * given prayer time. Returns an object of { dayOfWeek: notificationId }
 * that you should persist back onto the Deity for later cancellation.
 *
 * Day-of-week encoding follows JS conventions: 0 = Sunday, 1 = Monday, …, 6 = Saturday.
 * expo-notifications WEEKLY trigger uses 1-7 (1=Sunday in iOS, 1=Monday in Android),
 * so we use DAILY + filter at fire time via a 'weekday' check is impossible.
 * Instead we use the WEEKLY trigger with the correct day index.
 */
export const scheduleDeityReminders = async (
  deity: Deity
): Promise<Record<number, string>> => {
  if (!deity.alarmOn) return {};
  const days = (deity.repeatDays && deity.repeatDays.length > 0)
    ? deity.repeatDays
    : [0, 1, 2, 3, 4, 5, 6];
  const { hour, minute } = parseHHMM(deity.prayerAlarm);

  const ids: Record<number, string> = {};
  for (const day of days) {
    // expo-notifications WEEKLY trigger: weekday is 1..7 (1=Sunday)
    const weekday = day + 1; // JS 0..6 → expo 1..7
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🪷 ${deity.name} — prayer time`,
          body: deity.mantra ? `"${deity.mantra}"` : 'Time for your sadhana',
          sound: 'default',
          data: { deityId: deity.id, type: 'prayer-reminder' },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
          weekday,
          hour,
          minute,
          channelId: 'prayer-reminders',
        } as any,
      });
      ids[day] = id;
    } catch (e) {
      console.warn(`[notifications] failed to schedule ${deity.name} day=${day}:`, e);
    }
  }
  return ids;
};

/**
 * Convenience: cancel old, schedule new, return the patch to apply.
 */
export const rescheduleDeityReminders = async (
  deity: Deity
): Promise<Partial<Deity>> => {
  await cancelDeityReminders(deity);
  if (!deity.alarmOn) return { notificationIds: undefined };
  const granted = await requestNotificationPermission();
  if (!granted) return { notificationIds: undefined };
  const ids = await scheduleDeityReminders(deity);
  return { notificationIds: ids };
};
