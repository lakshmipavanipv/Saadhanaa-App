/**
 * panchang — Hindu astronomical calculations via VedAstro's free public API.
 *
 *   • Gregorian date → Panchang (Tithi, Paksha, Nakshatra, Vara, Maas)
 *   • Reverse lookup: (Tithi + Paksha + Maas) → next Gregorian occurrence in a window
 *     Used to compute annual death-anniversary (Tithi-shraddha) dates
 *   • Lunar + solar eclipses for a date range
 *
 * VedAstro (api.vedastro.org) is free, no key required. Rate limit is
 * conservative — we cache aggressively in AsyncStorage and only call once
 * per (location, date) tuple.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { UserLocation } from './location';

const BASE = 'https://api.vedastro.org/api';
const CACHE_PREFIX = 'soulsync.panchang.';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;   // 12 h

// ─── Types ─────────────────────────────────────────────────────────

export interface PanchangData {
  date: string;                // YYYY-MM-DD
  tithi: string;               // e.g. "Shukla Pratipada"
  paksha: 'Shukla' | 'Krishna' | '';
  tithiNumber: number;         // 1-15
  nakshatra: string;
  yoga: string;
  karana: string;
  vara: string;                // weekday
  maas: string;                // lunar month (e.g. "Chaitra")
  sunrise?: string;            // HH:MM device-local
  sunset?: string;
  /** Whether the data came from network or fallback. */
  source: 'live' | 'cache' | 'fallback';
}

export interface EclipseEvent {
  date: string;                // YYYY-MM-DD
  type: 'solar' | 'lunar';
  subtype?: 'total' | 'partial' | 'annular' | 'penumbral';
  visibleAtLocation: boolean;
  startTime?: string;
  endTime?: string;
  maxTime?: string;
  description?: string;
}

// ─── VedAstro API call helpers ─────────────────────────────────────

const cacheKey = (kind: string, ...parts: (string | number)[]) =>
  `${CACHE_PREFIX}${kind}.${parts.join('.')}`;

const cachedFetch = async <T>(
  key: string, url: string,
  parse: (json: any) => T,
  ttlMs: number = CACHE_TTL_MS
): Promise<T | null> => {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const { at, data } = JSON.parse(raw);
      if (Date.now() - at < ttlMs) return data as T;
    }
  } catch { /* fall through */ }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const data = parse(json);
    AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), data })).catch(() => {});
    return data;
  } catch (e) {
    console.warn('[panchang] fetch failed:', (e as any)?.message?.slice?.(0, 80));
    return null;
  }
};

const fmtDateForApi = (d: Date): string => {
  // VedAstro wants DD/MM/YYYY
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
};

// ─── Public API ────────────────────────────────────────────────────

/**
 * Panchang for a given date + location. Returns a structured object,
 * or a graceful fallback if VedAstro is unreachable.
 */
export const getPanchang = async (
  date: Date, loc: UserLocation
): Promise<PanchangData> => {
  const dateStr = date.toISOString().slice(0, 10);
  const key = cacheKey('panchang', dateStr, loc.lat.toFixed(2), loc.lng.toFixed(2));
  // VedAstro panchang endpoint shape:
  //   /api/Calculate/PanchangaTable/{Location}/{Date}/{Timezone}
  const url =
    `${BASE}/Calculate/PanchangaTable` +
    `/Location/${encodeURIComponent(loc.label || 'User')}` +
    `/Latitude/${loc.lat}/Longitude/${loc.lng}` +
    `/Date/${fmtDateForApi(date)}/Time/12:00` +
    `/Timezone/${encodeURIComponent(loc.tz)}`;

  const parsed = await cachedFetch<PanchangData>(key, url, (json: any) => {
    const root = json?.Payload ?? json ?? {};
    const cells: Record<string, string> = {};
    // VedAstro returns rows; flatten by name
    if (Array.isArray(root)) {
      for (const r of root) {
        if (r?.Name && r?.ParsedValue) cells[r.Name] = String(r.ParsedValue);
      }
    } else if (typeof root === 'object') {
      Object.assign(cells, root);
    }
    const tithiRaw = cells.Tithi || cells.tithi || '';
    const paksha: 'Shukla' | 'Krishna' | '' =
      /shukla/i.test(tithiRaw) ? 'Shukla' :
      /krishna/i.test(tithiRaw) ? 'Krishna' : '';
    const tithiNumberMatch = tithiRaw.match(/\d+/);
    return {
      date: dateStr,
      tithi: tithiRaw,
      paksha,
      tithiNumber: tithiNumberMatch ? parseInt(tithiNumberMatch[0], 10) : 0,
      nakshatra: cells.Nakshatra || cells.nakshatra || '',
      yoga: cells.Yoga || cells.yoga || '',
      karana: cells.Karana || cells.karana || '',
      vara: cells.Vara || cells.vara || '',
      maas: cells.Masa || cells.LunarMonth || cells.LunarMonthName || '',
      sunrise: cells.Sunrise || undefined,
      sunset: cells.Sunset || undefined,
      source: 'live',
    };
  });

  if (parsed) return parsed;

  // Fallback — minimal data so the UI never breaks
  const dow = ['Ravivar', 'Somavar', 'Mangalvar', 'Budhavar', 'Guruvar', 'Shukravar', 'Shanivar'][date.getDay()];
  return {
    date: dateStr, tithi: '—', paksha: '', tithiNumber: 0,
    nakshatra: '—', yoga: '—', karana: '—', vara: dow,
    maas: '—', source: 'fallback',
  };
};

