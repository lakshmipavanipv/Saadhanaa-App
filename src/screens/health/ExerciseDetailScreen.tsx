/**
 * ExerciseDetailScreen — ring-synced activity view. Shows steps, active
 * minutes, calories, distance, raised-HR time, and floors as tiles; three
 * bar-trend charts (steps · active mins · calories) sit below.
 *
 * Data source: syncAllRingVitals().raw.steps (opcode {5, 2, 16}). We derive
 * "raised HR minutes" from HR samples where hr > 100 during the day.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Circle, Text as SvgText } from 'react-native-svg';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import {
  ScreenHeader, ViewSwitch, WeekStrip,
  type HealthView, type DayQuality, useBackToHealth } from './HealthPrimitives';
import { useRange } from './rangeContext';
import { HEALTH_COLORS } from './healthTokens';
import { syncAllRingVitals, type RingVitalsSyncResult } from '../../soulsync/ring';
import { isoDayOf as isoDay } from '../../utils';

const DAY_MS = 86_400_000;

/** Clock time as HH:MM in local time. */
const formatHm = (d: Date): string =>
  `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
const STEP_GOAL = 8000;
const ACTIVE_GOAL_MIN = 30;

/** Steps per minute that count as walking rather than shuffling about. */
const WALK_CADENCE = 60;
/** A gap longer than this is the ring not reporting, not one long walk. */
const IDLE_GAP_MIN = 15;
/** Interval credited to the first sample of the day, which has no predecessor. */
const DEFAULT_GAP_MS = 5 * 60_000;


export const ExerciseDetailScreen: React.FC<any> = ({ navigation }) => {
  const goBack = useBackToHealth(navigation);
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  // Range is shared app-wide, so a day chosen on Japa or Exercise is the
  // day this report opens on. See screens/health/rangeContext.
  const { view, setView, selected, setSelected } = useRange();
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const r = await syncAllRingVitals();
        setVitals(r); setSyncedAt(Date.now());
      } catch { /* noop */ }
    })();
  }, []);

  // Bucket step samples by day
  const byDay = useMemo(() => {
    const map: Record<string, { steps: number; kcal: number; km: number }> = {};
    if (!vitals) return map;
    for (const s of vitals.raw.steps) {
      const key = isoDay(s.timestamp);
      const b = (map[key] ??= { steps: 0, kcal: 0, km: 0 });
      b.steps += s.steps;
      b.kcal  += s.calorieKcal;
      b.km    += s.distanceKm;
    }
    return map;
  }, [vitals]);

  // Raised-HR minutes for the selected day
  const raisedHrMin = useMemo(() => {
    if (!vitals) return 0;
    const dayStart = new Date(selected + 'T00:00:00').getTime();
    const dayEnd = dayStart + DAY_MS;
    const sorted = vitals.raw.hr
      .filter((s) => s.timestamp.getTime() >= dayStart && s.timestamp.getTime() < dayEnd)
      .sort((a, b) => a.ringTs - b.ringTs);
    let minutes = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      if (sorted[i].hr > 100) {
        const dur = (sorted[i + 1].ringTs - sorted[i].ringTs) / 60;
        if (dur > 0 && dur < 30) minutes += dur;
      }
    }
    return Math.round(minutes);
  }, [vitals, selected]);

  // Today's totals
  const today = byDay[selected] ?? { steps: 0, kcal: 0, km: 0 };
  const stepsPct = Math.min(1, today.steps / STEP_GOAL);

  /**
   * Active minutes, measured from the ring's own sample timing.
   *
   * This was `steps / 100`, described in its comment as a rough proxy. It was
   * not a measurement at all: it is today's step total rescaled, so it could
   * never disagree with the steps tile, and 8,000 steps dribbled over a whole
   * day reported the same 80 "active minutes" as 8,000 steps walked in an
   * hour. The "Time moving" tile then printed that same number again in hours
   * and minutes, so one invented quantity filled two tiles.
   *
   * The ring timestamps every step sample, so the gap between consecutive
   * samples is a real interval of known length, and the steps recorded in it
   * give a real cadence. An interval counts as active when its cadence clears
   * a walking threshold. Gaps longer than IDLE_GAP_MIN are the ring not
   * reporting rather than a very long walk, so they are capped instead of
   * being credited in full.
   */
  const activeMins = useMemo(() => {
    const dayStart = new Date(selected + 'T00:00:00').getTime();
    const day = (vitals?.raw.steps ?? [])
      .filter((smp) => {
        const ms = smp.timestamp.getTime() - dayStart;
        return ms >= 0 && ms < DAY_MS;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    let mins = 0;
    for (let i = 0; i < day.length; i++) {
      if (day[i].steps <= 0) continue;
      const prev = i > 0 ? day[i - 1].timestamp.getTime() : day[i].timestamp.getTime() - DEFAULT_GAP_MS;
      const gapMin = Math.min(IDLE_GAP_MIN, (day[i].timestamp.getTime() - prev) / 60_000);
      if (gapMin <= 0) continue;
      if (day[i].steps / gapMin >= WALK_CADENCE) mins += gapMin;
    }
    return Math.round(mins);
  }, [vitals, selected]);

  /**
   * The day's walks, as discrete bouts rather than one daily total.
   *
   * "You walked 6,000 steps" does not tell you whether that was one long
   * morning walk or six trips to the kitchen, and those are different days.
   * Consecutive step samples whose cadence clears the walking threshold are
   * joined into a bout; a quiet gap ends it. Each bout carries its own clock
   * time, duration, steps, distance, calories, and the heart rate the ring
   * recorded while it was happening.
   *
   * Bouts under MIN_BOUT_MIN are dropped: a single minute above cadence is
   * crossing a room, and listing it as a walk buries the real ones.
   */
  const bouts = useMemo(() => {
    const dayStart = new Date(selected + 'T00:00:00').getTime();
    const day = (vitals?.raw.steps ?? [])
      .filter((smp) => {
        const ms = smp.timestamp.getTime() - dayStart;
        return ms >= 0 && ms < DAY_MS && smp.steps > 0;
      })
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    type Bout = { start: number; end: number; steps: number; km: number; kcal: number };
    const out: Bout[] = [];
    let cur: Bout | null = null;

    for (let i = 0; i < day.length; i++) {
      const t = day[i].timestamp.getTime();
      const prev = i > 0 ? day[i - 1].timestamp.getTime() : t - DEFAULT_GAP_MS;
      const gapMin = Math.min(IDLE_GAP_MIN, (t - prev) / 60_000);
      const active = gapMin > 0 && day[i].steps / gapMin >= WALK_CADENCE;

      if (!active) { cur = null; continue; }
      const from = t - gapMin * 60_000;
      if (cur && from - cur.end <= IDLE_GAP_MIN * 60_000) {
        cur.end = t; cur.steps += day[i].steps; cur.km += day[i].distanceKm; cur.kcal += day[i].calorieKcal;
      } else {
        cur = { start: from, end: t, steps: day[i].steps, km: day[i].distanceKm, kcal: day[i].calorieKcal };
        out.push(cur);
      }
    }

    const MIN_BOUT_MIN = 3;
    return out
      .map((b) => {
        const mins = Math.round((b.end - b.start) / 60_000);
        // Heart rate the ring actually logged inside the bout's window. Null
        // when it took no reading then, which is common — it samples on a
        // timer, not continuously.
        const hrs = (vitals?.raw.hr ?? [])
          .filter((h) => {
            const ht = h.timestamp.getTime();
            return ht >= b.start && ht <= b.end && h.hr > 0;
          })
          .map((h) => h.hr);
        return {
          ...b, mins,
          avgHr: hrs.length ? Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length) : null,
          maxHr: hrs.length ? Math.max(...hrs) : null,
        };
      })
      .filter((b) => b.mins >= MIN_BOUT_MIN);
  }, [vitals, selected]);

  /** Hour of the selected day with the most steps — real, and not a restatement. */
  const busiestHour = useMemo(() => {
    const dayStart = new Date(selected + 'T00:00:00').getTime();
    const hours = new Array(24).fill(0);
    for (const smp of vitals?.raw.steps ?? []) {
      const ms = smp.timestamp.getTime() - dayStart;
      if (ms < 0 || ms >= DAY_MS) continue;
      hours[Math.floor(ms / 3_600_000)] += smp.steps;
    }
    const best = hours.indexOf(Math.max(...hours));
    return Math.max(...hours) > 0 ? `${String(best).padStart(2, '0')}:00` : '—';
  }, [vitals, selected]);

  /**
   * The trend window, driven by the Day / Week / Month switch.
   *
   * That switch used to be inert: `view` was declared and rendered and then
   * read nowhere, so the charts always showed seven days whichever segment
   * was highlighted. A control that moves and changes nothing is worse than
   * no control, because it is indistinguishable from one that is broken.
   *
   * Day buckets the selected day by hour from the sample timestamps, so it
   * shows when you actually moved rather than one flat total. Week and month
   * bucket by day over 7 and 30.
   */
  const series = useMemo(() => {
    const out: { iso: string; label: string; steps: number; kcal: number; km: number; active: number }[] = [];

    if (view === 'day') {
      const dayStart = new Date(selected + 'T00:00:00').getTime();
      const buckets = Array.from({ length: 24 }, () => ({ steps: 0, kcal: 0, km: 0 }));
      for (const smp of vitals?.raw.steps ?? []) {
        const ms = smp.timestamp.getTime() - dayStart;
        if (ms < 0 || ms >= DAY_MS) continue;
        const h = Math.floor(ms / 3_600_000);
        buckets[h].steps += smp.steps;
        buckets[h].kcal  += smp.calorieKcal;
        buckets[h].km    += smp.distanceKm;
      }
      buckets.forEach((b, h) => out.push({
        iso: `${selected}T${String(h).padStart(2, '0')}`,
        label: String(h).padStart(2, '0'),
        steps: b.steps, kcal: b.kcal, km: b.km,
        active: b.steps >= WALK_CADENCE * 5 ? Math.round(b.steps / WALK_CADENCE) : 0,
      }));
      return out;
    }

    const days = view === 'month' ? 30 : 7;
    const anchor = new Date(selected + 'T00:00:00');
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * DAY_MS);
      const iso = isoDay(d);
      const b = byDay[iso] ?? { steps: 0, kcal: 0, km: 0 };
      out.push({
        iso, label: String(d.getDate()),
        steps: b.steps, kcal: b.kcal, km: b.km,
        active: b.steps >= WALK_CADENCE * 5 ? Math.round(b.steps / WALK_CADENCE) : 0,
      });
    }
    return out;
  }, [view, byDay, selected, vitals]);

  // Averaged over buckets that actually hold a reading. Dividing by a fixed 7
  // counted days the ring never synced as zeros and dragged every average
  // down, which read as a collapse in activity rather than missing data.
  const withData = series.filter((d) => d.steps > 0);
  const mean = (pick: (d: typeof series[number]) => number) =>
    withData.length ? Math.round(withData.reduce((a, d) => a + pick(d), 0) / withData.length) : 0;
  const avgSteps  = mean((d) => d.steps);
  const avgActive = mean((d) => d.active);
  const avgKcal   = mean((d) => d.kcal);

  const quality = useMemo(() => {
    const out: Record<string, DayQuality> = {};
    for (const [iso, b] of Object.entries(byDay)) {
      out[iso] =
        b.steps >= STEP_GOAL     ? 'good' :
        b.steps >= STEP_GOAL / 2 ? 'fair' : 'poor';
    }
    return out;
  }, [byDay]);

  const spanLabel = view === 'day' ? 'by hour' : view === 'month' ? 'last 30 days' : 'last 7 days';

  const todayIso = isoDay(new Date());
  const syncLabel = syncedAt
    ? `last update ${Math.max(0, Math.floor((Date.now() - syncedAt) / 60_000))} min ago`
    : 'syncing…';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader title="Exercise" iconEmoji="🏃" onBack={goBack} />

      <ViewSwitch value={view} onChange={setView} />
      <WeekStrip
        selected={selected}
        onSelect={setSelected}
        quality={quality}
        accent={HEALTH_COLORS.exercise}
      />

      {/* Ring sync strip */}
      <View style={styles.syncCard}>
        <View style={styles.syncBadge}>
          <Text style={{ color: HEALTH_COLORS.exercise, fontSize: 16 }}>◉</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.syncTitle}><Text style={styles.bold}>SR16 ring</Text> · syncing motion & steps</Text>
          <Text style={styles.syncSub}>{syncLabel}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.syncUuid}><Text style={styles.mono}>b003</Text> notify · steps</Text>
          <Text style={styles.syncUuid}><Text style={styles.mono}>b002</Text> write · gyro</Text>
        </View>
      </View>

      {/* Hero: today's activity + goal ring */}
      <View style={styles.hero}>
        <Text style={styles.heroEyebrow}>Today · {formatLongDate(selected)}</Text>
        <View style={styles.heroRow}>
          <View style={{ flex: 1 }}>
            <View style={styles.heroStepsRow}>
              <Text style={styles.heroSteps}>{today.steps.toLocaleString()}</Text>
              <Text style={styles.heroUnit}>steps</Text>
            </View>
            <Text style={styles.heroGoal}>
              Goal <Text style={styles.bold}>{STEP_GOAL.toLocaleString()}</Text>
              {'  ·  '}
              <Text style={[styles.bold, { color: HEALTH_COLORS.exercise }]}>{Math.round(stepsPct * 100)}%</Text>
            </Text>
          </View>
          <GoalRing percent={stepsPct} accent={HEALTH_COLORS.exercise} />
        </View>

        <View style={styles.actGrid}>
          <ActTile k="Active mins" v={`${activeMins}`} unit="min" />
          <ActTile k="Calories"    v={`${Math.round(today.kcal)}`} unit="kcal" />
          <ActTile k="Distance"    v={today.km.toFixed(2)} unit="km" />
          <ActTile k="Raised HR"   v={`${raisedHrMin}`} unit="min" />
          <ActTile k="Busiest hour" v={busiestHour} unit="" />
          <ActTile k="Floors"      v="—" unit="" />
        </View>
      </View>

      {/* Each walk of the day, with its own clock time and vitals. Only on the
          Day view: over a week or a month this becomes a list of forty rows,
          and the bar charts below already answer the question at that span. */}
      {view === 'day' && (
        <View style={styles.boutCard}>
          <Text style={styles.boutHead}>
            {bouts.length ? `Walks · ${bouts.length}` : 'Walks'}
          </Text>
          {bouts.length === 0 ? (
            <Text style={styles.boutEmpty}>
              No walk of three minutes or more recorded on this day.
            </Text>
          ) : bouts.map((b, i) => (
            <View key={i} style={styles.boutRow}>
              <View style={styles.boutWhen}>
                <Text style={styles.boutTime}>{formatHm(new Date(b.start))}</Text>
                <Text style={styles.boutDur}>{b.mins} min</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.boutMain}>
                  {b.steps.toLocaleString()} steps · {b.km.toFixed(2)} km
                </Text>
                <Text style={styles.boutSub}>
                  {Math.round(b.kcal)} kcal
                  {b.avgHr != null ? ` · ${b.avgHr} bpm avg` : ' · heart rate not sampled'}
                  {b.maxHr != null ? ` · peak ${b.maxHr}` : ''}
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* Bar trends */}
      <BarTrendCard
        title={`Steps · ${spanLabel}`}
        aside={`avg ${avgSteps.toLocaleString()}`}
        data={series.map((d) => d.steps)}
        goal={STEP_GOAL}
        goalLabel="8k goal"
        todayIndex={series.findIndex((d) => d.iso === todayIso)}
      />
      <BarTrendCard
        title={`Active minutes · ${spanLabel}`}
        aside={`avg ${avgActive} min`}
        data={series.map((d) => d.active)}
        goal={ACTIVE_GOAL_MIN}
        goalLabel="30 min"
        todayIndex={series.findIndex((d) => d.iso === todayIso)}
      />
      <BarTrendCard
        title={`Calories burned · ${spanLabel}`}
        aside={`avg ${avgKcal} kcal`}
        data={series.map((d) => d.kcal)}
        todayIndex={series.findIndex((d) => d.iso === todayIso)}
      />

      {/* About */}
      <View style={styles.about}>
        <View style={styles.aboutRow}>
          <View style={styles.pill}><Text style={styles.pillIcon}>🏃</Text></View>
          <Text style={styles.aboutTitle}>How your movement is measured</Text>
        </View>
        <Text style={styles.aboutBody}>
          Your ring&apos;s motion sensor counts every step and the gyroscope tracks how
          vigorously you move. When your heart rate rises above 100 bpm for
          several minutes we mark it as raised-HR activity — a good proxy for real
          workout effort even if you didn&apos;t tap &quot;start workout&quot;.
        </Text>
        <Text style={[styles.aboutBody, { marginTop: 10 }]}>
          Aim for at least 8,000 steps and 30 minutes of active time on most days.
          A few short bursts through the day add up as well as one long session.
        </Text>
      </View>
    </ScrollView>
  );
};

// ── Goal ring ──────────────────────────────────────────────────────────────

const GoalRing: React.FC<{ percent: number; accent: string }> = ({ percent, accent }) => {
  const w = 80, r = 32;
  const cx = w / 2, cy = w / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ * (1 - Math.max(0, Math.min(1, percent)));
  return (
    <Svg width={w} height={w}>
      <Circle cx={cx} cy={cy} r={r} stroke="rgba(255,255,255,0.05)" strokeWidth={7} fill="none" />
      <Circle
        cx={cx} cy={cy} r={r}
        stroke={accent} strokeWidth={7} fill="none"
        strokeLinecap="round"
        strokeDasharray={circ} strokeDashoffset={dashOffset}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      <SvgText x={cx} y={cy + 6} fill="#EAF0F8" fontSize={16} fontWeight="600" textAnchor="middle">
        {Math.round(percent * 100)}%
      </SvgText>
    </Svg>
  );
};

// ── Activity tile ──────────────────────────────────────────────────────────

const ActTile: React.FC<{ k: string; v: string; unit: string }> = ({ k, v, unit }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => actTileStyles(palette), [palette]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.k}>{k}</Text>
      <View style={styles.vRow}>
        <Text style={styles.v}>{v}</Text>
        {unit ? <Text style={styles.u}>{unit}</Text> : null}
      </View>
    </View>
  );
};

const actTileStyles = (C: typeof COLORS) => StyleSheet.create({
  wrap: {
    width: '31.5%', padding: 10, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: C.border, borderWidth: 1, borderRadius: 10,
  },
  k: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase', textAlign: 'center' },
  vRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  v: { fontSize: 17, color: C.cream, fontWeight: '700', letterSpacing: -0.3 },
  u: { fontSize: 10, color: C.muted, marginLeft: 3 },
});

// ── Bar trend card ─────────────────────────────────────────────────────────

const DAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface BarTrendProps {
  title: string;
  aside: string;
  data: number[];
  goal?: number;
  goalLabel?: string;
  todayIndex: number;
}

const BarTrendCard: React.FC<BarTrendProps> = ({ title, aside, data, goal, goalLabel, todayIndex }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => trendStyles(palette), [palette]);
  const max = Math.max(1, ...data, goal ?? 0);
  const goalPct = goal ? goal / max : 0;
  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.aside}>{aside}</Text>
      </View>
      <View style={styles.chart}>
        {goal ? (
          <View style={[styles.goalLine, { bottom: `${goalPct * 100}%` }]}>
            {goalLabel ? <Text style={styles.goalLbl}>{goalLabel}</Text> : null}
          </View>
        ) : null}
        {data.map((v, i) => {
          const isToday = i === todayIndex;
          const isFuture = i > todayIndex;
          const h = Math.max(2, (v / max) * 100);
          return (
            <View key={i} style={styles.col}>
              <View
                style={[
                  styles.bar,
                  { height: `${h}%`, backgroundColor: isToday ? HEALTH_COLORS.exercise : isFuture ? 'rgba(255,255,255,0.06)' : 'rgba(255,159,69,0.55)' },
                  isToday && styles.barToday,
                ]}
              />
              <Text style={[styles.lbl, isToday && styles.lblToday]}>
                {DAY_LABELS[(new Date().getDay() + 7 + (i - 6)) % 7]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const trendStyles = (C: typeof COLORS) => StyleSheet.create({
  card: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  title: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase' },
  aside: { fontSize: 10, color: C.muted },
  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 92, gap: 6, position: 'relative', paddingTop: 10 },
  col: { flex: 1, alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' },
  bar: { width: 22, borderRadius: 4 },
  barToday: { shadowColor: HEALTH_COLORS.exercise, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.9 },
  lbl: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  lblToday: { color: HEALTH_COLORS.exercise },
  goalLine: {
    position: 'absolute', left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed', borderColor: 'rgba(240,208,138,0.5)',
  },
  goalLbl: {
    position: 'absolute', right: 0, top: -14,
    fontSize: 9, fontWeight: '700', color: '#F0D08A', letterSpacing: 0.4, textTransform: 'uppercase',
  },
});

// ── Helpers + Screen styles ─────────────────────────────────────────────────

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 80, paddingTop: 6 },

  syncCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, marginBottom: 12,
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: HEALTH_COLORS.exercise,
    borderRadius: 12,
  },
  syncBadge: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.05)',
    alignItems: 'center', justifyContent: 'center',
  },
  syncTitle: { fontSize: 11.5, color: C.cream },
  syncSub: { fontSize: 10.5, color: C.muted, marginTop: 2 },
  syncUuid: { fontSize: 9.5, color: C.muted, lineHeight: 14 },
  mono: { fontFamily: 'monospace', color: C.muted },
  bold: { fontWeight: '700', color: C.cream },

  hero: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: HEALTH_COLORS.exercise,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  heroEyebrow: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase' },
  heroRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
  heroStepsRow: { flexDirection: 'row', alignItems: 'baseline' },
  heroSteps: { fontSize: 42, fontWeight: '700', color: C.cream, letterSpacing: -1 },
  heroUnit: { fontSize: 12, color: C.muted, marginLeft: 4 },
  heroGoal: { fontSize: 11, color: C.muted, marginTop: 4 },
  actGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },

  about: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  boutCard: {
    backgroundColor: C.cardBg, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  boutHead: {
    color: C.muted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1.3, textTransform: 'uppercase', marginBottom: SPACING.sm,
  },
  boutEmpty: { color: C.muted, fontSize: 12.5, lineHeight: 18 },
  boutRow: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, paddingVertical: 8 },
  boutWhen: { width: 62 },
  boutTime: { color: C.cream, fontSize: 14, fontWeight: '700' },
  boutDur: { color: C.muted, fontSize: 11, marginTop: 1 },
  boutMain: { color: C.cream, fontSize: 13.5, fontWeight: '600' },
  boutSub: { color: C.muted, fontSize: 11.5, marginTop: 2 },

  aboutRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pill: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(255,159,69,0.15)',
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  pillIcon: { fontSize: 16 },
  aboutTitle: { fontSize: 14, fontWeight: '600', color: C.cream, flex: 1 },
  aboutBody: { fontSize: 12.5, color: C.cream, lineHeight: 18, opacity: 0.85 },
});
