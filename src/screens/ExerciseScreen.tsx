/**
 * ExerciseScreen — body-activity hub, restructured to mirror YogaScreen.
 *
 *   • Header with "+ Log past" button (parallels Yoga)
 *   • KPIs: today's minutes / daily goal
 *   • SoulsyncSessionBar for live tracking
 *   • Ring auto-detect strip — walk/run/jog/steps captured passively
 *   • Today's recommended activities (3 cards, time-of-day-based)
 *   • Category filter chips (All / Cardio / Strength / Recovery)
 *   • Activity cards (Walk, Run, Jog, Cycle, Swim, Gym, HIIT) — each
 *     opens a detail modal mirroring Yoga's: description, target zone,
 *     timer, set reminder, log past
 *   • Recent sessions list
 *
 * Yoga is intentionally NOT in this list — it has its own dedicated tab.
 */

import React, { useEffect, useState, useRef } from 'react';
import {
  StyleSheet, View, Text, ScrollView, TouchableOpacity, Modal, TextInput, Platform,
} from 'react-native';
import { COLORS, SPACING } from '../theme';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';
import { AddToPlanCta } from '../components/AddToPlanCta';
import { useSadhana } from '../context';
import { exerciseRepo } from '../services/exerciseRepo';
import { routineRepo } from '../services/routineRepo';
import { BodyActivity, ExerciseEntry } from '../types';
import { todayStr } from '../utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDefaultRing } from '../soulsync/services/RingTelemetryService';
import { TimePickerField } from '../components/TimePickerField';
import { WeekSparkline } from '../components/WeekSparkline';
import { DUMMY, withFallback } from '../services/dummyData';
import { workoutGoalsRepo, WorkoutGoals, GoalUnit, GOAL_UNIT_META } from '../services/workoutGoalsRepo';
import { getTodaySteps } from '../services/stepTracker';
import { getDB } from '../soulsync/db/database';

// Shared ring instance for stage-mark buzzes during a live session
const ring = createDefaultRing();

type Category = 'cardio' | 'strength' | 'recovery';

