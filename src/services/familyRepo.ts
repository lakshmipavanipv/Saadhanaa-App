/**
 * familyRepo — CRUD for FamilyMember records.
 *
 * Two input modes:
 *   • inputMode='date'  — convert (death date + time + death location)
 *     to lunar tithi via VedAstro, then compute the next Gregorian
 *     occurrence at the USER'S current location.
 *   • inputMode='tithi' — user supplied the tithi directly, skip the
 *     conversion. We still compute next Gregorian occurrence.
 *
 * Saves to AsyncStorage. Schedules a yearly notification on the
 * computed shraddha date.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { FamilyMember } from '../types';
import { getPanchang, findNextTithiOccurrence } from './panchang';
import { UserLocation } from './location';
import * as Notifications from 'expo-notifications';

const KEY = 'soulsync.family.v1';
const NOTIF_KEY_PREFIX = 'soulsync.family.notif.';

const load = async (): Promise<FamilyMember[]> => {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FamilyMember[]) : [];
  } catch {
    return [];
  }
};

const save = async (arr: FamilyMember[]): Promise<void> => {
  await AsyncStorage.setItem(KEY, JSON.stringify(arr));
};

/** Cancel a previously-scheduled shraddha notification for this member. */
const cancelNotif = async (memberId: string): Promise<void> => {
  try {
    const id = await AsyncStorage.getItem(NOTIF_KEY_PREFIX + memberId);
    if (id) {
      await Notifications.cancelScheduledNotificationAsync(id).catch(() => {});
      await AsyncStorage.removeItem(NOTIF_KEY_PREFIX + memberId);
    }
  } catch { /* ignore */ }
};

/** Schedule a notification for the next shraddha date at the chosen time. */
const scheduleNotif = async (m: FamilyMember): Promise<void> => {
  if (!m.reminderEnabled || !m.nextOccurrenceISO) return;
  try {
    const granted = await Notifications.getPermissionsAsync();
    if (!granted.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }
    const [hh = '06', mm = '00'] = (m.reminderTime || '06:00').split(':');
    const [y, mo, d] = m.nextOccurrenceISO.split('-').map(Number);
    const trigger = new Date(y, (mo || 1) - 1, d || 1, parseInt(hh, 10), parseInt(mm, 10), 0, 0);
    if (trigger.getTime() <= Date.now()) return;   // already past

    const notifId = await Notifications.scheduleNotificationAsync({
      content: {
        title: `🕯️ Tithi Shraddha · ${m.name}`,
        body: `Today is the annual shraddha day for ${m.relation || 'your loved one'}. Offer prayers and tarpana.`,
        sound: 'default',
        data: { type: 'tithi-shraddha', memberId: m.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: trigger,
        channelId: 'prayer-reminders',
      } as any,
    });
    await AsyncStorage.setItem(NOTIF_KEY_PREFIX + m.id, notifId);
  } catch (e) {
    console.warn('[familyRepo] schedule notif failed:', (e as any)?.message);
  }
};

export const familyRepo = {
  async list(): Promise<FamilyMember[]> {
    return load();
  },

  /**
   * Add or update a member. Recomputes lunar tithi (if mode='date') and
   * the next Gregorian shraddha occurrence, then schedules a notification.
   */
  async upsert(member: FamilyMember, userLoc: UserLocation): Promise<FamilyMember> {
    const all = await load();
    const idx = all.findIndex(m => m.id === member.id);
    const prior = idx >= 0 ? all[idx] : null;

    // Apply defaults
    let enriched: FamilyMember = {
      reminderEnabled: true,
      reminderTime: '06:00',
      ...member,
    };

    // ── Mode 'date': convert Gregorian death info to lunar tithi ──
    // Triggered if the input is mode='date' AND any of (date/time/location) changed.
    const dateModeChanged =
      enriched.inputMode === 'date' &&
      (
        !prior ||
        prior.inputMode !== 'date' ||
        prior.deathDateGregorian !== enriched.deathDateGregorian ||
        prior.deathTimeLocal     !== enriched.deathTimeLocal ||
        prior.deathLocation?.lat !== enriched.deathLocation?.lat ||
        prior.deathLocation?.lng !== enriched.deathLocation?.lng
      );

    if (dateModeChanged && enriched.deathDateGregorian && enriched.deathLocation) {
      try {
        // Use the DEATH LOCATION (not user's current location) for the
        // lunar conversion — tithi at the moment of death depends on
        // where the person was.
        const fakeLocAtDeath: UserLocation = {
          ...enriched.deathLocation,
          source: 'default',
          fetchedAt: 0,
          label: `${enriched.deathLocation.name}, ${enriched.deathLocation.country}`,
        };
        const [hh = '12', mm = '00'] = (enriched.deathTimeLocal || '12:00').split(':');
        const d = new Date(`${enriched.deathDateGregorian}T${hh}:${mm}:00`);
        const p = await getPanchang(d, fakeLocAtDeath);
        if (p.source !== 'fallback') {
          enriched.lunarTithiNumber = p.tithiNumber;
          enriched.lunarPaksha = p.paksha;
          enriched.lunarMaas = p.maas;
        }
      } catch (e) {
        console.warn('[familyRepo] death-tithi compute failed:', (e as any)?.message);
      }
    }

    // ── Compute next Gregorian shraddha at USER'S current location ──
    if (enriched.lunarTithiNumber != null) {
      try {
        const next = await findNextTithiOccurrence(
          {
            tithiNumber: enriched.lunarTithiNumber,
            paksha: enriched.lunarPaksha || '',
            maas: enriched.lunarMaas || '',
          },
          userLoc
        );
        if (next) {
          enriched.nextOccurrenceISO = next.toISOString().slice(0, 10);
          enriched.lastComputedAt = Date.now();
        }
      } catch (e) {
        console.warn('[familyRepo] next-occurrence failed:', (e as any)?.message);
      }
    }

    // Persist
    if (idx >= 0) all[idx] = enriched;
    else           all.push(enriched);
    await save(all);

    // Reschedule notification
    await cancelNotif(enriched.id);
    await scheduleNotif(enriched);

    return enriched;
  },

  async remove(id: string): Promise<void> {
    await cancelNotif(id);
    const all = await load();
    await save(all.filter(m => m.id !== id));
  },

  /**
   * Refresh next-occurrence dates for ALL members and reschedule their
   * notifications. Called on app open + once a year.
   */
  async refreshAllOccurrences(loc: UserLocation): Promise<FamilyMember[]> {
    const all = await load();
    for (const m of all) {
      if (m.lunarTithiNumber == null) continue;
      try {
        const next = await findNextTithiOccurrence(
          {
            tithiNumber: m.lunarTithiNumber,
            paksha: m.lunarPaksha || '',
            maas: m.lunarMaas || '',
          },
          loc
        );
        if (next) {
          m.nextOccurrenceISO = next.toISOString().slice(0, 10);
          m.lastComputedAt = Date.now();
        }
      } catch { /* ignore */ }
      await cancelNotif(m.id);
      await scheduleNotif(m);
    }
    await save(all);
    return all;
  },
};
