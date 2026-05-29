/**
 * notifications — schedule + cancel daily deity prayer reminders.
 *
 * Uses expo-notifications' `DAILY` trigger which fires at the same local
 * wall-clock time every day in the device's timezone (handles DST changes
 * automatically). One scheduled notification per (deity × day-of-week).
 *
 * v47 — custom ringtones:
 *   • Per-deity sound (deity.alarmSoundId) is now PASSED to the schedule
 *     call instead of always being 'default'.
 *   • The four bundled presets (flute, bell, tanpura, om) are listed
 *     under the `expo-notifications` plugin in app.json so prebuild
 *     copies them into android/app/src/main/res/raw/ at build time.
 *     They are referenced by filename WITHOUT extension (e.g. 'flute').
 *   • User-picked custom files (alarmSoundId === 'custom') still fall
 *     back to 'default' for the system notification — Android can't
 *     play an arbitrary runtime URI as a notification sound. The custom
 *     file does play in-app when the user taps the notification.
 *   • To take effect on Android, the APK must be rebuilt after adding
 *     a new preset sound (the file has to land in res/raw at build time).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Deity } from '../types';

// Map the AlarmSoundPicker preset id → the bundled filename WITHOUT
// extension that prebuild will copy into android/app/src/main/res/raw/.
// Anything not in this list (including 'custom' device files) falls
// back to the system default tone.
const PRESET_FILE: Record<string, string> = {
  flute:   'flute',
  bell:    'bell',
  tanpura: 'tanpura',
  om:      'om',
};

const soundForId = (id?: string): string => {
  if (!id) return 'default';
  return PRESET_FILE[id] ?? 'default';
};

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

  const sound = soundForId(deity.alarmSoundId);
  const ids: Record<number, string> = {};
  for (const day of days) {
    // expo-notifications WEEKLY trigger: weekday is 1..7 (1=Sunday)
    const weekday = day + 1; // JS 0..6 → expo 1..7
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: `🪷 ${deity.name} — prayer time`,
          body: deity.mantra ? `"${deity.mantra}"` : 'Time for your sadhana',
          sound,
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

// ─── Routine-item reminders (Plan tab) ────────────────────────────

/**
 * Schedule a recurring reminder for a Plan routine item. Returns the
 * notification IDs keyed by day-of-week so the caller can cancel/update
 * them later (mirrors the deity reminder pattern).
 */
export const scheduleRoutineReminder = async (params: {
  title: string;
  body?: string;
  time: string;                       // 'HH:MM'
  frequency: 'daily' | number[];      // 0..6
  routineId: string;
  /** Optional preset sound id (flute / bell / tanpura / om). Defaults
   *  to the system tone if omitted. */
  soundId?: string;
}): Promise<Record<number, string>> => {
  const { title, body, time, frequency, routineId, soundId } = params;
  const days = frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : frequency;
  const { hour, minute } = parseHHMM(time);
  const sound = soundForId(soundId);

  const ids: Record<number, string> = {};
  for (const day of days) {
    const weekday = day + 1;
    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body: body || 'Your committed practice time',
          sound,
          data: { routineId, type: 'plan-reminder' },
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
      console.warn(`[notifications] routine schedule failed day=${day}:`, e);
    }
  }
  return ids;
};

/** Cancel routine reminders by their stored IDs. */
export const cancelRoutineReminder = async (
  ids?: Record<number, string>
): Promise<void> => {
  if (!ids) return;
  for (const id of Object.values(ids)) {
    try { await Notifications.cancelScheduledNotificationAsync(id); }
    catch { /* ignored */ }
  }
};
