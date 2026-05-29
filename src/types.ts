export interface Deity {
  id: string;
  name: string;
  icon: string;
  mantra: string;
  prayerAlarm: string;
  alarmOn: boolean;
  totalMalas: number;
  targetMalas?: number;
  malaMaterial?: string;     // e.g. "Rudraksha", "Yellow Citrine", "Turmeric"
  malaColor?: string;        // primary bead color (hex)
  malaHighlight?: string;    // highlight / specular color
  /** Alarm sound preset id ('flute', 'bell', 'tanpura', 'om') or 'custom' */
  alarmSoundId?: string;
  /** When alarmSoundId === 'custom', file:// URI of the chosen audio */
  alarmSoundUri?: string;
  /** Display name for custom sound */
  alarmSoundName?: string;
  /** Days of week to repeat (0=Sun, 1=Mon, … 6=Sat). Defaults to [0..6] = every day. */
  repeatDays?: number[];
  /** Cached expo-notification ids per day-of-week, used to cancel/reschedule. */
  notificationIds?: Record<number, string>;
}

// Yoga is stored as a BodyActivity (so the Yoga screen's "Log past" still
// writes via exerciseRepo) but is INTENTIONALLY hidden from the Exercise
// tab — yoga has its own dedicated screen and is not a cardio/strength
// workout in the user's mental model.
export type BodyActivity = 'walk' | 'run' | 'jog' | 'cycle' | 'swim' | 'gym' | 'hiit' | 'yoga';
export type SoulActivity = 'meditation' | 'japa' | 'sandhya';

export interface UserGoals {
  /** Daily body-activity target minutes (e.g. 30). */
  bodyMinutesPerDay: number;
  /** Which body activities the user practices. */
  bodyActivities: BodyActivity[];
  /** Daily soul-activity target minutes (e.g. 20). */
  soulMinutesPerDay: number;
  /** Which soul activities the user practices. */
  soulActivities: SoulActivity[];
}

export interface UserProfile {
  name: string;
  email?: string;
  phone?: string;
  createdAt: string;
  onboarded: boolean;
  /** ISO date string, YYYY-MM-DD. */
  dob?: string;
  /** Height in cm. */
  heightCm?: number;
  /** Weight in kg. */
  weightKg?: number;
  /** Body + Soul daily goals. */
  goals?: UserGoals;
}

/** Logged exercise / body activity session. */
export interface ExerciseEntry {
  id: string;
  date: string;          // YYYY-MM-DD
  activity: BodyActivity;
  durationMin: number;
  /** Optional ring-measured calories / distance / etc. */
  caloriesKcal?: number;
  distanceKm?: number;
  notes?: string;
}

/** User-defined custom yoga routine. */
export interface CustomYoga {
  id: string;
  name: string;
  description?: string;
  /** Ordered steps, each with its own duration. */
  steps: { id: string; instruction: string; durationSec: number }[];
  /** Cue between steps: ring buzz or sound id. */
  cue: 'buzz' | 'sound';
  soundId?: string;
  createdAt: number;
}

/** Cached city info used when computing tithi at death location. */
export interface DeathLocation {
  name: string;          // "Mumbai" or "Toronto"
  country: string;       // "India" / "Canada"
  lat: number;
  lng: number;
  tz: string;            // IANA: "Asia/Kolkata"
}

/**
 * Family member whose annual Tithi-shraddha (death anniversary) we
 * track and show in the festival calendar.
 *
 * Two input modes, captured by `inputMode`:
 *
 *   • 'date'  — user knows the Gregorian date + time + city/country of
 *     death. We call VedAstro at THAT location to convert to lunar tithi.
 *   • 'tithi' — user already knows the lunar tithi (paksha + tithi # + maas).
 *     We store it directly and skip the conversion.
 *
 * Either way, `lunarTithiNumber + lunarPaksha + lunarMaas` is what
 * drives the annual recurrence lookup against the USER'S current
 * location and the device timezone.
 */
export interface FamilyMember {
  id: string;
  name: string;
  /** "Father", "Mother", "Grandfather", or freeform. */
  relation: string;
  /** Which input mode the user used. Determines validation + UI. */
  inputMode: 'date' | 'tithi';

  // ── Input mode 'date' ──────────────────────────────────────
  /** Gregorian death date (YYYY-MM-DD). */
  deathDateGregorian?: string;
  /** Local time at death (HH:MM). Default 12:00 if unknown. */
  deathTimeLocal?: string;
  /** Where the person died — needed to compute correct tithi. */
  deathLocation?: DeathLocation;

  // ── Lunar tithi (entered directly OR computed from above) ──
  /** Lunar tithi number 1..15. */
  lunarTithiNumber?: number;
  /** Paksha. */
  lunarPaksha?: 'Shukla' | 'Krishna' | '';
  /** Lunar month name (e.g. "Chaitra"). */
  lunarMaas?: string;

  // ── Cached annual occurrence ───────────────────────────────
  /** Next upcoming Gregorian shraddha date (YYYY-MM-DD), in user's TZ. */
  nextOccurrenceISO?: string;
  /** When we last computed nextOccurrenceISO. */
  lastComputedAt?: number;

  // ── Reminder ───────────────────────────────────────────────
  /** Reminder enabled (defaults true on creation). */
  reminderEnabled?: boolean;
  /** Time of day for the reminder (HH:MM). Defaults to 06:00 (sunrise-ish). */
  reminderTime?: string;
}

export interface Festival {
  id: string;
  name: string;
  date: string;
  region: 'Hindu' | 'Sikh' | 'Muslim' | 'Christian';
  wish: string;
  wishSub: string;
  checklist: ChecklistItem[];
}

export interface ChecklistItem {
  id: number;
  text: string;
  tag: string;
}

export interface HistoryEntry {
  id: string;
  date: string;
  deity: string;
  deityId: string;
  malas: number;
  japas: number;
}

export interface JapaSession {
  deity: string;
  deityId: string;
  malas: number;
  japas: number;
  date: string;
}
