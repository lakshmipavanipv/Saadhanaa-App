/**
 * calendarAggregator — single source of truth for "what's coming up in
 * my spiritual calendar". Merges three streams:
 *
 *   1. Static festivals from festivalsData.ts (Hindu/Sikh/Muslim/Christian)
 *   2. Family member Tithi-shraddhas (computed from VedAstro)
 *   3. Lunar + solar eclipses (from VedAstro, filtered by visibility at user's location)
 *
 * All times normalized to user's device timezone.
 */

import { PANCHANG_FESTIVALS, PanchangFestival } from '../festivalsData';
import { FamilyMember } from '../types';
import { EclipseEvent, getEclipses } from './panchang';
import { familyRepo } from './familyRepo';
import { UserLocation } from './location';

export type CalendarItemKind = 'festival' | 'tithi-shraddha' | 'eclipse';

export interface CalendarItem {
  id: string;
  kind: CalendarItemKind;
  date: string;                          // YYYY-MM-DD in device-local
  title: string;
  subtitle?: string;
  icon: string;
  /** Days until (negative = past). */
  daysFromNow: number;
  /** Original payload for detail view. */
  payload: PanchangFestival | FamilyMember | EclipseEvent;
}

const daysBetween = (today: Date, target: string): number => {
  const t = new Date(target + 'T00:00:00');
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((t.getTime() - todayMidnight.getTime()) / 86_400_000);
};

/**
 * Build a merged, time-sorted list of upcoming calendar items.
 * @param windowDays  How many days ahead to look (default 365)
 */
export const buildCalendar = async (
  loc: UserLocation,
  windowDays: number = 365
): Promise<CalendarItem[]> => {
  const today = new Date();
  const yearEnd = new Date(today.getTime() + windowDays * 86_400_000);
  const out: CalendarItem[] = [];

  // 1. Static festivals (already have dates)
  for (const f of PANCHANG_FESTIVALS) {
    const days = daysBetween(today, f.date);
    if (days < -7 || days > windowDays) continue;   // skip very-old or far-future
    out.push({
      id: `fest:${f.id || f.name}-${f.date}`,
      kind: 'festival',
      date: f.date,
      title: f.name,
      subtitle: f.tithi ? `${f.paksha ? f.paksha + ' ' : ''}${f.tithi} · ${f.month}` : undefined,
      icon: f.deityIcon || '🛕',
      daysFromNow: days,
      payload: f,
    });
  }

  // 2. Family member Tithi-shraddhas
  try {
    const fam = await familyRepo.list();
    for (const m of fam) {
      if (!m.nextOccurrenceISO) continue;
      const days = daysBetween(today, m.nextOccurrenceISO);
      if (days < -1 || days > windowDays) continue;
      out.push({
        id: `tithi:${m.id}`,
        kind: 'tithi-shraddha',
        date: m.nextOccurrenceISO,
        title: `Tithi Shraddha · ${m.name}`,
        subtitle: m.relation
          ? `${m.relation} · ${m.lunarPaksha || ''} ${m.lunarMaas || ''}`.trim()
          : undefined,
        icon: '🕯️',
        daysFromNow: days,
        payload: m,
      });
    }
  } catch (e) {
    console.warn('[calendar] family fetch failed:', e);
  }

  // 3. Eclipses (lunar + solar) — show all, mark visible-at-location specially
  try {
    const ecl = await getEclipses(today, yearEnd, loc);
    for (const e of ecl) {
      const days = daysBetween(today, e.date);
      if (days < -1 || days > windowDays) continue;
      out.push({
        id: `eclipse:${e.date}:${e.type}`,
        kind: 'eclipse',
        date: e.date,
        title: `${e.type === 'solar' ? '🌑 Solar' : '🌖 Lunar'} eclipse${e.subtype ? ' (' + e.subtype + ')' : ''}`,
        subtitle: e.visibleAtLocation
          ? `Visible at your location${e.startTime ? ' · ' + e.startTime : ''}`
          : 'Not visible at your location',
        icon: e.type === 'solar' ? '☀️' : '🌑',
        daysFromNow: days,
        payload: e,
      });
    }
  } catch (e) {
    console.warn('[calendar] eclipse fetch failed:', e);
  }

  // Sort: nearest first (negative days = past, push to end)
  out.sort((a, b) => {
    if (a.daysFromNow < 0 && b.daysFromNow >= 0) return 1;
    if (b.daysFromNow < 0 && a.daysFromNow >= 0) return -1;
    return a.daysFromNow - b.daysFromNow;
  });

  return out;
};
