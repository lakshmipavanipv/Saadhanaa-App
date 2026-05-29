/**
 * RoutineParser — convert natural-language routine descriptions into
 * structured RoutineItems.
 *
 * Strategy:
 *   1. Try the local regex parser first (fast, offline, free).
 *   2. If user input doesn't match patterns, optionally fall back to
 *      Gemma via OpenRouter (wired-in later if quota allows).
 *
 * Example inputs the local parser handles:
 *   "20 min walk daily"
 *   "10 min japa every morning"
 *   "Surya Namaskar 5 min monday wednesday friday"
 *   "Box breathing 3 min before sleep"
 *   "30 min walk, 10 min gayatri japa, 5 min nadi shodhana"
 */

import { RoutineCategory } from '../../services/routineRepo';

export interface ParsedRoutineItem {
  category: RoutineCategory;
  name: string;
  durationMin: number;
  time?: string;
  frequency: 'daily' | number[];
  custom?: boolean;
}

// Keyword → category mapping
const KEYWORDS: Record<RoutineCategory, string[]> = {
  exercise: ['walk', 'run', 'jog', 'cycle', 'swim', 'gym', 'hiit', 'workout', 'cardio', 'lift'],
  yoga:     ['yoga', 'asana', 'surya', 'namaskar', 'tadasana', 'pranayama', 'nadi shodhana',
             'bhramari', 'kapalabhati', '4-7-8', 'breath work'],
  japa:     ['japa', 'mantra', 'mala', 'gayatri', 'mahamrityunjaya', 'om namah shivaya',
             'hare krishna', 'om'],
  meditate: ['meditat', 'mindful', 'box breath', 'body scan', 'yoga nidra',
             'grounding', '5-4-3-2-1', 'so hum', 'so-hum'],
  sandhya:  ['sandhya', 'pratah', 'madhyahnika', 'sayam', 'vandanam'],
  shraadha: ['shraadha', 'shraddha', 'shradh', 'tithi shraddha', 'pitru', 'ancestor'],
  tithi:    ['tithi', 'ekadashi', 'pradosh', 'purnima', 'amavasya', 'sankashti'],
  festival: ['festival', 'shivratri', 'navratri', 'diwali', 'holi', 'janmashtami'],
};

const DAY_KEYWORDS: Record<string, number> = {
  sunday: 0, sun: 0,
  monday: 1, mon: 1,
  tuesday: 2, tue: 2, tues: 2,
  wednesday: 3, wed: 3,
  thursday: 4, thu: 4, thurs: 4,
  friday: 5, fri: 5,
  saturday: 6, sat: 6,
};

const TIME_KEYWORDS: Record<string, string> = {
  morning: '06:30', dawn: '05:30', sunrise: '06:00',
  afternoon: '13:00', noon: '12:00', midday: '12:00',
  evening: '18:30', dusk: '18:00', sunset: '18:30',
  night: '21:00', 'before sleep': '21:30', bedtime: '21:30',
};

const DURATION_RE = /(\d+)\s*(min|mins|minute|minutes|m)\b/i;
const HOUR_DURATION_RE = /(\d+)\s*(h|hr|hour|hours)\b/i;
const CLOCK_TIME_RE = /\b(\d{1,2})[:.](\d{2})\s*(am|pm)?\b/i;

const categorize = (text: string): { category: RoutineCategory; name: string } | null => {
  const t = text.toLowerCase();
  for (const [cat, kws] of Object.entries(KEYWORDS)) {
    for (const k of kws) {
      if (t.includes(k)) {
        // Find a clean display name
        const m = t.match(new RegExp(`\\b${k}[a-z]*\\b`, 'i'));
        const niceName = m ? m[0].replace(/\b\w/g, c => c.toUpperCase()) : k;
        return { category: cat as RoutineCategory, name: niceName };
      }
    }
  }
  return null;
};

const extractDuration = (text: string): number | null => {
  const m = text.match(DURATION_RE);
  if (m) return parseInt(m[1], 10);
  const h = text.match(HOUR_DURATION_RE);
  if (h) return parseInt(h[1], 10) * 60;
  return null;
};

const extractTime = (text: string): string | undefined => {
  const t = text.toLowerCase();
  // 1. Try explicit clock-time
  const clock = text.match(CLOCK_TIME_RE);
  if (clock) {
    let hh = parseInt(clock[1], 10);
    const mm = parseInt(clock[2], 10);
    const ampm = clock[3]?.toLowerCase();
    if (ampm === 'pm' && hh < 12) hh += 12;
    if (ampm === 'am' && hh === 12) hh = 0;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
  // 2. Try keyword
  for (const [kw, time] of Object.entries(TIME_KEYWORDS)) {
    if (t.includes(kw)) return time;
  }
  return undefined;
};

const extractFrequency = (text: string): 'daily' | number[] => {
  const t = text.toLowerCase();
  if (/\bdaily\b|\beveryday\b|\bevery day\b/.test(t)) return 'daily';
  const days: number[] = [];
  for (const [name, num] of Object.entries(DAY_KEYWORDS)) {
    if (new RegExp(`\\b${name}\\b`).test(t)) {
      if (!days.includes(num)) days.push(num);
    }
  }
  if (/\bweekend\b|\bweekends\b/.test(t)) {
    if (!days.includes(0)) days.push(0);
    if (!days.includes(6)) days.push(6);
  }
  if (/\bweekday\b|\bweekdays\b/.test(t)) {
    [1, 2, 3, 4, 5].forEach(d => { if (!days.includes(d)) days.push(d); });
  }
  return days.length > 0 ? days.sort() : 'daily';
};

// Split multi-item input ("X, Y, and Z") into parts
const splitParts = (text: string): string[] =>
  text
    .replace(/\band\b/gi, ',')
    .split(/[,;]|\bplus\b/i)
    .map(s => s.trim())
    .filter(Boolean);

export const routineParser = {
  /** Parse a single sentence into 0..N RoutineItems. */
  parse(input: string): ParsedRoutineItem[] {
    const parts = splitParts(input);
    const items: ParsedRoutineItem[] = [];
    for (const part of parts) {
      const cat = categorize(part);
      const dur = extractDuration(part);
      if (!cat || !dur) continue;
      items.push({
        category: cat.category,
        name: cat.name,
        durationMin: dur,
        time: extractTime(part),
        frequency: extractFrequency(part),
      });
    }
    return items;
  },
};
