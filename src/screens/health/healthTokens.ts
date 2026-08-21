/**
 * healthTokens — per-metric accent colors + band definitions used across the
 * new Health hub, MetricDetail, Stress, Sleep, and Exercise detail screens.
 *
 * The bands are the SAME across the mockups and the RN screens; if you edit
 * one you must edit the other. Kept as a plain object so it's tree-shakable
 * and easy to test.
 */

export const HEALTH_COLORS = {
  hr:       '#FF7A85',   // coral
  hrv:      '#7BE4B8',   // green
  spo2:     '#7CB1FF',   // blue
  temp:     '#F5C56B',   // amber
  resp:     '#B39BFF',   // lavender
  sleep:    '#6B47C7',   // deep purple
  stress:   '#F0D08A',   // gold
  exercise: '#FF9F45',   // saffron
  // shared semantic tints for band backgrounds (10-14% opacity looks right)
  tintLow:  'rgba(255,122,133,0.10)',   // low / high (both flag risk)
  tintOk:   'rgba(123,228,184,0.14)',   // healthy / relaxed / rested
  tintWarn: 'rgba(245,197,107,0.10)',   // moderate / elevated
} as const;

export type HealthMetric =
  | 'hr' | 'hrv' | 'spo2' | 'temp' | 'resp'
  | 'sleep' | 'stress' | 'exercise';

export interface Band {
  /** Display name for the y-axis label. */
  name: string;
  /** Numeric lower bound (in same units as data). */
  from: number;
  /** Numeric upper bound (in same units as data). */
  to: number;
  /** Tint token to fill the band background — one of `tintLow|tintOk|tintWarn`. */
  tint: 'low' | 'ok' | 'warn';
}

export interface MetricConfig {
  key: HealthMetric;
  label: string;
  unit: string;
  color: string;
  /** Y-axis min for chart plotting. */
  yMin: number;
  /** Y-axis max for chart plotting. */
  yMax: number;
  /** Bands ordered bottom → top (rendered in that stacking order). */
  bands: Band[];
  /** Delta interpretation — for HR, LOWER than baseline is good ("−3 bpm" → good).
   *  For HRV, HIGHER is good. Callers use this to pick the delta chip color. */
  goodDelta: 'lower' | 'higher';
  /** One-line educational blurb used in the "About" section. */
  aboutTitle: string;
  aboutIcon: string;
  aboutBody: string;
}