/**
 * Given the lunar info of a death date (year of death, paksha, tithi
 * number, maas), find the next Gregorian occurrence in the next 18
 * months. This is the user-visible annual Tithi-shraddha date.
 *
 * Brute-force but reliable: scan day by day, ask VedAstro for each day's
 * panchang, return the first match. Results are aggressively cached so
 * we only do this once per family member per year.
 */
export const findNextTithiOccurrence = async (
  target: { tithiNumber: number; paksha: string; maas: string },
  loc: UserLocation,
  startFrom: Date = new Date()
): Promise<Date | null> => {
  const key = cacheKey('tithi-next', target.tithiNumber, target.paksha, target.maas,
                       startFrom.getFullYear());
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) {
      const { at, iso } = JSON.parse(raw);
      if (Date.now() - at < 30 * 24 * 3600 * 1000 && iso) return new Date(iso);
    }
  } catch { /* fall through */ }

  // Scan up to 400 days forward (covers lunar→solar drift)
  const cursor = new Date(startFrom);
  for (let i = 0; i < 400; i++) {
    cursor.setDate(cursor.getDate() + 1);
    const p = await getPanchang(cursor, loc);
    if (
      p.source === 'live' &&
      p.tithiNumber === target.tithiNumber &&
      (!target.paksha || p.paksha === target.paksha) &&
      (!target.maas   || p.maas.toLowerCase().includes(target.maas.toLowerCase()))
    ) {
      AsyncStorage.setItem(key, JSON.stringify({ at: Date.now(), iso: cursor.toISOString() })).catch(() => {});
      return new Date(cursor);
    }
    // Rate-limit kindness: pause briefly every 30 calls
    if (i > 0 && i % 30 === 0) await new Promise(r => setTimeout(r, 800));
  }
  return null;
};

/**
 * Fetch lunar + solar eclipses for a window (typically 1 year ahead).
 * Returns an empty array on API failure.
 */
export const getEclipses = async (
  fromDate: Date, toDate: Date, loc: UserLocation
): Promise<EclipseEvent[]> => {
  const key = cacheKey('eclipses',
    fromDate.toISOString().slice(0, 10),
    toDate.toISOString().slice(0, 10),
    loc.lat.toFixed(1), loc.lng.toFixed(1));
  // VedAstro endpoint:
  //   /api/Calculate/EclipsesInDuration/Latitude/{lat}/Longitude/{lng}/...
  const url =
    `${BASE}/Calculate/SolarLunarEclipsesInDuration` +
    `/Latitude/${loc.lat}/Longitude/${loc.lng}` +
    `/StartDate/${fmtDateForApi(fromDate)}/EndDate/${fmtDateForApi(toDate)}` +
    `/Timezone/${encodeURIComponent(loc.tz)}`;

  const result = await cachedFetch<EclipseEvent[]>(
    key, url,
    (json: any) => {
      const arr = Array.isArray(json?.Payload) ? json.Payload : Array.isArray(json) ? json : [];
      return arr.map((e: any): EclipseEvent => ({
        date: (e.Date || e.date || '').slice(0, 10),
        type: /solar/i.test(e.Type || '') ? 'solar' : 'lunar',
        subtype: (e.SubType || e.Magnitude || '').toLowerCase().match(/total|partial|annular|penumbral/)?.[0] as any,
        visibleAtLocation: !!e.Visible || !!e.IsVisible,
        startTime: e.StartTime || e.start,
        endTime: e.EndTime || e.end,
        maxTime: e.MaxTime || e.peak,
        description: e.Description || e.Notes,
      }));
    },
    7 * 24 * 3600 * 1000   // 7-day cache for eclipses
  );

  return result ?? [];
};
