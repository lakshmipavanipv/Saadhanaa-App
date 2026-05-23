import { PANCHANG_FESTIVALS, PanchangFestival } from './festivalsData';

const parseLocal = (dateStr: string): Date => {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
};

const fmtDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const todayStr = (): string => fmtDate(new Date());

export const getDaysUntil = (dateStr: string): number => {
  const target = parseLocal(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
};

/**
 * Build a virtual list of upcoming festivals that includes year-projected entries.
 *
 * Strategy: Group festivals by name (without year suffix). For each group,
 * if all hardcoded entries are in the past, project the NEXT occurrence by:
 *   - Christian/Gregorian-fixed festivals (Christmas, Easter): +365 days
 *   - Hindu/lunar festivals: +354 days (lunar year) per missing year
 * Repeat until we get a future date. Cheap, ±2-3 day approximation.
 */
const baseName = (id: string): string =>
  id.replace(/-\d{4}.*$/, '').replace(/-day1.*$/, '-day1');

const yearOf = (id: string): number => {
  const m = id.match(/-(\d{4})/);
  return m ? parseInt(m[1], 10) : 0;
};

const projectForward = (fest: PanchangFestival, yearsAhead: number): PanchangFestival => {
  const isGregorian =
    fest.region === 'Christian' ||
    /january|december/i.test(fest.month) ||
    fest.id.startsWith('vivekananda');
  const dayShift = isGregorian ? yearsAhead * 365 : yearsAhead * 354;
  const d = parseLocal(fest.date);
  d.setDate(d.getDate() + dayShift);
  return {
    ...fest,
    id: `${baseName(fest.id)}-${d.getFullYear()}`,
    date: fmtDate(d),
  };
};

const projectedCache: Map<string, PanchangFestival[]> = new Map();

/**
 * Return all festivals, including projected (approximate) ones for years
 * beyond the hardcoded data, up to `maxYearAhead` years from now.
 */
export const getAllFestivals = (maxYearAhead = 3): PanchangFestival[] => {
  const cacheKey = String(maxYearAhead);
  if (projectedCache.has(cacheKey)) return projectedCache.get(cacheKey)!;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cutoff = new Date(today);
  cutoff.setFullYear(cutoff.getFullYear() + maxYearAhead);

  // Group by base id
  const groups: Record<string, PanchangFestival[]> = {};
  for (const f of PANCHANG_FESTIVALS) {
    const key = baseName(f.id);
    (groups[key] = groups[key] || []).push(f);
  }

  const out: PanchangFestival[] = [...PANCHANG_FESTIVALS];
  for (const [key, list] of Object.entries(groups)) {
    // Find latest year we have for this festival
    list.sort((a, b) => yearOf(a.id) - yearOf(b.id));
    const latest = list[list.length - 1];
    const latestDate = parseLocal(latest.date);

    // Project forward until we exceed cutoff
    let yearsAhead = 1;
    while (true) {
      const proj = projectForward(latest, yearsAhead);
      const projDate = parseLocal(proj.date);
      if (projDate > cutoff) break;
      // Only add if it's after the latest hardcoded date
      if (projDate > latestDate) out.push(proj);
      yearsAhead++;
      if (yearsAhead > 10) break;
    }
  }

  projectedCache.set(cacheKey, out);
  return out;
};

export const getUpcoming = (): PanchangFestival | null => {
  const all = getAllFestivals(3);
  const future = all
    .filter(f => getDaysUntil(f.date) >= 0)
    .sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime());
  return future.length > 0 ? future[0] : null;
};

export const getUpcomingFestivals = (limit = 5): PanchangFestival[] => {
  const all = getAllFestivals(3);
  return all
    .filter(f => getDaysUntil(f.date) >= 0)
    .sort((a, b) => parseLocal(a.date).getTime() - parseLocal(b.date).getTime())
    .slice(0, limit);
};

export const getTodayFest = (): PanchangFestival | null => {
  const today = todayStr();
  return getAllFestivals(3).find(f => f.date === today) || null;
};

/**
 * Time-of-day Sanskrit greeting — universal, non-sectarian (no deity bias).
 * 04-11 → Suprabhātam · 12-16 → Shubh Madhyāhna · 17-20 → Shubh Sandhyā · 21-03 → Shubh Rātri
 */
export const getGreeting = (): string => {
  const h = new Date().getHours();
  if (h >= 4  && h < 12)   return '🌅 Suprabhātam';
  if (h >= 12 && h < 17)   return '☀️ Shubh Madhyāhna';
  if (h >= 17 && h < 21)   return '🌆 Shubh Sandhyā';
  return '🌙 Shubh Rātri';
};

/**
 * Personal "caretaker" line that rotates with time-of-day and weaves in the
 * user's name. Promise of body+soul sync — universal, no deity reference.
 * Falls back gracefully if no name was set during onboarding.
 */
export const getPersonalLine = (userName?: string | null): string => {
  const h = new Date().getHours();
  const name = userName?.trim().split(' ')[0]; // first name only
  const addr = name ? `${name}, ` : '';
  const Addr = name ? `${name}, ` : '';
  if (h >= 4  && h < 12)
    return `💛 ${Addr}today we tune your body and soul together`;
  if (h >= 12 && h < 17)
    return `💛 ${Addr}your heart is held in stillness this hour`;
  if (h >= 17 && h < 21)
    return `💛 ${Addr}let your body soften, your soul stay close`;
  return `💛 ${Addr}rest — you are held, body and soul`;
};

export const formatDate = (dateStr: string): string => {
  return parseLocal(dateStr).toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

export const formatShortDate = (dateStr: string): string => {
  return parseLocal(dateStr).toLocaleDateString('en-IN', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
};

// ──────────────────────────────────────────────────────────────────
// Sadhana time helpers
// ──────────────────────────────────────────────────────────────────
export const SECONDS_PER_JAPA = 6;  // typical mantra recitation ~5–10 sec

export const japasToSeconds = (japas: number): number => japas * SECONDS_PER_JAPA;

/** Adaptive display: 45s / 42 mins / 14.5 hrs */
export const formatSadhanaTime = (totalSeconds: number): string => {
  if (totalSeconds < 60) return `${Math.round(totalSeconds)}s`;
  if (totalSeconds < 3600) return `${Math.round(totalSeconds / 60)} mins`;
  const hrs = totalSeconds / 3600;
  return `${hrs >= 10 ? Math.round(hrs) : hrs.toFixed(1)} hrs`;
};

/** Format a duration like "in 2h 15m" or "in 45 mins" */
export const formatTimeUntil = (futureDate: Date): string => {
  const ms = futureDate.getTime() - Date.now();
  if (ms < 0) return 'passed';
  const mins = Math.floor(ms / 60000);
  if (mins < 60) return `in ${mins} min${mins !== 1 ? 's' : ''}`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  if (hrs < 24) return `in ${hrs}h ${rem}m`;
  const days = Math.floor(hrs / 24);
  return `in ${days} day${days !== 1 ? 's' : ''}`;
};

/**
 * Given a HH:MM time string, return the next Date when this time occurs
 * (today if not yet past, else tomorrow).
 */
export const nextOccurrenceOfTime = (hhmm: string): Date => {
  const [h, m] = hhmm.split(':').map(Number);
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h || 0, m || 0, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return d;
};
