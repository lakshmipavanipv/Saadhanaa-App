/**
 * Alarm sound catalog. Each preset sound lives in assets/sounds/
 * as an .mp3 file. If a file is missing, playback is silently skipped.
 *
 * To add real audio: drop the .mp3 into assets/sounds/ with the matching
 * filename (e.g. flute.mp3) and rebuild the app.
 */
export interface AlarmSound {
  id: string;
  label: string;
  description?: string;
  /** require()'d module ref, or null if missing */
  module: any | null;
}

// Wrap require in try/catch so missing files don't crash the bundler.
function safeReq(loader: () => any): any | null {
  try {
    return loader();
  } catch {
    return null;
  }
}

export const ALARM_SOUNDS: AlarmSound[] = [
  {
    id: 'flute',
    label: 'Meditative Flute',
    description: 'Gentle bansuri tones — default',
    module: safeReq(() => require('../assets/sounds/flute.mp3')),
  },
  {
    id: 'bell',
    label: 'Resonant Temple Bell',
    description: 'Single brass ghanta strike',
    module: safeReq(() => require('../assets/sounds/bell.mp3')),
  },
  {
    id: 'tanpura',
    label: 'Tanpura Drone',
    description: 'Soft 4-string drone in C',
    module: safeReq(() => require('../assets/sounds/tanpura.mp3')),
  },
  {
    id: 'om',
    label: 'Vedic OM Chant',
    description: 'Long ॐ chant from male chorus',
    module: safeReq(() => require('../assets/sounds/om.mp3')),
  },
];

export const DEFAULT_SOUND_ID = 'flute';

/** Look up a sound by id (falls back to default). */
export const findSound = (id?: string): AlarmSound | undefined => {
  if (!id) return ALARM_SOUNDS.find(s => s.id === DEFAULT_SOUND_ID);
  return ALARM_SOUNDS.find(s => s.id === id) || ALARM_SOUNDS.find(s => s.id === DEFAULT_SOUND_ID);
};
