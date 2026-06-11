/**
 * notifications — schedule + cancel daily deity prayer reminders.
 *
 * Uses expo-notifications' `WEEKLY` trigger which fires at the same local
 * wall-clock time every week-day in the device's timezone (handles DST
 * automatically). One scheduled notification per (deity × day-of-week).
 *
 * v56 — per-tone channels (the real fix):
 *   Android 8+ caches the notification SOUND on the channel at creation
 *   time.  Passing `sound: 'flute'` on `scheduleNotificationAsync()` is
 *   ignored if the channel was created with `sound: 'default'` — Android
 *   plays whatever the channel says.  Setting the channel sound only
 *   ever once means every reminder plays the same tone forever.
 *
 *   Fix: create FIVE channels at app start — one per preset tone (flute,
 *   bell, tanpura, om) + one default fallback.  When scheduling, route
 *   the notification to the channelId that matches the user's picked
 *   `alarmSoundId`.  The per-notification `sound` field is still set
 *   too — iOS doesn't have channels and sounds notifications individually.
 *
 *   For an existing install whose old `prayer-reminders` channel was
 *   already created with `sound: 'default'`, we delete that legacy
 *   channel inside initNotifications() so the new per-tone channels
 *   take over.
 *
 *   The four preset mp3s (flute, bell, tanpura, om) must be bundled in
 *   android/app/src/main/res/raw/ at build time — handled by the
 *   `expo-notifications` plugin config in app.json.
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { Deity } from '../types';

// Map AlarmSoundPicker preset id → resource filename WITHOUT extension
// that prebuild placed in android/app/src/main/res/raw/.
const PRESET_FILE: Record<string, string> = {
  flute:   'flute',
  bell:    'bell',
  tanpura: 'tanpura',
  om:      'om',
};

/** Returns the bundled filename (without extension) for the picker id,
 *  or 'default' for unknown / custom file ids. */
const soundForId = (id?: string): string => {
  if (!id) return 'default';
  return PRESET_FILE[id] ?? 'default';
};

/** Resolves a preset id → the matching Android channel id.  Each tone
 *  has its OWN channel because Android caches channel sound at creation
 *  and can't change it afterwards. */
const channelForId = (id?: string): string => {
  const file = soundForId(id);
  if (file === 'default') return 'prayer-reminders-default';
  return `prayer-reminders-${file}`;
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

/** Call once at app launch to make sure all the Android channels exist.
 *  Each tone preset gets its OWN channel because Android 8+ locks the
 *  sound to the channel at creation time. */
export const initNotifications = async (): Promise<void> => {
  if (Platform.OS !== 'android') return;

  // ── v56 migration: nuke the legacy 'prayer-reminders' channel so the
  //    new per-tone channels can take over.  Idempotent — Android just
  //    no-ops if the channel doesn't exist. ──
  try { await Notifications.deleteNotificationChannelAsync('prayer-reminders'); } catch { /* */ }

  const common = {
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250] as number[],
    lightColor: '#FFB800',
    showBadge: true,
    enableVibrate: true,
    enableLights: true,
  };

  // Default tone (system notification)
  await Notifications.setNotificationChannelAsync('prayer-reminders-default', {
    ...common,
    name: 'Prayer Reminders · Default',
    sound: 'default',
  });

  // One channel per preset — channel id encodes the sound
  for (const file of Object.values(PRESET_FILE)) {
    await Notifications.setNotificationChannelAsync(`prayer-reminders-${file}`, {
      ...common,
      name: `Prayer Reminders · ${file.charAt(0).toUpperCase()}${file.slice(1)}`,
      // Bundled .mp3 → reference WITHOUT extension. Must exist in
      // android/app/src/main/res/raw/<file>.mp3 at build time.
      sound: file,
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
 * Schedule one WEEKLY notification per day-of-week for this deity at
 * the given prayer time. Returns an object of { dayOfWeek: notificationId }
 * that you should persist back onto the Deity for later cancellation.
 *
 * Day-of-week encoding follows JS conventions: 0 = Sunday … 6 = Saturday.
 * expo-notifications WEEKLY trigger uses 1-7 (1 = Sunday).
 */
export const scheduleDeityReminders = async (
  deity: Deity
): Promise<Record<number, string>> => {
  if (!deity.alarmOn) return {};
  const days = (deity.repeatDays && deity.repeatDays.length > 0)
    ? deity.repeatDays
    : [0, 1, 2, 3, 4, 5, 6];
  const { hour, minute } = parseHHMM(deity.prayerAlarm);

  const sound     = soundForId(deity.alarmSoundId);
  const channelId = channelForId(deity.alarmSoundId);

  const ids: Record<number, string> = {};
  for (const day of days) {
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
          channelId,
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
  const sound     = soundForId(soundId);
  const channelId = channelForId(soundId);
  // v59: log the routing so we can see exactly what Android will use
  // when the reminder fires. Helps debug "ringtones not playing" reports.
  console.log(
    `[notifications] scheduleRoutineReminder routineId=${routineId} ` +
    `soundId=${soundId || 'default'} → sound=${sound} channelId=${channelId} time=${time}`
  );

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
          channelId,
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

// ─── Test fire helper (for the tone preview button) ────────────────

/**
 * Fire an immediate test notification with the picked tone — used by
 * the "Preview" button in the AlarmSoundPicker so the user can hear
 * what each tone sounds like without waiting for a scheduled fire.
 *
 * The notification appears INSIDE the foreground app handler too
 * (shouldPlaySound:true above) so users can preview while inside the
 * settings sheet.
 */
export const previewTone = async (soundId?: string): Promise<void> => {
  const sound     = soundForId(soundId);
  const channelId = channelForId(soundId);
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '🔔 Tone preview',
        body: `Playing "${soundId || 'default'}" — this is what your reminder will sound like.`,
        sound,
        data: { type: 'tone-preview' },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 1,
        channelId,
      } as any,
    });
  } catch (e) {
    console.warn('[notifications] preview failed:', e);
  }
};