export interface WorkoutItem {
  id: BodyActivity;
  name: string;
  subtitle: string;
  category: Category;
  /** Default session length suggested by the card. */
  durationSec: number;
  icon: string;
  /** What the body gets out of it. */
  benefit: string;
  /** Sequenced steps the user can follow. */
  steps: string[];
  /** Optional safety note. */
  contraindications?: string;
  /** If true, the ring auto-classifies this activity by cadence/heart rate. */
  ringAutoDetect: boolean;
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

/** Roughly map an activity to kcal/min (used for the calories KPI). */
const KCAL_PER_MIN: Record<BodyActivity, number> = {
  walk: 4, jog: 8, run: 11, cycle: 8, swim: 9, gym: 6, hiit: 13, yoga: 3,
};

const CATEGORIES: { id: Category | 'all'; label: string; icon: string }[] = [
  { id: 'all',      label: 'All',       icon: '💪' },
  { id: 'cardio',   label: 'Cardio',    icon: '❤️' },
  { id: 'strength', label: 'Strength',  icon: '🏋️' },
];

const fmtSec = (s: number): string =>
  s >= 60 ? `${Math.round(s / 60)} min` : `${s} sec`;

// Per-activity reminder times stored in AsyncStorage
const REMINDER_KEY = 'workout.reminders.v1';
type ReminderMap = Partial<Record<BodyActivity, string>>;  // 'HH:MM'

export const ExerciseScreen = ({ navigation }: any) => {
  const { userProfile, showToast } = useSadhana();
  const goalMin = userProfile?.goals?.bodyMinutesPerDay ?? 30;

  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [selected, setSelected] = useState<WorkoutItem | null>(null);
  const [todayMin, setTodayMin] = useState(0);
  const [breakdown, setBreakdown] = useState<Awaited<ReturnType<typeof exerciseRepo.breakdown>>>([]);
  const [history, setHistory] = useState<ExerciseEntry[]>([]);
  const [reminders, setReminders] = useState<ReminderMap>({});

  // Log past modal state (parallels YogaScreen)
  const [showLog, setShowLog] = useState(false);
  const [logActivity, setLogActivity] = useState<BodyActivity>('walk');
  const [logMin, setLogMin] = useState('30');
  const [logDate, setLogDate] = useState(todayStr());

  // Per-activity goals + 7-day series + today's step count (from ring)
  const [goals, setGoals] = useState<WorkoutGoals>({});
  const [stepsToday, setStepsToday] = useState(0);
  const [weeklyByActivity, setWeeklyByActivity] = useState<Record<BodyActivity, number[]>>({} as any);
  const [stepsWeekly, setStepsWeekly] = useState<number[]>([0,0,0,0,0,0,0]);
  const [editingGoalFor, setEditingGoalFor] = useState<BodyActivity | null>(null);
  const [goalInput, setGoalInput] = useState('');
  // v67: the metric the user picked for this goal (time/steps/calories/distance)
  const [goalUnit, setGoalUnit] = useState<GoalUnit>('min');
  // v58: which activities should render. Walking is always on; everything
  // else only renders if the user has planned it via the Plan tab OR if
  // they've already logged minutes against it (so existing data isn't
  // hidden retroactively).
  const [plannedActivities, setPlannedActivities] = useState<Set<string>>(new Set(['walk']));

  const refresh = async () => {
    setTodayMin(await exerciseRepo.todayMinutes());
    setBreakdown(await exerciseRepo.breakdown(7));
    setHistory((await exerciseRepo.list()).reverse().slice(0, 30));
    setGoals(await workoutGoalsRepo.get());
    try {
      const raw = await AsyncStorage.getItem(REMINDER_KEY);
      setReminders(raw ? JSON.parse(raw) : {});
    } catch { setReminders({}); }
    // Read today's step count from the ring's daily_activity table
    try {
      const db = await getDB();
      const today = todayStr();
      const row = await db.getFirstAsync<{ step_count: number | null }>(
        'SELECT step_count FROM daily_activity WHERE activity_date = ?',
        [today]
      );
      // v73: use the larger of the ring/DB step count and the phone
      // pedometer's accumulated count for today, so the strip reflects
      // whichever source captured more movement.
      const pedSteps = await getTodaySteps().catch(() => 0);
      setStepsToday(Math.max(row?.step_count ?? 0, pedSteps));
      // 7-day step series (oldest first → today last)
      const cutoff = new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
      const rows = await db.getAllAsync<{ activity_date: string; step_count: number }>(
        `SELECT activity_date, step_count FROM daily_activity
         WHERE activity_date >= ? ORDER BY activity_date`,
        [cutoff]
      );
      const series: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const r = rows.find(x => x.activity_date === d);
        series.push(r?.step_count ?? 0);
      }
      setStepsWeekly(series);
    } catch { /* DB may not be ready yet */ }
    // 7-day minute series per activity from exerciseRepo
    const allEntries = await exerciseRepo.list();
    const series: Record<BodyActivity, number[]> = {} as any;
    for (const act of ['walk','jog','run','cycle','swim','gym','hiit','yoga'] as BodyActivity[]) {
      const week: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
        const mins = allEntries
          .filter(e => e.date === d && e.activity === act)
          .reduce((s, e) => s + e.durationMin, 0);
        week.push(mins);
      }
      series[act] = week;
    }
    setWeeklyByActivity(series);

