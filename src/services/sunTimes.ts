/**
 * sunTimes — sunrise / sunset / civil twilight for any (date, location) pair.
 *
 * Pure on-device computation via `suncalc` — no API, no network, accurate
 * to ~1 minute. Output times are JS Date objects in the device's local
 * timezone (suncalc returns UTC; we render in local).
 */

import SunCalc from 'suncalc';
import { UserLocation } from './location';

export interface SunTimes {
  sunrise: Date;
  sunset: Date;
  solarNoon: Date;
  dawn: Date;             // civil twilight start
  dusk: Date;             // civil twilight end
  /** Brahma muhurta start = ~96 min before sunrise. */
  brahmaMuhurta: Date;
  /** Sandhya windows for the Vedic ritual. */
  pratahSandhya:    { start: Date; end: Date };
  madhyahnikaSandhya: { start: Date; end: Date };
  sayamSandhya:     { start: Date; end: Date };
}

/**
 * Get sun-position windows for a given date at a given location.
 * Date should be a JS Date for the day you want (any time of day on that date).
 */
export const computeSunTimes = (date: Date, loc: UserLocation): SunTimes => {
  const t = SunCalc.getTimes(date, loc.lat, loc.lng);

  const sunrise = t.sunrise;
  const sunset  = t.sunset;
  const solarNoon = t.solarNoon;

  // Brahma muhurta = 96 min before sunrise (1 muhurta = 48 min, 2 muhurtas before sunrise)
  const brahmaMuhurta = new Date(sunrise.getTime() - 96 * 60 * 1000);

  // Sandhya windows (traditional definitions)
  //   Pratah:    24 min before → 24 min after sunrise
  //   Madhyahnika: 24 min around solar noon
  //   Sayam:     24 min before → 24 min after sunset
  const mins = (n: number) => n * 60 * 1000;

  return {
    sunrise, sunset, solarNoon,
    dawn: t.dawn, dusk: t.dusk,
    brahmaMuhurta,
    pratahSandhya:      { start: new Date(sunrise.getTime()   - mins(24)), end: new Date(sunrise.getTime()  + mins(24)) },
    madhyahnikaSandhya: { start: new Date(solarNoon.getTime() - mins(24)), end: new Date(solarNoon.getTime() + mins(24)) },
    sayamSandhya:       { start: new Date(sunset.getTime()    - mins(24)), end: new Date(sunset.getTime()  + mins(24)) },
  };
};

/** Format a Date as HH:MM in the device's local timezone. */
export const fmtHHMM = (d: Date): string => {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
};
