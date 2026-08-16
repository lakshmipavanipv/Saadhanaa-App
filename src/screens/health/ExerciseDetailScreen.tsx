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
  type HealthView, type DayQuality,
} from './HealthPrimitives';
import { HEALTH_COLORS } from './healthTokens';
import { syncAllRingVitals, type RingVitalsSyncResult } from '../../soulsync/ring';

const DAY_MS = 86_400_000;
const STEP_GOAL = 8000;
const ACTIVE_GOAL_MIN = 30;

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export const ExerciseDetailScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(isoDay(new Date()));
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
  const activeMins = Math.round((today.steps / 100)); // rough proxy: ~100 steps/min while active
  const stepsPct = Math.min(1, today.steps / STEP_GOAL);

  // Last 7 days (ordered oldest → newest, including today)
  const last7 = useMemo(() => {
    const days: Array<{ iso: string; steps: number; kcal: number; km: number; active: number }> = [];
    const anchor = new Date(selected + 'T00:00:00');
    for (let i = 6; i >= 0; i--) {
      const d = new Date(anchor.getTime() - i * DAY_MS);
      const iso = isoDay(d);
      const b = byDay[iso] ?? { steps: 0, kcal: 0, km: 0 };
      days.push({ iso, steps: b.steps, kcal: b.kcal, km: b.km, active: Math.round(b.steps / 100) });
    }
    return days;
  }, [byDay, selected]);

  const avgSteps  = Math.round(last7.reduce((a, b) => a + b.steps,  0) / 7);
  const avgActive = Math.round(last7.reduce((a, b) => a + b.active, 0) / 7);
  const avgKcal   = Math.round(last7.reduce((a, b) => a + b.kcal,   0) / 7);

  const quality = useMemo(() => {
    const out: Record<string, DayQuality> = {};
    for (const [iso, b] of Object.entries(byDay)) {
      out[iso] =
        b.steps >= STEP_GOAL     ? 'good' :
        b.steps >= STEP_GOAL / 2 ? 'fair' : 'poor';
    }
    return out;
  }, [byDay]);

  const todayIso = isoDay(new Date());
  const syncLabel = syncedAt
    ? `last update ${Math.max(0, Math.floor((Date.now() - syncedAt) / 60_000))} min ago`
    : 'syncing…';

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader title="Exercise" iconEmoji="🏃" onBack={() => navigation?.goBack?.()} />

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
          <ActTile k="Time moving" v={`${Math.floor(activeMins / 60)}h ${activeMins % 60}m`} unit="" />
          <ActTile k="Floors"      v="—" unit="" />
        </View>
      </View>

      {/* Bar trends */}
      <BarTrendCard
        title="Steps · last 7 days"
        aside={`avg ${avgSteps.toLocaleString()}`}
        data={last7.map((d) => d.steps)}
        goal={STEP_GOAL}
        goalLabel="8k goal"
        todayIndex={last7.findIndex((d) => d.iso === todayIso)}
      />
      <BarTrendCard
        title="Active minutes · last 7 days"
        aside={`avg ${avgActive} min`}
        data={last7.map((d) => d.active)}
        goal={ACTIVE_GOAL_MIN}
        goalLabel="30 min"
        todayIndex={last7.findIndex((d) => d.iso === todayIso)}
      />
      <BarTrendCard
        title="Calories burned · last 7 days"
        aside={`avg ${avgKcal} kcal`}
        data={last7.map((d) => d.kcal)}
        todayIndex={last7.findIndex((d) => d.iso === todayIso)}
      />

      {/* About */}
      <View style={styles.about}>
        <View style={styles.aboutRow}>
          <View style={styles.pill}><Text style={styles.pillIcon}>🏃</Text></View>
          <Text style={styles.aboutTitle}>How your movement is measured</Text>
        </View>
        <Text style={styles.aboutBody}>
          Your ring's motion sensor counts every step and the gyroscope tracks how
          vigorously you move. When your heart rate rises above 100 bpm for
          several minutes we mark it as raised-HR activity — a good proxy for real
          workout effort even if you didn't tap "start workout".
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