    // v58: compute which activity cards to show.
    //   • walk: ALWAYS visible
    //   • planned items from Plan tab (routineRepo, category 'exercise')
    //   • any activity that already has logged minutes anywhere
    try {
      const routines = await routineRepo.list();
      const planned = new Set<string>(['walk']);
      for (const r of routines) {
        if (r.category !== 'exercise') continue;
        // Match activity by name (case-insensitive) against the EXERCISE_CATALOG ids
        const lc = r.name.toLowerCase();
        for (const a of EXERCISE_CATALOG) {
          if (lc.includes(a.id.toLowerCase()) || lc.includes(a.name.toLowerCase())) {
            planned.add(a.id);
          }
        }
      }
      // Also keep any activity the user has logged history for
      for (const a of EXERCISE_CATALOG) {
        if ((series[a.id as BodyActivity] || []).reduce((s, x) => s + x, 0) > 0) {
          planned.add(a.id);
        }
      }
      setPlannedActivities(planned);
    } catch { /* keep default walk-only */ }
  };
  useEffect(() => { refresh(); }, []);

  const submitLog = async () => {
    const m = parseInt(logMin, 10);
    if (!m || m <= 0) { showToast('Enter minutes'); return; }
    await exerciseRepo.add({ activity: logActivity, durationMin: m, date: logDate });
    showToast(`✓ Logged ${m} min ${logActivity} on ${logDate}`);
    setShowLog(false); setLogMin('30');
    refresh();
  };

  const setReminder = async (activity: BodyActivity, time: string) => {
    const next = { ...reminders, [activity]: time };
    setReminders(next);
    await AsyncStorage.setItem(REMINDER_KEY, JSON.stringify(next));
    showToast(`⏰ ${activity} reminder set for ${time}`);
  };

  // Time-of-day recommendation
  const recommended = React.useMemo(() => {
    const h = new Date().getHours();
    if (h < 10)  return EXERCISE_CATALOG.filter(i => ['walk', 'jog', 'cycle'].includes(i.id)).slice(0, 3);
    if (h < 17)  return EXERCISE_CATALOG.filter(i => ['gym', 'hiit', 'swim'].includes(i.id)).slice(0, 3);
    return            EXERCISE_CATALOG.filter(i => ['walk', 'cycle', 'swim'].includes(i.id)).slice(0, 3);
  }, []);

  const filtered = filter === 'all' ? EXERCISE_CATALOG : EXERCISE_CATALOG.filter(i => i.category === filter);
  const goalPct = Math.min(100, Math.round((todayMin / goalMin) * 100));
  const autoDetectCount = EXERCISE_CATALOG.filter(i => i.ringAutoDetect).length;

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Header — title + Log past button (parallels Yoga) */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Workout</Text>
              <Text style={styles.subtitle}>Cardio · strength · ring-tracked daily movement</Text>
            </View>
            <TouchableOpacity style={styles.logBtn} onPress={() => { setLogActivity('walk'); setShowLog(true); }}>
              <Text style={styles.logBtnText}>+ Log past</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* KPI: today's minutes / goal */}
        <View style={styles.kpiCard}>
          <Text style={styles.kpiLabel}>WORKOUT MINUTES TODAY</Text>
          <Text style={styles.kpiBig}>
            {todayMin} <Text style={styles.kpiSmall}>/ {goalMin} min</Text>
          </Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${goalPct}%` }]} />
          </View>
          <Text style={styles.kpiHint}>
            {goalPct >= 100
              ? '🎉 Goal complete — beautiful work for your body'
              : todayMin === 0
                ? 'Tap any activity below to start, or it auto-logs via the ring'
                : `${goalMin - todayMin} more min to reach today's goal`}
          </Text>
        </View>

        {/* v72: since-morning summary — steps + calories at a glance */}
        {(() => {
          const steps = withFallback(stepsToday, DUMMY.stepsToday ?? 3200);
          const kcal = Math.round(steps * 0.04 + todayMin * 5);
          const km = (steps * 0.000762).toFixed(2);   // ~0.762 m per step
          return (
            <View style={styles.sinceMorningRow}>
              <View style={styles.sinceCell}>
                <Text style={styles.sinceVal}>{steps.toLocaleString()}</Text>
                <Text style={styles.sinceLabel}>👟 steps{'\n'}since morning</Text>
              </View>
              <View style={styles.sinceDivider} />
              <View style={styles.sinceCell}>
                <Text style={styles.sinceVal}>{kcal.toLocaleString()}</Text>
                <Text style={styles.sinceLabel}>🔥 kcal{'\n'}burnt</Text>
              </View>
              <View style={styles.sinceDivider} />
              <View style={styles.sinceCell}>
                <Text style={styles.sinceVal}>{km}</Text>
                <Text style={styles.sinceLabel}>📏 km{'\n'}covered</Text>
              </View>
            </View>
          );
        })()}

        {/* v58: quick gateway to Plan tab — add a new exercise routine
            without having to remember where Plan lives. */}
        <AddToPlanCta
          label="an exercise"
          onPress={() => navigation?.navigate?.('Plan')}
        />

        {/* Soulsync — start before any workout to capture HRV / BPM */}
        <SoulsyncSessionBar
          practice="exercise"
          onViewInsights={() => navigation?.navigate?.('History')}
        />

        {/* v58: only show walking by default + activities the user has
            planned (via Plan tab) or has already logged history for.
            Keeps the screen calm; other activities appear automatically
            once added to the plan. */}
        {EXERCISE_CATALOG
          .filter(a => a.id !== 'yoga' && plannedActivities.has(a.id))
          .map(item => {
          const isWalk = item.id === 'walk';
          const todaySeries = weeklyByActivity[item.id] ?? [0,0,0,0,0,0,0];
          const thisWeekMin = todaySeries.reduce((s, x) => s + x, 0);
          const todayActivityMin = todaySeries[todaySeries.length - 1] || 0;
          // ── Apply dummy fallback per-activity for elegant first-use UX ──
          const fbSteps = withFallback(stepsToday, DUMMY.stepsToday);
          const fbStepsWeekly = withFallback(stepsWeekly, DUMMY.weeklySteps);
          const fbActivityMin = withFallback(todayActivityMin, isWalk ? 0 : Math.round(15 + Math.random() * 10));
          // Walk uses ring step count, others use logged minutes
          const todayValue = isWalk ? fbSteps : fbActivityMin;
          // v67: prefer the user's chosen value+unit; fall back to legacy.
          const savedUnit = goals.goalUnit?.[item.id];
          const savedVal  = goals.goalValue?.[item.id];
          const cardUnit: GoalUnit = savedUnit ?? (isWalk ? 'steps' : 'min');
          const legacyKey = isWalk ? 'walkSteps' : (`${item.id}Min` as keyof WorkoutGoals);
          const goalVal = savedVal ?? (goals[legacyKey] as number) ?? (isWalk ? 6000 : 30);
          const pct = Math.min(100, Math.round((todayValue / Math.max(1, goalVal)) * 100));
          const sparkSeries = isWalk ? fbStepsWeekly : (todaySeries.every(x => x === 0) ? DUMMY.workoutWeek : todaySeries);
          // Calories — uses fallback step count when no real data
          const calories = isWalk
            ? Math.round(fbSteps * 0.04)
            : Math.round(fbActivityMin * (KCAL_PER_MIN[item.id] || 5));
          // Last session
          const lastSession = history.find(h => h.activity === item.id);
          const daysSince = lastSession
            ? Math.round((Date.now() - new Date(lastSession.date).getTime()) / 86400000)
            : null;

          return (
            <View key={item.id} style={styles.activityMetricCard}>
              <View style={styles.amHeader}>
                <Text style={styles.amIcon}>{item.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amName}>{item.name}</Text>
                  <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}>
                    {item.ringAutoDetect ? (
                      <View style={styles.autoBadge}>
                        <Text style={styles.autoBadgeText}>📡 auto by ring</Text>
                      </View>
                    ) : (
                      <View style={styles.manualBadge}>
                        <Text style={styles.manualBadgeText}>✍️ manual entry</Text>
                      </View>
                    )}
                    {reminders[item.id] && (
                      <View style={styles.reminderBadge}>
                        <Text style={styles.reminderBadgeText}>⏰ {reminders[item.id]}</Text>
                      </View>
                    )}
                  </View>
                </View>
                <TouchableOpacity style={styles.trendBtn} onPress={() => setSelected(item)}>
                  <Text style={styles.trendBtnText}>↗ Details</Text>
                </TouchableOpacity>
              </View>

              {/* Primary metric */}
              <View style={styles.amPrimary}>
                <Text style={styles.amPrimaryLabel}>
                  {isWalk ? 'STEPS TODAY' : 'MINUTES TODAY'}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                  <Text style={styles.amPrimaryValue}>
                    {todayValue.toLocaleString()}
                  </Text>
                  <Text style={styles.amPrimaryGoal}>
                    {' '}/ {goalVal.toLocaleString()} {GOAL_UNIT_META[cardUnit].short}
                  </Text>
                  <TouchableOpacity
                    style={styles.editGoalBtn}
                    onPress={() => { setEditingGoalFor(item.id); setGoalInput(String(goalVal)); setGoalUnit(cardUnit); }}
                  >
                    <Text style={styles.editGoalText}>✎ goal</Text>
                  </TouchableOpacity>
                </View>
                <View style={styles.amProgressTrack}>
                  <View style={[styles.amProgressFill, { width: `${pct}%` }]} />
                </View>
              </View>

              {/* This-week sparkline */}
              <Text style={styles.amSubLabel}>THIS WEEK</Text>
              <WeekSparkline values={sparkSeries} height={48} />
              <Text style={styles.amWeekTotal}>
                Week total · {(isWalk
                  ? sparkSeries.reduce((s, x) => s + x, 0)
                  : thisWeekMin
                ).toLocaleString()} {isWalk ? 'steps' : 'min'}
              </Text>

              {/* Secondary KPI grid */}
              <View style={styles.amKpiGrid}>
                <View style={styles.amKpiCell}>
                  <Text style={styles.amKpiValue}>
                    {isWalk ? DUMMY.hrActiveMinutesToday : Math.round(fbActivityMin * 0.7)}
                  </Text>
                  <Text style={styles.amKpiLabel}>❤️ HR active{'\n'}min</Text>
                </View>
                <View style={styles.amKpiCell}>
                  <Text style={styles.amKpiValue}>{calories}</Text>
                  <Text style={styles.amKpiLabel}>🔥 Calories</Text>
                </View>
                <View style={styles.amKpiCell}>
                  <Text style={styles.amKpiValue}>
                    {isWalk
                      ? Math.round(fbSteps / 100)
                      : fbActivityMin}
                  </Text>
                  <Text style={styles.amKpiLabel}>⏱ Minutes{'\n'}today</Text>
                </View>
              </View>

              {/* Manual log CTA — only when user must add session */}
              {!item.ringAutoDetect && (
                <TouchableOpacity
                  style={styles.amLogBtn}
                  onPress={() => { setLogActivity(item.id); setShowLog(true); }}
                >
                  <Text style={styles.amLogBtnText}>+ Log a {item.name.toLowerCase()} session</Text>
                </TouchableOpacity>
              )}
              {!!daysSince && lastSession && (
                <Text style={styles.amLastSession}>
                  Last session: {daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}
                  {` · ${lastSession.durationMin} min`}
                </Text>
              )}
            </View>
          );
        })}
      </ScrollView>

      {/* Edit goal modal */}
      <Modal
        visible={editingGoalFor !== null}
        transparent animationType="fade"
        onRequestClose={() => setEditingGoalFor(null)}
      >
        <View style={styles.goalOverlay}>
          <View style={styles.goalCard}>
            <Text style={styles.goalTitle}>
              Set daily goal · {editingGoalFor && EXERCISE_CATALOG.find(a => a.id === editingGoalFor)?.name}
            </Text>
            <Text style={styles.goalHint}>Measure this goal by:</Text>
            {/* v67: metric selector — time / steps / calories / distance */}
            <View style={styles.unitRow}>
              {(['min','steps','kcal','km'] as GoalUnit[]).map(u => {
                const on = goalUnit === u;
                return (
                  <TouchableOpacity
                    key={u}
                    style={[styles.unitChip, on && styles.unitChipOn]}
                    onPress={() => setGoalUnit(u)}
                  >
                    <Text style={[styles.unitChipText, on && styles.unitChipTextOn]}>
                      {GOAL_UNIT_META[u].icon} {GOAL_UNIT_META[u].label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              style={styles.goalInput}
              value={goalInput}
              onChangeText={setGoalInput}
              keyboardType="number-pad"
              placeholder={goalUnit === 'steps' ? '6000' : goalUnit === 'kcal' ? '300' : goalUnit === 'km' ? '5' : '20'}
              placeholderTextColor={COLORS.muted}
            />
            <Text style={styles.goalUnitCaption}>
              target in {GOAL_UNIT_META[goalUnit].short} per day
            </Text>
            <View style={{ flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.md }}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditingGoalFor(null)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveBtn}
                onPress={async () => {
                  if (!editingGoalFor) return;
                  const v = parseInt(goalInput, 10) || 0;
                  if (v <= 0) { showToast('Enter a positive number'); return; }
                  await workoutGoalsRepo.setGoal(editingGoalFor, v, goalUnit);
                  showToast(`✓ Goal saved · ${v} ${GOAL_UNIT_META[goalUnit].short}`);
                  setEditingGoalFor(null);
                  refresh();
                }}
              >
                <Text style={styles.saveText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Detail modal — mirrors YogaDetailModal */}
      {selected && (
        <WorkoutDetailModal
          item={selected}
          existingReminder={reminders[selected.id]}
          onSetReminder={t => setReminder(selected.id, t)}
          onLogPast={() => { setLogActivity(selected.id); setShowLog(true); setSelected(null); }}
          onClose={() => setSelected(null)}
        />
      )}

      {/* Log past modal */}
      <Modal visible={showLog} transparent animationType="slide" onRequestClose={() => setShowLog(false)}>
        <View style={styles.logOverlay}>
          <View style={styles.logCard}>
            <View style={styles.logHandle} />
            <Text style={styles.logTitle}>Log past workout</Text>
            <Text style={styles.logHint}>Add minutes you've already done.</Text>

            <Text style={styles.logFieldLabel}>Activity</Text>
            <View style={styles.activityPickerRow}>
              {EXERCISE_CATALOG.map(i => (
                <TouchableOpacity
                  key={i.id}
                  style={[styles.activityPickerChip, logActivity === i.id && styles.activityPickerChipActive]}
                  onPress={() => setLogActivity(i.id)}
                >
                  <Text style={styles.activityPickerIcon}>{i.icon}</Text>
                  <Text style={[styles.activityPickerLabel, logActivity === i.id && styles.activityPickerLabelActive]}>
                    {i.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.logFieldLabel}>Minutes</Text>
            <TextInput
              style={styles.logInput}
              value={logMin}
              onChangeText={setLogMin}
              placeholder="30"
              placeholderTextColor={COLORS.muted}
              keyboardType="number-pad"
            />
            <Text style={styles.logFieldLabel}>Date</Text>
            <TextInput
              style={styles.logInput}
              value={logDate}
              onChangeText={setLogDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={COLORS.muted}
            />
            <TouchableOpacity style={styles.logSubmit} onPress={submitLog}>
              <Text style={styles.logSubmitText}>Log this</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowLog(false)}>
              <Text style={styles.logCancel}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ─── Workout Detail Modal (mirrors YogaDetailModal) ─────────────

const WorkoutDetailModal: React.FC<{
  item: WorkoutItem;
  existingReminder?: string;
  onSetReminder: (time: string) => void;
  onLogPast: () => void;
  onClose: () => void;
}> = ({ item, existingReminder, onSetReminder, onLogPast, onClose }) => {
  const [remaining, setRemaining] = useState(item.durationSec);
  const [running, setRunning] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!running) return;
    tickRef.current = setInterval(() => {
      setRemaining(r => {
        const next = r - 1;
        if (next > 0 && next % 60 === 0) {
          ring.buzz({ pattern: [120], intensity: 'soft' }).catch(() => {});
        }
        if (next <= 0) {
          setRunning(false);
          ring.buzz({ pattern: [250, 120, 250, 120, 400], intensity: 'medium' }).catch(() => {});
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => { if (tickRef.current) clearInterval(tickRef.current); };
  }, [running]);

  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.detailName}>{item.icon}  {item.name}</Text>
                <Text style={styles.detailSub}>{item.subtitle}</Text>
              </View>
              <TouchableOpacity onPress={onClose}><Text style={styles.modalClose}>✕</Text></TouchableOpacity>
            </View>

            <Text style={styles.detailBenefit}>{item.benefit}</Text>

            {/* Auto-detect status */}
            {item.ringAutoDetect && (
              <View style={styles.autoDetectInline}>
                <Text style={styles.autoDetectInlineText}>
                  📡 Auto-captured by ring — start moving and it logs itself.
                  Manual session below is optional.
                </Text>
              </View>
            )}

            {/* Timer (parallels Yoga) */}
            <View style={styles.timerCard}>
              <Text style={styles.timerClock}>{mm}:{ss}</Text>
              <View style={styles.timerBtnRow}>
                {!running ? (
                  <TouchableOpacity style={styles.timerBtnPrimary} onPress={() => setRunning(true)}>
                    <Text style={styles.timerBtnPrimaryText}>▶ Start</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.timerBtnSecondary} onPress={() => setRunning(false)}>
                    <Text style={styles.timerBtnSecondaryText}>⏸ Pause</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  style={styles.timerBtnSecondary}
                  onPress={() => { setRunning(false); setRemaining(item.durationSec); }}
                >
                  <Text style={styles.timerBtnSecondaryText}>↺ Reset</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reminder + Log past actions */}
            <View style={styles.actionRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.actionBtnText}>
                  🕐 {existingReminder ? `Reminder: ${existingReminder}` : 'Set daily reminder'}
                </Text>
                <TimePickerField
                  value={existingReminder ?? null}
                  onChange={onSetReminder}
                  placeholder="Tap to open clock"
                />
              </View>
              <TouchableOpacity style={styles.actionBtn} onPress={onLogPast}>
                <Text style={styles.actionBtnText}>+ Log past minutes</Text>
              </TouchableOpacity>
            </View>

            <Text style={styles.sectionLabel}>STEPS</Text>
            {item.steps.map((s, i) => (
              <View key={i} style={styles.stepRow}>
                <Text style={styles.stepBullet}>•</Text>
                <Text style={styles.stepText}>{s}</Text>
              </View>
            ))}

            {item.contraindications && (
              <View style={styles.warnBox}>
                <Text style={styles.warnLabel}>⚠️ AVOID IF</Text>
                <Text style={styles.warnText}>{item.contraindications}</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ─── Styles (parallel to YogaScreen for visual consistency) ─────

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  content: { paddingVertical: SPACING.lg, paddingBottom: 80 },
  header: { paddingHorizontal: SPACING.md, marginBottom: SPACING.md },
  title: { fontSize: 24, color: COLORS.cream, fontWeight: '600' },
  subtitle: { fontSize: 12, color: COLORS.muted, marginTop: 4 },

  logBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.12)',
  },
  logBtnText: { color: COLORS.gold, fontSize: 11, fontWeight: '700' },

  kpiCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.lg, backgroundColor: COLORS.cardBg,
    borderRadius: 16, borderWidth: 2, borderColor: COLORS.gold,
    alignItems: 'center',
  },
  kpiLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  kpiBig: { fontSize: 38, color: COLORS.gold, fontWeight: '700' },
  kpiSmall: { fontSize: 14, color: COLORS.muted, fontWeight: '500' },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, marginVertical: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: COLORS.gold },
  kpiHint: { fontSize: 12, color: COLORS.cream, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  // v72: since-morning summary strip (steps · kcal · km)
  sinceMorningRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    paddingVertical: SPACING.md, borderRadius: 14,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: 'rgba(78,168,222,0.30)',
  },
  sinceCell: { flex: 1, alignItems: 'center' },
  sinceVal: { color: COLORS.cream, fontSize: 20, fontWeight: '800' },
  sinceLabel: { color: COLORS.muted, fontSize: 10, textAlign: 'center', marginTop: 3, lineHeight: 13 },
  sinceDivider: { width: 1, height: 34, backgroundColor: 'rgba(255,255,255,0.08)' },

  autoDetectCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: 'rgba(78, 168, 222, 0.10)',
    borderRadius: 12, borderWidth: 1, borderColor: 'rgba(78,168,222,0.35)',
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
  },
  autoDetectLabel: {
    fontSize: 10, color: '#4ea8de', fontWeight: '800',
    letterSpacing: 1.2, marginBottom: 4,
  },
  autoDetectText: { fontSize: 12, color: COLORS.cream, lineHeight: 17 },

  recCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  recLabel: { fontSize: 10, color: COLORS.gold, fontWeight: '700', letterSpacing: 1.2, marginBottom: SPACING.sm },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  recIcon: { fontSize: 22, marginRight: SPACING.sm, width: 32 },
  recName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  recSub: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },
  recDur: { fontSize: 11, color: COLORS.gold, fontWeight: '600' },

  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  filterChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  filterIcon: { fontSize: 13 },
  filterLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  filterLabelActive: { color: COLORS.gold },

  listCard: {
    marginHorizontal: SPACING.md, marginBottom: 8,
    padding: SPACING.md, backgroundColor: COLORS.cardBg, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: COLORS.border,
  },
  listIcon: { fontSize: 28 },
  listName: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  listSub: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 1 },
  listBenefit: { fontSize: 11, color: COLORS.cream, marginTop: 4, opacity: 0.85, lineHeight: 15 },
  listDur: { fontSize: 11, color: COLORS.gold, fontWeight: '600', marginLeft: SPACING.sm },

  // ── Samsung-Health-style activity metric card ──
  activityMetricCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  amHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  amIcon: { fontSize: 30, width: 42, textAlign: 'center', marginRight: 6 },
  amName: { color: COLORS.cream, fontSize: 17, fontWeight: '800' },
  trendBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.12)',
  },
  trendBtnText: { color: COLORS.gold, fontSize: 11, fontWeight: '700' },

  amPrimary: { marginVertical: SPACING.sm },
  amPrimaryLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  amPrimaryValue: { fontSize: 30, color: COLORS.gold, fontWeight: '800', lineHeight: 32 },
  amPrimaryGoal: { fontSize: 13, color: COLORS.muted, fontWeight: '500' },
  editGoalBtn: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: COLORS.border },
  editGoalText: { color: COLORS.muted, fontSize: 10, fontWeight: '700' },
  amProgressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  amProgressFill: { height: '100%', backgroundColor: COLORS.gold },

  amSubLabel: { fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.2, marginTop: SPACING.sm, marginBottom: 4 },
  amWeekTotal: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 2 },

  amKpiGrid: { flexDirection: 'row', marginTop: SPACING.sm, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8 },
  amKpiCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  amKpiValue: { fontSize: 16, color: COLORS.cream, fontWeight: '700' },
  amKpiLabel: { fontSize: 9, color: COLORS.muted, fontWeight: '600', textAlign: 'center', marginTop: 3, letterSpacing: 0.3 },

  manualBadge: { backgroundColor: 'rgba(255,184,0,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  manualBadgeText: { fontSize: 9, color: COLORS.gold, fontWeight: '700' },

  amLogBtn: {
    marginTop: SPACING.sm, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.15)', borderWidth: 1, borderColor: COLORS.gold,
    alignItems: 'center',
  },
  amLogBtnText: { color: COLORS.gold, fontWeight: '700', fontSize: 13 },
  amLastSession: { fontSize: 11, color: COLORS.muted, fontStyle: 'italic', marginTop: 6, textAlign: 'center' },

  // Goal edit modal
  goalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  goalCard: { width: '100%', maxWidth: 360, backgroundColor: COLORS.darkBg, borderRadius: 16, padding: SPACING.lg, borderWidth: 1, borderColor: COLORS.gold },
  goalTitle: { color: COLORS.cream, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  goalHint: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.md },
  goalInput: { backgroundColor: COLORS.cardBg, borderRadius: 10, padding: SPACING.md, color: COLORS.cream, fontSize: 18, fontWeight: '700', borderWidth: 1, borderColor: COLORS.border, textAlign: 'center' },
  // v67: metric selector chips
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  unitChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg },
  unitChipOn: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  unitChipText: { color: COLORS.muted, fontSize: 13, fontWeight: '700' },
  unitChipTextOn: { color: COLORS.gold },
  goalUnitCaption: { color: COLORS.muted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: COLORS.border, alignItems: 'center' },
  cancelText: { color: COLORS.muted, fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: 10, backgroundColor: COLORS.gold, alignItems: 'center' },
  saveText: { color: COLORS.deep, fontSize: 14, fontWeight: '700' },

  autoBadge: {
    backgroundColor: 'rgba(78,168,222,0.18)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  autoBadgeText: { fontSize: 9, color: '#4ea8de', fontWeight: '700' },
  reminderBadge: {
    backgroundColor: 'rgba(212,160,23,0.18)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  reminderBadgeText: { fontSize: 9, color: COLORS.gold, fontWeight: '700' },

  sectionLabel: {
    fontSize: 10, color: COLORS.muted, fontWeight: '700', letterSpacing: 1.5,
    marginHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: SPACING.sm,
  },

  breakdownCard: {
    marginHorizontal: SPACING.md,
    padding: SPACING.md, backgroundColor: COLORS.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: COLORS.border,
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  breakdownIcon: { fontSize: 20, width: 28 },
  breakdownLabel: { flex: 1, color: COLORS.cream, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  breakdownCount: { color: COLORS.muted, fontSize: 11, marginRight: SPACING.sm },
  breakdownMin: { color: COLORS.gold, fontSize: 13, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyLabel: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  historyDate: { color: COLORS.muted, fontSize: 11, marginTop: 2 },
  deleteX: { color: COLORS.error, fontSize: 16, padding: 4 },

  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: COLORS.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '88%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  modalClose: { color: COLORS.muted, fontSize: 18, padding: 4 },
  detailName: { fontSize: 22, color: COLORS.cream, fontWeight: '700' },
  detailSub:  { fontSize: 13, color: COLORS.gold, fontStyle: 'italic', marginTop: 2 },
  detailBenefit: { fontSize: 13, color: COLORS.cream, lineHeight: 19, marginBottom: SPACING.md },

  autoDetectInline: {
    padding: SPACING.sm, marginBottom: SPACING.md,
    backgroundColor: 'rgba(78,168,222,0.12)', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#4ea8de',
  },
  autoDetectInlineText: { fontSize: 12, color: COLORS.cream, lineHeight: 17 },

  timerCard: {
    backgroundColor: COLORS.cardBg, borderRadius: 12,
    padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)',
  },
  timerClock: { fontSize: 44, color: COLORS.gold, fontWeight: '700', letterSpacing: 2 },
  timerBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  timerBtnPrimary: { backgroundColor: COLORS.gold, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: 8 },
  timerBtnPrimaryText: { color: COLORS.deep, fontWeight: '700' },
  timerBtnSecondary: { borderColor: COLORS.border, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 8 },
  timerBtnSecondaryText: { color: COLORS.cream, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  actionBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: SPACING.sm,
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
    backgroundColor: COLORS.cardBg, alignItems: 'center',
  },
  actionBtnText: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },

  stepRow: { flexDirection: 'row', paddingVertical: 4 },
  stepBullet: { color: COLORS.gold, fontSize: 14, marginRight: 6 },
  stepText: { flex: 1, fontSize: 13, color: COLORS.cream, lineHeight: 18 },

  warnBox: {
    marginTop: SPACING.md, padding: SPACING.sm,
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderRadius: 8, borderLeftWidth: 3, borderLeftColor: COLORS.saffron,
  },
  warnLabel: { fontSize: 10, color: COLORS.saffron, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  warnText: { fontSize: 12, color: COLORS.cream, lineHeight: 17 },

  // Log past modal
  logOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  logCard: {
    backgroundColor: COLORS.darkBg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
  },
  logHandle: { width: 40, height: 4, backgroundColor: COLORS.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  logTitle: { fontSize: 18, color: COLORS.cream, fontWeight: '700', marginBottom: 4 },
  logHint:  { fontSize: 12, color: COLORS.muted, marginBottom: SPACING.md },
  logFieldLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 4, marginTop: 8 },
  logInput: {
    backgroundColor: COLORS.cardBg, borderRadius: 10, padding: SPACING.sm,
    color: COLORS.cream, fontSize: 16, borderWidth: 1, borderColor: COLORS.border,
  },
  logSubmit: {
    backgroundColor: COLORS.gold, padding: SPACING.md, borderRadius: 10,
    marginTop: SPACING.md, alignItems: 'center',
  },
  logSubmitText: { color: COLORS.deep, fontWeight: '700', fontSize: 15 },
  logCancel: {
    color: COLORS.muted, fontSize: 13, textAlign: 'center', marginTop: SPACING.sm,
  },
  activityPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  activityPickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: COLORS.border, backgroundColor: COLORS.cardBg,
  },
  activityPickerChipActive: { borderColor: COLORS.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  activityPickerIcon: { fontSize: 14 },
  activityPickerLabel: { fontSize: 11, color: COLORS.muted, fontWeight: '600' },
  activityPickerLabelActive: { color: COLORS.gold },
});
