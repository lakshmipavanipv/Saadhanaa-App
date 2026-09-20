/**
 * ExerciseScreen — body-activity hub, restructured to mirror YogaScreen.
 *
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
import { COLORS, SPACING, DRAWER_CLEARANCE } from '../theme';
import { RangeBar } from './health/RangeBar';
import { useTheme } from '../ThemeContext';
import { PlanWellbeingButton } from '../components/PlanWellbeingButton';
import { PracticeHeader } from '../components/PracticeHeader';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';
import { useSoulsync } from '../soulsync/SoulsyncContext';
import { LiveVitalsTrends } from '../soulsync/components/LiveVitalsTrends';
import { SessionVitalsReport } from '../soulsync/components/SessionVitalsReport';
import { useToday } from '../services/dayRollover';
// AddToPlanCta removed — the big 🎯 Plan Your Wellbeing tile on this screen
// (and the drawer's ☰ → Plan Your Wellbeing) both navigate to the Plan tab's
// 4-step wizard, so no in-screen modal is needed.
import { useSadhana } from '../context';
import { exerciseRepo } from '../services/exerciseRepo';
import { routineRepo } from '../services/routineRepo';
import { BodyActivity, ExerciseEntry } from '../types';
import { todayStr, isoDayOf } from '../utils';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createDefaultRing } from '../soulsync/services/RingTelemetryService';
import { TimePickerField } from '../components/TimePickerField';
import { ActivityBox } from '../components/ActivityBox';
import { workoutGoalsRepo, WorkoutGoals, GoalUnit, GOAL_UNIT_META } from '../services/workoutGoalsRepo';
import { getRingStepsToday } from '../soulsync/ring';
import { getDB } from '../soulsync/db/database';

// Catalog moved to `src/data/exerciseCatalog.ts` so the WellbeingPlanSheet
// can consume it without a circular dependency. Import for local use here,
// then re-export so screens that already `import from './ExerciseScreen'`
// don't need to change.
import { EXERCISE_CATALOG, type WorkoutItem, type Category } from '../data/exerciseCatalog';

// Shared ring instance for stage-mark buzzes during a live session
const ring = createDefaultRing();
export { EXERCISE_CATALOG, type WorkoutItem };

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
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const { userProfile, showToast } = useSadhana();
  const goalMin = userProfile?.goals?.bodyMinutesPerDay ?? 30;

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
  /**
   * The ring's OWN distance, calorie and active-hour figures for today.
   *
   * These arrive in the same records as the step counts and were previously
   * decoded and thrown away, while the screen showed `steps * 0.000762` km and
   * `steps * 0.04` kcal -- a generic stride and a generic cost per step,
   * neither measured from this body or this walk. Null until the ring has been
   * read, and rendered as a dash rather than as an estimate.
   */
  const [walkKm, setWalkKm] = useState<number | null>(null);
  const [walkKcal, setWalkKcal] = useState<number | null>(null);
  const [walkHours, setWalkHours] = useState<number | null>(null);
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
  /**
   * This screen's Soul Sync sitting.
   *
   * Owned here and handed to the bar, so the live charts below read the same
   * state the bar is driving. See the bar's `session` prop for what happens
   * when a screen forgets — which is what this screen used to do.
   */
  const soulsync = useSoulsync();
  /** Bumped when a sitting ends so the report card re-reads it. */
  const [vitalsEpoch, setVitalsEpoch] = useState(0);
  // Calendar week strip — user can pick a day to view (display-only for now).
  // The local selectedDay is gone. It was read by nothing except the strip
  // that set it, so tapping a day highlighted a circle and left every number
  // on the screen showing today — a calendar that looked like it filtered and
  // did not. The shared range replaces it, and other tabs follow it.

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
      const row = await db.getFirstAsync<{
        step_count: number | null; distance_km: number | null;
        calorie_kcal: number | null; active_hours: number | null;
      }>(
        `SELECT step_count, distance_km, calorie_kcal, active_hours
           FROM daily_activity WHERE activity_date = ?`,
        [today]
      );
      /*
       * The ring is the source of truth for steps. The phone pedometer is not
       * consulted at all.
       *
       * This used to show max(ring, phone). Two sensors measuring the same
       * legs cannot be combined that way: taking the larger means the count
       * always follows whichever is MORE wrong in the upward direction, and it
       * can never come down. When the phone's accumulator inflated, it won
       * permanently, and no amount of correctness on the ring side could show
       * through.
       *
       * The ring is also the better instrument here — it is on the body all
       * day, whereas the phone only counts while it is being carried and the
       * app is awake.
       */
      setStepsToday(row?.step_count ?? 0);
      setWalkKm(row?.distance_km ?? null);
      setWalkKcal(row?.calorie_kcal ?? null);
      setWalkHours(row?.active_hours ?? null);

      // Then refresh from the ring itself (5-8 s: connect → sync → disconnect).
      // Its answer replaces the stored one rather than being maxed with it, so
      // a corrected count can go down as well as up.
      void getRingStepsToday()
        .then((ringToday) => {
          if (!ringToday) return;
          setStepsToday(ringToday.steps);
          setWalkKm(ringToday.distanceKm);
          setWalkKcal(ringToday.calorieKcal);
          // One hourly record with steps in it is one hour the body moved.
          setWalkHours(ringToday.sampleCount);
        })
        .catch(() => { /* keep the stored ring count */ });
      // 7-day step series (oldest first → today last)
      const cutoff = isoDayOf(new Date(Date.now() - 6 * 86400000));
      const rows = await db.getAllAsync<{ activity_date: string; step_count: number }>(
        `SELECT activity_date, step_count FROM daily_activity
         WHERE activity_date >= ? ORDER BY activity_date`,
        [cutoff]
      );
      const series: number[] = [];
      for (let i = 6; i >= 0; i--) {
        const d = isoDayOf(new Date(Date.now() - i * 86400000));
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
        const d = isoDayOf(new Date(Date.now() - i * 86400000));
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
  /**
   * Re-read when the date turns over, not only on mount.
   *
   * `refresh()` computes `todayStr()` internally, so an app left open across
   * midnight kept asking for yesterday's `daily_activity` row and kept
   * displaying yesterday's step count — which is what "the steps never reset"
   * looked like from the outside. The counters were fine; nobody asked again.
   */
  const today = useToday();
  useEffect(() => { refresh(); }, [today]);

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

  // The category filter was never wired to a control: `filter` was created as
  // 'all' and no code ever changed it, so this branch only ever took the first
  // path. Kept as the plain list until there is a picker to drive it.
  const filtered = EXERCISE_CATALOG;
  const goalPct = Math.min(100, Math.round((todayMin / goalMin) * 100));
  const autoDetectCount = EXERCISE_CATALOG.filter(i => i.ringAutoDetect).length;

  return (
    <View style={[styles.container, { backgroundColor: palette.deep }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* One shared header, so the 🎯 button is in the same corner on every
             practice tab. See components/PracticeHeader. */}
        {/* No "+ Log past" here. Walking is the activity the header defaulted
            it to, and walking is counted by the ring — offering to type it in
            by hand invited a second, conflicting number for the same steps.
            The activities that DO need manual entry carry their own log button
            inside their card, where it belongs to the thing being logged. */}
        <PracticeHeader
          title="🏃 Workout"
          subtitle="Cardio · strength · ring-tracked daily movement"
          preset="exercise"
          navigation={navigation}
          onSynced={() => { void refresh(); }}
        />

        {/* Shared Day / Week / Month — one date across Japa, Yoga, Meditate,
            Exercise and the health reports. Sits below the header rather than
            inside it: the header's inner View is a flex row, and dropping a
            full-width segmented control in there squeezed it between the title
            and the Plan button. */}
        <RangeBar />

        {/*
          The "WORKOUT MINUTES TODAY" card and the steps / kcal / km strip that
          stood here are gone. Both repeated what the activity cards below
          already show -- the minutes card restated the same logged minutes, and
          the strip restated the walk card's steps and calories -- so one figure
          appeared two and three times on a single screen with nothing to say
          which was authoritative. The walk card now carries distance too, which
          was the only thing the strip had that the card did not.
        */}

        {/* Plan-Your-Wellbeing lives in the drawer + a big accent tile on this
            screen. In-line CTA removed for consistency across all tabs. */}

        {/* Soulsync — start before any workout to capture HRV / BPM.

            The screen owns the hook and hands it down. Without `session` the
            bar forked its OWN isolated instance, so this screen could not see
            a single reading from the session it had just started: no live
            chart, no vitals, nothing to refresh when it ended. Japa, Yoga and
            Meditation all pass the hook down; Exercise was the odd one out,
            which is exactly why "start soul sync" looked like it stored
            nothing here. */}
        <SoulsyncSessionBar
          practice="exercise"
          session={soulsync}
          onSessionEnd={() => { refresh(); setVitalsEpoch((n) => n + 1); }}
          onViewInsights={() => navigation?.navigate?.('History')}
        />

        {/* Live HR / SpO2 / HRV while the workout is recording. */}
        {soulsync.state.active && (
          <LiveVitalsTrends
            bpmSeries={soulsync.state.bpmSeries}
            liveSpo2={soulsync.state.liveSpo2}
            liveHrv={soulsync.state.liveHrv}
            isActive={soulsync.state.active}
          />
        )}

        {/* What the sitting measured, once it is over. */}
        <SessionVitalsReport practice="exercise" refreshKey={vitalsEpoch} />

        {/* v58: only show walking by default + activities the user has
            planned (via Plan tab) or has already logged history for.
            Keeps the screen calm; other activities appear automatically
            once added to the plan. */}
        {EXERCISE_CATALOG
          .filter(a => a.id !== 'yoga' && plannedActivities.has(a.id))
          .map(item => {
          const isWalk = item.id === 'walk';
          const todaySeries = weeklyByActivity[item.id] ?? [0,0,0,0,0,0,0];
          const todayActivityMin = todaySeries[todaySeries.length - 1] || 0;

          // The user's chosen target and unit, falling back to the legacy keys.
          const savedUnit = goals.goalUnit?.[item.id];
          const savedVal  = goals.goalValue?.[item.id];
          const cardUnit: GoalUnit = savedUnit ?? (isWalk ? 'steps' : 'min');
          const legacyKey = isWalk ? 'walkSteps' : (`${item.id}Min` as keyof WorkoutGoals);
          const goalVal = savedVal ?? (goals[legacyKey] as number) ?? (isWalk ? 6000 : 30);

          return (
            <ActivityBox
              key={item.id}
              activity={item.id}
              icon={item.icon}
              name={item.name}
              ringAutoDetect={item.ringAutoDetect}
              reminder={reminders[item.id]}
              goalValue={goalVal}
              goalUnitShort={GOAL_UNIT_META[cardUnit].short}
              stepsToday={stepsToday}
              walkKm={walkKm}
              walkKcal={walkKcal}
              walkHours={walkHours}
              minutesToday={todayActivityMin}
              estKcalPerMin={KCAL_PER_MIN[item.id] || 5}
              history={history}
              onDetails={() => (isWalk
                ? navigation?.navigate?.('ExerciseDetail')
                : setSelected(item))}
              onEditGoal={() => {
                setEditingGoalFor(item.id);
                setGoalInput(String(goalVal));
                setGoalUnit(cardUnit);
              }}
              onLog={() => { setLogActivity(item.id); setShowLog(true); }}
            />
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
            <Text style={styles.logHint}>Add minutes you&apos;ve already done.</Text>

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

      {/* Plan Your Wellbeing now navigates to the Plan tab's 4-step wizard —
          the sheet component is retained for potential future reuse but is
          no longer mounted here. */}
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

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.deep },
  content: { paddingVertical: SPACING.lg, paddingBottom: 80 },
  header: { paddingLeft: DRAWER_CLEARANCE, paddingRight: SPACING.md, marginBottom: SPACING.md, paddingTop: 4 },
  title: { fontSize: 24, color: C.cream, fontWeight: '600' },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 4 },

  logBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.12)',
  },
  logBtnText: { color: C.gold, fontSize: 11, fontWeight: '700' },

  kpiCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.lg, backgroundColor: C.cardBg,
    borderRadius: 16, borderWidth: 2, borderColor: C.gold,
    alignItems: 'center',
  },
  kpiLabel: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1.5, marginBottom: 4 },
  kpiBig: { fontSize: 38, color: C.gold, fontWeight: '700' },
  kpiSmall: { fontSize: 14, color: C.muted, fontWeight: '500' },
  progressTrack: {
    width: '100%', height: 8, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 4, marginVertical: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.gold },
  kpiHint: { fontSize: 12, color: C.cream, fontStyle: 'italic', textAlign: 'center', marginTop: 4 },

  // v72: since-morning summary strip (steps · kcal · km)
  sinceMorningRow: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    paddingVertical: SPACING.md, borderRadius: 14,
    backgroundColor: C.cardBg, borderWidth: 1, borderColor: 'rgba(78,168,222,0.30)',
  },
  sinceCell: { flex: 1, alignItems: 'center' },
  sinceVal: { color: C.cream, fontSize: 20, fontWeight: '800' },
  sinceLabel: { color: C.muted, fontSize: 10, textAlign: 'center', marginTop: 3, lineHeight: 13 },
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
  autoDetectText: { fontSize: 12, color: C.cream, lineHeight: 17 },

  recCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: C.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  recLabel: { fontSize: 10, color: C.gold, fontWeight: '700', letterSpacing: 1.2, marginBottom: SPACING.sm },
  recRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)' },
  recIcon: { fontSize: 22, marginRight: SPACING.sm, width: 32 },
  recName: { fontSize: 14, color: C.cream, fontWeight: '600' },
  recSub: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  recDur: { fontSize: 11, color: C.gold, fontWeight: '600' },

  filterRow: {
    flexDirection: 'row', flexWrap: 'wrap', gap: 6,
    paddingHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  filterChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg,
  },
  filterChipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  filterIcon: { fontSize: 13 },
  filterLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  filterLabelActive: { color: C.gold },

  listCard: {
    marginHorizontal: SPACING.md, marginBottom: 8,
    padding: SPACING.md, backgroundColor: C.cardBg, borderRadius: 12,
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  listIcon: { fontSize: 28 },
  listName: { fontSize: 14, color: C.cream, fontWeight: '600' },
  listSub: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 1 },
  listBenefit: { fontSize: 11, color: C.cream, marginTop: 4, opacity: 0.85, lineHeight: 15 },
  listDur: { fontSize: 11, color: C.gold, fontWeight: '600', marginLeft: SPACING.sm },

  // ── Samsung-Health-style activity metric card ──
  activityMetricCard: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, backgroundColor: C.cardBg,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
  },
  amHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  amIcon: { fontSize: 30, width: 42, textAlign: 'center', marginRight: 6 },
  amName: { color: C.cream, fontSize: 17, fontWeight: '800' },
  trendBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.12)',
  },
  trendBtnText: { color: C.gold, fontSize: 11, fontWeight: '700' },

  amPrimary: { marginVertical: SPACING.sm },
  amPrimaryLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.2, marginBottom: 4 },
  amPrimaryValue: { fontSize: 30, color: C.gold, fontWeight: '800', lineHeight: 32 },
  amPrimaryGoal: { fontSize: 13, color: C.muted, fontWeight: '500' },
  editGoalBtn: { marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.border },
  editGoalText: { color: C.muted, fontSize: 10, fontWeight: '700' },
  amProgressTrack: { height: 6, backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 3, marginTop: 8, overflow: 'hidden' },
  amProgressFill: { height: '100%', backgroundColor: C.gold },

  amSubLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.2, marginTop: SPACING.sm, marginBottom: 4 },
  amWeekTotal: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 2 },

  amKpiGrid: { flexDirection: 'row', marginTop: SPACING.sm, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8 },
  amKpiCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  amKpiValue: { fontSize: 16, color: C.cream, fontWeight: '700' },
  amKpiLabel: { fontSize: 9, color: C.muted, fontWeight: '600', textAlign: 'center', marginTop: 3, letterSpacing: 0.3 },

  manualBadge: { backgroundColor: 'rgba(255,184,0,0.12)', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  manualBadgeText: { fontSize: 9, color: C.gold, fontWeight: '700' },

  amLogBtn: {
    marginTop: SPACING.sm, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.15)', borderWidth: 1, borderColor: C.gold,
    alignItems: 'center',
  },
  amLogBtnText: { color: C.gold, fontWeight: '700', fontSize: 13 },
  amLastSession: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 6, textAlign: 'center' },

  // Goal edit modal
  goalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', justifyContent: 'center', alignItems: 'center', padding: SPACING.md },
  goalCard: { width: '100%', maxWidth: 360, backgroundColor: C.darkBg, borderRadius: 16, padding: SPACING.lg, borderWidth: 1, borderColor: C.gold },
  goalTitle: { color: C.cream, fontSize: 16, fontWeight: '700', marginBottom: 4 },
  goalHint: { color: C.muted, fontSize: 12, fontStyle: 'italic', marginBottom: SPACING.md },
  goalInput: { backgroundColor: C.cardBg, borderRadius: 10, padding: SPACING.md, color: C.cream, fontSize: 18, fontWeight: '700', borderWidth: 1, borderColor: C.border, textAlign: 'center' },
  // v67: metric selector chips
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: SPACING.md },
  unitChip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg },
  unitChipOn: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  unitChipText: { color: C.muted, fontSize: 13, fontWeight: '700' },
  unitChipTextOn: { color: C.gold },
  goalUnitCaption: { color: C.muted, fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 6 },
  cancelBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.muted, fontSize: 14, fontWeight: '600' },
  saveBtn: { flex: 1, paddingVertical: SPACING.md, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center' },
  saveText: { color: C.deep, fontSize: 14, fontWeight: '700' },

  autoBadge: {
    backgroundColor: 'rgba(78,168,222,0.18)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  autoBadgeText: { fontSize: 9, color: '#4ea8de', fontWeight: '700' },
  reminderBadge: {
    backgroundColor: 'rgba(212,160,23,0.18)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  reminderBadgeText: { fontSize: 9, color: C.gold, fontWeight: '700' },

  sectionLabel: {
    fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.5,
    marginHorizontal: SPACING.md, marginTop: SPACING.md, marginBottom: SPACING.sm,
  },

  breakdownCard: {
    marginHorizontal: SPACING.md,
    padding: SPACING.md, backgroundColor: C.cardBg,
    borderRadius: 14, borderWidth: 1, borderColor: C.border,
  },
  breakdownRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  breakdownIcon: { fontSize: 20, width: 28 },
  breakdownLabel: { flex: 1, color: C.cream, fontSize: 13, fontWeight: '600', marginLeft: 4 },
  breakdownCount: { color: C.muted, fontSize: 11, marginRight: SPACING.sm },
  breakdownMin: { color: C.gold, fontSize: 13, fontWeight: '700' },
  historyRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  historyLabel: { color: C.cream, fontSize: 13, fontWeight: '600' },
  historyDate: { color: C.muted, fontSize: 11, marginTop: 2 },
  deleteX: { color: C.error, fontSize: 16, padding: 4 },

  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalContent: {
    backgroundColor: C.darkBg,
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
    maxHeight: '88%',
  },
  modalHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  modalHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: SPACING.md },
  modalClose: { color: C.muted, fontSize: 18, padding: 4 },
  detailName: { fontSize: 22, color: C.cream, fontWeight: '700' },
  detailSub:  { fontSize: 13, color: C.gold, fontStyle: 'italic', marginTop: 2 },
  detailBenefit: { fontSize: 13, color: C.cream, lineHeight: 19, marginBottom: SPACING.md },

  autoDetectInline: {
    padding: SPACING.sm, marginBottom: SPACING.md,
    backgroundColor: 'rgba(78,168,222,0.12)', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#4ea8de',
  },
  autoDetectInlineText: { fontSize: 12, color: C.cream, lineHeight: 17 },

  timerCard: {
    backgroundColor: C.cardBg, borderRadius: 12,
    padding: SPACING.md, alignItems: 'center', marginBottom: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.3)',
  },
  timerClock: { fontSize: 44, color: C.gold, fontWeight: '700', letterSpacing: 2 },
  timerBtnRow: { flexDirection: 'row', gap: SPACING.sm, marginTop: SPACING.sm },
  timerBtnPrimary: { backgroundColor: C.gold, paddingHorizontal: SPACING.lg, paddingVertical: 10, borderRadius: 8 },
  timerBtnPrimaryText: { color: C.deep, fontWeight: '700' },
  timerBtnSecondary: { borderColor: C.border, borderWidth: 1, paddingHorizontal: SPACING.md, paddingVertical: 10, borderRadius: 8 },
  timerBtnSecondaryText: { color: C.cream, fontWeight: '600' },

  actionRow: { flexDirection: 'row', gap: SPACING.sm, marginBottom: SPACING.md },
  actionBtn: {
    flex: 1, paddingVertical: 10, paddingHorizontal: SPACING.sm,
    borderRadius: 10, borderWidth: 1, borderColor: C.border,
    backgroundColor: C.cardBg, alignItems: 'center',
  },
  actionBtnText: { color: C.cream, fontSize: 12, fontWeight: '600' },

  stepRow: { flexDirection: 'row', paddingVertical: 4 },
  stepBullet: { color: C.gold, fontSize: 14, marginRight: 6 },
  stepText: { flex: 1, fontSize: 13, color: C.cream, lineHeight: 18 },

  warnBox: {
    marginTop: SPACING.md, padding: SPACING.sm,
    backgroundColor: 'rgba(255, 140, 66, 0.1)',
    borderRadius: 8, borderLeftWidth: 3, borderLeftColor: C.saffron,
  },
  warnLabel: { fontSize: 10, color: C.saffron, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  warnText: { fontSize: 12, color: C.cream, lineHeight: 17 },

  // Log past modal
  logOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  logCard: {
    backgroundColor: C.darkBg, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: SPACING.md, paddingBottom: SPACING.xl,
  },
  logHandle: { width: 40, height: 4, backgroundColor: C.border, borderRadius: 2, alignSelf: 'center', marginBottom: SPACING.md },
  logTitle: { fontSize: 18, color: C.cream, fontWeight: '700', marginBottom: 4 },
  logHint:  { fontSize: 12, color: C.muted, marginBottom: SPACING.md },
  logFieldLabel: { fontSize: 11, color: C.muted, fontWeight: '700', letterSpacing: 1, marginBottom: 4, marginTop: 8 },
  logInput: {
    backgroundColor: C.cardBg, borderRadius: 10, padding: SPACING.sm,
    color: C.cream, fontSize: 16, borderWidth: 1, borderColor: C.border,
  },
  logSubmit: {
    backgroundColor: C.gold, padding: SPACING.md, borderRadius: 10,
    marginTop: SPACING.md, alignItems: 'center',
  },
  logSubmitText: { color: C.deep, fontWeight: '700', fontSize: 15 },
  logCancel: {
    color: C.muted, fontSize: 13, textAlign: 'center', marginTop: SPACING.sm,
  },
  activityPickerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  activityPickerChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16,
    borderWidth: 1, borderColor: C.border, backgroundColor: C.cardBg,
  },
  activityPickerChipActive: { borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.15)' },
  activityPickerIcon: { fontSize: 14 },
  activityPickerLabel: { fontSize: 11, color: C.muted, fontWeight: '600' },
  activityPickerLabelActive: { color: C.gold },
});


// Static dark styles for helpers rendered outside the palette-aware component.
const styles = makeStyles(COLORS);
