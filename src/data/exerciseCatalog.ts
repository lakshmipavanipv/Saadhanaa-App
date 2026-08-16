/**
 * exerciseCatalog — the canonical list of body activities with their
 * icon, benefit blurb, step-by-step how-to, and (optional) contraindications.
 *
 * Kept in a neutral module (no screen imports) so both `ExerciseScreen` and
 * `WellbeingPlanSheet` can consume it without a circular dependency.
 */

import type { BodyActivity } from '../types';

export type Category = 'cardio' | 'strength' | 'flexibility' | 'other';

export interface WorkoutItem {
  id: BodyActivity;
  name: string;
  subtitle: string;
  category: Category;
  durationSec: number;
  icon: string;
  benefit: string;
  steps: string[];
  contraindications?: string;
  ringAutoDetect?: boolean;
}

export const EXERCISE_CATALOG: WorkoutItem[] = [
  {
    id: 'walk', name: 'Walk', subtitle: 'Daily fundamental · cardio',
    category: 'cardio', durationSec: 1800, icon: '🚶',
    benefit: 'The single most underrated practice. 30 min of brisk walking lifts mood, regulates insulin, and trains zone-2 aerobic base.',
    steps: [
      'Aim for a "conversational" pace — you can talk but not sing',
      'Try mindful walking japa — synchronize breath with each 4 steps',
      'Outdoor sunlight in the first hour matters even more than the walk',
      'Target 7-10 k steps/day (ring counts passively)',
    ],
    ringAutoDetect: true,
  },
  {
    id: 'jog', name: 'Jog', subtitle: 'Steady pace · cardio',
    category: 'cardio', durationSec: 1200, icon: '🏃‍♀️',
    benefit: 'Easy aerobic effort — 130-150 bpm. Builds capillary density and fat metabolism without burning out the nervous system.',
    steps: [
      'Nose-breathing only is a good intensity gauge',
      'Land midfoot, soft knees, relaxed shoulders',
      '20 min, 3-4×/week beats 60 min once weekly',
      'Cool down with 5 min walk + 2 min stretching',
    ],
    ringAutoDetect: true,
  },
  {
    id: 'run', name: 'Run', subtitle: 'Endurance · cardio',
    category: 'cardio', durationSec: 1800, icon: '🏃',
    benefit: 'Higher intensity — 160+ bpm. Stresses VO₂ max, lactate threshold. Powerful for cardiovascular age reversal.',
    steps: [
      'Warm-up jog 5 min before any tempo work',
      'Tempo: 20 min at "comfortably hard" pace',
      'Hydrate + protein within 30 min after',
      'Replace one weekly run with hills for power',
    ],
    contraindications: 'Knee/ankle injury, severe asthma without inhaler',
    ringAutoDetect: true,
  },
  {
    id: 'cycle', name: 'Cycle', subtitle: 'Outdoor or stationary · cardio',
    category: 'cardio', durationSec: 1800, icon: '🚴',
    benefit: 'Joint-friendly cardio. Excellent for those who can\'t run. Steady zone-2 work builds mitochondrial density.',
    steps: [
      'Set saddle height: leg almost-straight at bottom',
      'Aim for 80-90 RPM cadence (smooth pedalling)',
      '30-60 min steady, breathing through nose where possible',
      'Hydrate + light carb top-up if > 60 min',
    ],
    ringAutoDetect: true,
  },
  {
    id: 'swim', name: 'Swim', subtitle: 'Full-body low-impact · cardio · manual entry',
    category: 'cardio', durationSec: 1800, icon: '🏊',
    benefit: 'No-impact full-body workout. Builds lung capacity (essentially forced pranayama). Joint relief for arthritis.',
    steps: [
      'Warm up with 4 lengths easy',
      '20-30 min of mixed strokes (freestyle + breaststroke)',
      'Bilateral breathing trains both sides equally',
      'Always shower before & after',
    ],
    ringAutoDetect: false,
  },
  {
    id: 'gym', name: 'Gym / Strength', subtitle: 'Resistance training · strength',
    category: 'strength', durationSec: 2700, icon: '🏋️',
    benefit: 'Lifts bone density, basal metabolic rate, and grip strength — the single strongest predictor of longevity after 50.',
    steps: [
      'Warm-up 5 min easy cardio + dynamic mobility',
      'Compound first: squat / deadlift / row / press',
      '3 sets × 8-12 reps at 70-80% effort',
      'Rest 2-3 min between heavy sets',
      'Train 2-4×/week; muscles grow on rest days',
    ],
    contraindications: 'Acute injury, untreated high BP — see a trainer first',
    ringAutoDetect: true,
  },
  {
    id: 'hiit', name: 'HIIT', subtitle: 'High intensity intervals · cardio + strength',
    category: 'strength', durationSec: 1200, icon: '🔥',
    benefit: 'Maximum aerobic + anaerobic effect in 15-20 min. Boosts mitochondrial biogenesis. Caution: stressful, not daily.',
    steps: [
      'Warm up 5 min thoroughly',
      '30 s all-out (sprint / bike / burpees) — 90 s rest',
      'Repeat 6-8 rounds',
      'Cool down 5 min walk',
      '2-3×/week MAX — recovery matters',
    ],
    contraindications: 'Heart disease, untreated BP, pregnancy, severe joint issues',
    ringAutoDetect: true,
  },
];