export const METRIC_CONFIG: Record<Exclude<HealthMetric, 'sleep' | 'stress' | 'exercise'>, MetricConfig> = {
  hr: {
    key: 'hr',
    label: 'Heart rate',
    unit: 'bpm',
    color: HEALTH_COLORS.hr,
    yMin: 40, yMax: 120,
    bands: [
      { name: 'Low',      from: 40,  to: 60,  tint: 'low'  },
      { name: 'Healthy',  from: 60,  to: 80,  tint: 'ok'   },
      { name: 'Elevated', from: 80,  to: 100, tint: 'warn' },
      { name: 'High',     from: 100, to: 120, tint: 'low'  },
    ],
    goodDelta: 'lower',
    aboutTitle: 'What is heart rate?',
    aboutIcon: '💓',
    aboutBody:
      'How many times your heart beats each minute. It goes up when you move, ' +
      'feel stressed, or drink caffeine — and down when you rest or breathe ' +
      'deeply. A lower resting rate is usually a sign of a fitter heart.',
  },
  hrv: {
    key: 'hrv',
    label: 'HRV',
    unit: 'ms',
    color: HEALTH_COLORS.hrv,
    yMin: 0, yMax: 100,
    bands: [
      { name: 'Fatigued',   from: 0,  to: 40,  tint: 'low'  },
      { name: 'Recovering', from: 40, to: 60,  tint: 'warn' },
      { name: 'Rested',     from: 60, to: 100, tint: 'ok'   },
    ],
    goodDelta: 'higher',
    aboutTitle: 'What is HRV?',
    aboutIcon: '🌿',
    aboutBody:
      "Tiny differences in the time between heartbeats. A higher number usually " +
      "means you're well recovered — your body's rest-and-digest system is dialed " +
      'in. A drop of >15% below your baseline can hint at fatigue, poor sleep, or ' +
      'something coming on.',
  },
  spo2: {
    key: 'spo2',
    label: 'Blood Oxygen',
    unit: '%',
    color: HEALTH_COLORS.spo2,
    yMin: 88, yMax: 100,
    bands: [
      { name: 'Low',      from: 88, to: 92,  tint: 'low'  },
      { name: 'Moderate', from: 92, to: 95,  tint: 'warn' },
      { name: 'Normal',   from: 95, to: 100, tint: 'ok'   },
    ],
    goodDelta: 'higher',
    aboutTitle: 'What is SpO₂?',
    aboutIcon: '🫁',
    aboutBody:
      'The percentage of your red blood cells carrying oxygen. Healthy adults ' +
      'usually sit at 95–100%. Brief dips during sleep are normal; sustained ' +
      'readings under 92% are worth flagging to a clinician.',
  },
  temp: {
    key: 'temp',
    label: 'Skin temperature',
    unit: '°C',
    color: HEALTH_COLORS.temp,
    yMin: 34, yMax: 38,
    bands: [
      { name: 'Low',      from: 34,   to: 35.5, tint: 'low'  },
      { name: 'Normal',   from: 35.5, to: 37.2, tint: 'ok'   },
      { name: 'Elevated', from: 37.2, to: 38,   tint: 'warn' },
    ],
    goodDelta: 'lower',
    aboutTitle: 'What is skin temperature?',
    aboutIcon: '🌡️',
    aboutBody:
      'The surface temperature of your finger. It naturally rises and falls ' +
      'through the day and night. What matters is the trend versus your own ' +
      'baseline — a persistent 0.3°C rise for several days can precede feeling unwell.',
  },
  resp: {
    key: 'resp',
    label: 'Respiration',
    unit: '/min',
    color: HEALTH_COLORS.resp,
    yMin: 8, yMax: 24,
    bands: [
      { name: 'Low',      from: 8,  to: 12, tint: 'low'  },
      { name: 'Normal',   from: 12, to: 20, tint: 'ok'   },
      { name: 'Elevated', from: 20, to: 24, tint: 'warn' },
    ],
    goodDelta: 'lower',
    aboutTitle: 'What is respiration rate?',
    aboutIcon: '🌬️',
    aboutBody:
      "How many breaths you take per minute. Most adults breathe 12-20 times " +
      'per minute at rest, rising with activity, illness or anxiety. Your ring ' +
      'does not report this measurement, so no value is shown.',
  },
};

/** Stress config — 4-band chart, keeps the same shape as MetricConfig. */
export const STRESS_CONFIG: MetricConfig = {
  key: 'stress',
  label: 'Stress',
  unit: '/100',
  color: HEALTH_COLORS.stress,
  yMin: 0, yMax: 100,
  bands: [
    { name: 'Relaxed',  from: 0,  to: 25,  tint: 'ok'   },
    { name: 'Low',      from: 25, to: 50,  tint: 'ok'   },
    { name: 'Moderate', from: 50, to: 75,  tint: 'warn' },
    { name: 'High',     from: 75, to: 100, tint: 'low'  },
  ],
  goodDelta: 'lower',
  aboutTitle: 'How stress is scored',
  aboutIcon: '🌬️',
  aboutBody:
    "Where this number comes from: the ring calculates it, not the app. Its " +
    'sensor measures the gaps between consecutive heartbeats, and the ' +
    'variation in those gaps reflects how activated your nervous system is — ' +
    'steady, even gaps mean alertness or strain, while naturally varying gaps ' +
    'mean rest-and-digest. The ring turns that into a 0-100 figure on its own ' +
    'chip and reports the finished value; the app stores and charts it ' +
    'unchanged, and applies no formula of its own. ' +
    'Lower is calmer. A short breath practice or a walk usually pulls the ' +
    'score down within minutes, which is the quickest way to see whether the ' +
    'reading is tracking how you actually feel.',
};

/** Given a numeric value, return which band label it falls into. */
export function bandForValue(cfg: MetricConfig, v: number): string | null {
  for (const b of cfg.bands) {
    if (v >= b.from && v <= b.to) return b.name;
  }
  return null;
}
