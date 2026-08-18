/**
 * PracticeStats — shared layout primitives for the YogaScreen and
 * MeditationScreen, mirroring the Exercise/walk-box pattern so the
 * three screens share ONE mental model.
 *
 * Three exports:
 *
 *   1. <PracticeStatsBox>   — two stacked tiles at the top of the screen:
 *      • Tile A: "{Practice} TIME TODAY" hero with solid gold progress
 *        bar (matches Exercise's hero exactly).
 *      • Tile B: "SADHANA DEPTH SCORE" with a HORIZONTAL DASHED bar
 *        (visually distinct from the time bar so the user can tell
 *        the two boxes apart at a glance).
 *
 *   2. <SessionList>        — one card per session today, modelled after
 *      ExerciseScreen's per-activity card. Each card shows: session
 *      name (Sadhana Path name OR practice name), minutes, depth
 *      score, a WeekSparkline of depth-scores, and week total in
 *      small italic font.
 *
 *   3. <BeforeAfterVitals>  — table comparing today's ambient baseline
 *      to the session's during-averages. Renders AFTER the Soulsync
 *      session stops, replacing the LiveVitalsTrends widget. Same
 *      MetricRow pattern that SaadhanaScoreCard already uses.
 *
 * All three accept a `practice` prop ('yoga' | 'meditation') so the
 * MeditationScreen can reuse them unchanged.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../theme';
import { useTheme } from '../ThemeContext';
import { showNum, barPct, NO_DATA_COLOR } from '../services/vitalsDisplay';
import { getDB } from '../soulsync/db/database';
import { ambientBaselineRepo } from '../soulsync/db/ambientBaselineRepo';
import { exerciseRepo } from '../services/exerciseRepo';
import { soulActivityRepo } from '../services/soulActivityRepo';
import { routineRepo } from '../services/routineRepo';
import { WeekSparkline } from './WeekSparkline';
import { todayStr } from '../utils';

type Practice = 'yoga' | 'meditation' | 'japa';

// ── Helpers ────────────────────────────────────────────────────

const dayStr = (offsetDays: number): string => {
  const d = new Date(Date.now() - offsetDays * 86_400_000);
  return d.toISOString().slice(0, 10);
};

const colorForScore = (s: number): string => {
  if (s >= 80) return '#3ddc84';
  if (s >= 60) return '#FFB800';
  if (s >= 40) return '#FFD54F';
  return '#ff8c42';
};

// ── 1. PracticeStatsBox — top hero pair ────────────────────────

interface StatsBoxProps {
  practice: Practice;
  minutesToday: number | null;
  goalMinutes: number;
  depthScore: number | null;
  /** Optional second metric shown inside the time tile — used on the
   *  Japa screen to surface "japa count today" alongside the minutes. */
  subMetric?: { label: string; value: string | number };
  /** Compact single-box layout — used by the Japa screen so the bead
   *  counter fits on the same fold without scrolling.  Renders the
   *  three KPIs (time / sub-metric / depth) on one row with both bars
   *  stacked tightly underneath. ~120 pt tall instead of ~280. */
  compact?: boolean;
  /** When provided, the depth score row + dashed bar become a single
   *  tappable target with a small 📈 trend icon — mirrors the
   *  "↗ Details" affordance on the Exercise tab's activity cards.
   *  Use this from JapaScreen to open the DepthTrendModal. */
  onOpenTrend?: () => void;
}

export const PracticeStatsBox: React.FC<StatsBoxProps> = ({
  practice, minutesToday, goalMinutes, depthScore, subMetric, compact, onOpenTrend,
}) => {
  const { palette } = useTheme();
  const statBoxStyles = React.useMemo(() => makeStatBoxStyles(palette), [palette]);
  const label = practice === 'yoga'
    ? 'YOGA'
    : practice === 'meditation'
      ? 'MEDITATION'
      : 'JAPA';
  const goalPct = Math.min(100, Math.round(((minutesToday ?? 0) / Math.max(1, goalMinutes)) * 100));
  const scoreColor = depthScore == null ? NO_DATA_COLOR : colorForScore(depthScore);

  // ── Compact single-box mode (Japa screen) ──
  //
  // Same visual language as the Yoga / Meditation "time today" hero
  // (huge minutes number, " / goal" sub-text, full-width gold progress
  // bar) — but with the Japa-specific japa-count surfaced on the RIGHT
  // side so it sits inline with the minutes hero.  Saves vertical
  // space so the bead counter can sit on the same fold.
  if (compact) {
    const DepthRow = (
      <View style={statBoxStyles.compactDepthBlock}>
        <View style={statBoxStyles.compactBarLabelRow}>
          <Text style={statBoxStyles.compactBarLabel}>
            SADHANA DEPTH SCORE
            {onOpenTrend && (
              <Text style={statBoxStyles.compactTrendIcon}>  📈</Text>
            )}
          </Text>
          <Text style={[statBoxStyles.compactBarValue, { color: scoreColor }]}>
            {showNum(depthScore)} / 100
          </Text>
        </View>
        <DashedBar value={barPct(depthScore)} color={scoreColor} compact />
        {onOpenTrend && (
          <Text style={statBoxStyles.compactTrendHint}>tap for daily trend ›</Text>
        )}
      </View>
    );

    return (
      // Compact mode is used INSIDE a ScrollView that already provides
      // horizontal padding (JapaScreen), so we cancel the wrap's own
      // marginHorizontal to keep this box flush with the Sadhana picker
      // below it. Also lighter top/bottom margins so the bead counter
      // fits on the same fold.
      <View style={[statBoxStyles.wrap, { marginHorizontal: 0, marginTop: 0, marginBottom: SPACING.sm }]}>
        <View style={[statBoxStyles.box, statBoxStyles.compactBox]}>
          {/* Hero row — Yoga-style big "TIME TODAY" on the left,
              right-aligned "japas today" stat on the right. */}
          <View style={statBoxStyles.compactHeroRow}>
            <View style={{ flex: 1 }}>
              <Text style={statBoxStyles.compactHeroLabel}>{label} TIME TODAY</Text>
              <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
                <Text style={statBoxStyles.compactHeroValue}>{showNum(minutesToday)}</Text>
                <Text style={statBoxStyles.compactHeroGoal}> / {goalMinutes} min</Text>
              </View>
            </View>
            {subMetric && (
              <View style={statBoxStyles.compactRightStat}>
                <Text style={statBoxStyles.compactRightValue}>{subMetric.value}</Text>
                <Text style={statBoxStyles.compactRightLabel}>japas today</Text>
              </View>
            )}
          </View>

          {/* Time-goal solid bar — full width like Yoga's hero */}
          <View style={[statBoxStyles.progressTrack, { height: 10, marginTop: 6 }]}>
            <View style={[statBoxStyles.progressFill, { width: `${goalPct}%` }]} />
          </View>
          <Text style={statBoxStyles.compactHeroPct}>{goalPct}% of today's goal</Text>

          {/* Depth score block — tappable to open the trend modal */}
          {onOpenTrend ? (
            <TouchableOpacity onPress={onOpenTrend} activeOpacity={0.7}>
              {DepthRow}
            </TouchableOpacity>
          ) : DepthRow}
        </View>
      </View>
    );
  }

  // ── Full mode (Yoga / Meditation screens) ──
  return (
    <View style={statBoxStyles.wrap}>
      {/* Tile A — time-today hero with solid progress bar */}
      <View style={statBoxStyles.box}>
        <Text style={statBoxStyles.heroLabel}>{label} TIME TODAY</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text style={statBoxStyles.heroValue}>{showNum(minutesToday)}</Text>
          <Text style={statBoxStyles.heroGoal}> / {goalMinutes} min</Text>
        </View>
        <View style={statBoxStyles.progressTrack}>
          <View style={[statBoxStyles.progressFill, { width: `${goalPct}%` }]} />
        </View>
        <Text style={statBoxStyles.heroPct}>{goalPct}% of today's goal</Text>

        {/* Optional sub-metric (japa count today, mala count, etc.) */}
        {subMetric && (
          <View style={statBoxStyles.subMetricRow}>
            <Text style={statBoxStyles.subMetricLabel}>{subMetric.label}</Text>
            <Text style={statBoxStyles.subMetricValue}>{subMetric.value}</Text>
          </View>
        )}
      </View>

      {/* Tile B — Sadhana Depth Score with HORIZONTAL DASHED bar */}
      <View style={[statBoxStyles.box, { marginTop: SPACING.sm }]}>
        <View style={statBoxStyles.depthHeaderRow}>
          <Text style={statBoxStyles.heroLabel}>SADHANA DEPTH SCORE</Text>
          <Text style={[statBoxStyles.depthValue, { color: scoreColor }]}>
            {showNum(depthScore)}<Text style={statBoxStyles.depthOf}> / 100</Text>
          </Text>
        </View>
        <DashedBar value={barPct(depthScore)} color={scoreColor} />
        <Text style={statBoxStyles.depthHint}>
          Today's overall practice quality — weighted HRV · BPM · duration · SpO₂.
        </Text>
      </View>
    </View>
  );
};

// Horizontal dashed bar — 12 segments fill from left to right based on score
const DashedBar: React.FC<{ value: number; color: string; compact?: boolean }> = ({
  value, color, compact,
}) => {
  const { palette } = useTheme();
  const statBoxStyles = React.useMemo(() => makeStatBoxStyles(palette), [palette]);
  const SEGMENTS = 12;
  const filled = Math.round((value / 100) * SEGMENTS);
  return (
    <View style={[statBoxStyles.dashedRow, { alignSelf: 'stretch' }]}>
      {Array.from({ length: SEGMENTS }).map((_, i) => {
        const fill = i < filled ? color : 'rgba(255,255,255,0.15)';
        return (
          <View
            key={i}
            style={[
              statBoxStyles.dashedSeg,
              compact && { height: 10 },
              { backgroundColor: fill, borderWidth: i < filled ? 0 : 1, borderColor: 'rgba(255,255,255,0.10)' },
            ]}
          />
        );
      })}
    </View>
  );
};

// ── 2. SessionList — per-session cards (mirrors ExerciseScreen) ──

interface SessionCard {
  id: string;
  name: string;
  minutes: number;
  depthScore: number;
}

interface SessionListProps {
  practice: Practice;
}

export const SessionList: React.FC<SessionListProps> = ({ practice }) => {
  const { palette } = useTheme();
  const sessionStyles = React.useMemo(() => makeSessionStyles(palette), [palette]);
  const [sessions, setSessions] = useState<SessionCard[]>([]);
  const [weekScoreSeries, setWeekScoreSeries] = useState<number[]>([]);
  const [weekMinutesTotal, setWeekMinutesTotal] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = await getDB();
        const today = todayStr();
        const dayStart = today + 'T00:00:00';
        const dayEnd   = today + 'T23:59:59';

        // Today's spiritual sessions. session_spiritual doesn't store a
        // practice label (yoga vs meditation), so we show every soulsync
        // session that happened today. Duration is computed from the
        // start_time / end_time pair in julian days.
        const rows = await db.getAllAsync<{
          session_id: string;
          start_time: string;
          end_time: string | null;
          depth_score: number | null;
        }>(
          `SELECT session_id, start_time, end_time, depth_score
           FROM session_spiritual
           WHERE start_time BETWEEN ? AND ?
           ORDER BY start_time ASC`,
          [dayStart, dayEnd]
        ).catch(() => []);

        const named: SessionCard[] = rows.map((r, idx) => {
          const durSec = r.end_time
            ? Math.max(0, (Date.parse(r.end_time) - Date.parse(r.start_time)) / 1000)
            : 0;
          return {
            id: r.session_id,
            name: `Session ${idx + 1} · ${practice}`,
            minutes: Math.round(durSec / 60),
            depthScore: Math.round(r.depth_score ?? 0),
          };
        });

        // 7-day depth-score series for the trend sparkline
        const series: number[] = [];
        for (let i = 6; i >= 0; i--) {
          const d = dayStr(i);
          const ds = d + 'T00:00:00', de = d + 'T23:59:59';
          const r = await db.getFirstAsync<{ v: number | null }>(
            `SELECT AVG(depth_score) AS v FROM session_spiritual
             WHERE start_time BETWEEN ? AND ?`,
            [ds, de]
          ).catch(() => null);
          series.push(Math.round(r?.v ?? 0));
        }

        // 7-day total minutes for the practice
        const repo = practice === 'yoga' ? exerciseRepo : soulActivityRepo;
        const all = await repo.list();
        let weekMin = 0;
        for (let i = 6; i >= 0; i--) {
          const d = dayStr(i);
          const activityName = practice === 'yoga'
            ? 'yoga'
            : practice === 'meditation' ? 'meditation' : 'japa';
          weekMin += all
            .filter((e: any) => e.activity === activityName && e.date === d)
            .reduce((s: number, e: any) => s + (e.durationMin || 0), 0);
        }

        if (!cancelled) {
          setSessions(named);
          setWeekScoreSeries(series);
          setWeekMinutesTotal(weekMin);
        }
      } catch { /* leave empty arrays; dummy fallback below */ }
    })();
    return () => { cancelled = true; };
  }, [practice]);

  // Real sessions only — an empty week renders as an empty week.
  const fallbackSessions: SessionCard[] = sessions;
  const fallbackSeries = weekScoreSeries;
  const fallbackTotal  = weekMinutesTotal;

  // Pull Sadhana Path names from the user's routine so each session card
  // can show "Morning Sadhana Path" instead of generic "Session N · yoga"
  const [pathNames, setPathNames] = useState<string[]>([]);
  useEffect(() => {
    (async () => {
      const list = await routineRepo.list();
      const cats = practice === 'yoga'
        ? ['yoga']
        : practice === 'meditation'
          ? ['meditate', 'sandhya']
          : ['japa', 'sandhya'];
      const names = list
        .filter(r => cats.includes(r.category) && r.steps && r.steps.length > 0)
        .map(r => r.name);
      setPathNames(names);
    })();
  }, [practice]);

  return (
    <View style={sessionStyles.wrap}>
      {fallbackSessions.map((s, idx) => {
        const sc = colorForScore(s.depthScore);
        const sessionName = pathNames[idx] ?? s.name;
        return (
          <View key={s.id} style={sessionStyles.card}>
            <View style={sessionStyles.cardHeader}>
              <Text style={sessionStyles.cardIcon}>
                {practice === 'yoga' ? '🧘‍♀️' : practice === 'japa' ? '📿' : '🪷'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={sessionStyles.cardName} numberOfLines={2}>{sessionName}</Text>
                <Text style={sessionStyles.cardSub}>{s.minutes} min · today</Text>
              </View>
              <View style={sessionStyles.cardScoreBox}>
                <Text style={[sessionStyles.cardScore, { color: sc }]}>{s.depthScore}</Text>
                <Text style={sessionStyles.cardScoreLabel}>SCORE</Text>
              </View>
            </View>

            {/* Week trend sparkline + total */}
            <Text style={sessionStyles.weekLabel}>WEEK TREND · DEPTH SCORE</Text>
            <WeekSparkline values={fallbackSeries} height={36} />
            <Text style={sessionStyles.weekTotal}>
              Week total · {fallbackTotal} min practised
            </Text>
          </View>
        );
      })}
    </View>
  );
};

// ── 3. BeforeAfterVitals — shown after Soulsync stops ─────────

interface BeforeAfterProps {
  practice: Practice;
  /** True when a Soulsync session is currently active.  The table only
   *  renders when this is FALSE (after the session has stopped). */
  isActive: boolean;
}

interface VitalRow {
  icon: string;
  label: string;
  before: number;
  after: number;
  unit: string;
  betterLower: boolean;
}

export const BeforeAfterVitals: React.FC<BeforeAfterProps> = ({ practice, isActive }) => {
  const { palette } = useTheme();
  const beforeAfterStyles = React.useMemo(() => makeBeforeAfterStyles(palette), [palette]);
  const [rows, setRows] = useState<VitalRow[] | null>(null);

  useEffect(() => {
    if (isActive) return;  // live trends are showing instead
    let cancelled = false;
    (async () => {
      try {
        const db = await getDB();
        const today = todayStr();
        const ds = today + 'T00:00:00', de = today + 'T23:59:59';

        // Today's baseline averages (before the session)
        const base = await db.getFirstAsync<{ bpm: number | null; hrv: number | null; spo2: number | null }>(
          `SELECT AVG(ambient_bpm) AS bpm, AVG(ambient_rmssd) AS hrv, AVG(spo2) AS spo2
           FROM ambient_baseline WHERE timestamp BETWEEN ? AND ?`,
          [ds, de]
        ).catch(() => null);

        // Today's session-telemetry averages (during/after the session)
        const dur = await db.getFirstAsync<{ bpm: number | null; hrv: number | null; spo2: number | null }>(
          `SELECT AVG(t.bpm) AS bpm, AVG(t.rmssd_ms) AS hrv, AVG(t.spo2) AS spo2
           FROM session_telemetry t
           JOIN session_spiritual s ON s.session_id = t.session_id
           WHERE s.start_time BETWEEN ? AND ?`,
          [ds, de]
        ).catch(() => null);

        // A comparison needs a real reading on BOTH sides. Anything the ring
        // did not measure is omitted rather than filled in.
        const pair = (x?: number | null, y?: number | null): [number, number] | null =>
          x != null && x > 0 && y != null && y > 0 ? [x, y] : null;
        const round1 = (n: number) => Math.round(n * 10) / 10;
        const bpmPair  = pair(base?.bpm,  dur?.bpm);
        const hrvPair  = pair(base?.hrv,  dur?.hrv);
        const spo2Pair = pair(base?.spo2, dur?.spo2);

        const out: VitalRow[] = [];
        if (bpmPair)  out.push({ icon: '❤️', label: 'Resting BPM', before: Math.round(bpmPair[0]), after: Math.round(bpmPair[1]), unit: 'bpm', betterLower: true  });
        if (hrvPair)  out.push({ icon: '〰️', label: 'HRV (RMSSD)', before: Math.round(hrvPair[0]), after: Math.round(hrvPair[1]), unit: 'ms',  betterLower: false });
        if (spo2Pair) out.push({ icon: '🫁', label: 'SpO₂',        before: round1(spo2Pair[0]),    after: round1(spo2Pair[1]),    unit: '%',   betterLower: false });
        if (!cancelled) setRows(out);
      } catch { /* leave null */ }
    })();
    return () => { cancelled = true; };
  }, [isActive, practice]);

  if (isActive || !rows || rows.length === 0) return null;

  const title = practice === 'yoga'
    ? 'VITALS · BEFORE vs DURING YOGA'
    : practice === 'japa'
      ? 'VITALS · BEFORE vs DURING JAPA'
      : 'VITALS · BEFORE vs DURING MEDITATION';

  return (
    <View style={beforeAfterStyles.card}>
      <Text style={beforeAfterStyles.title}>{title}</Text>
      {rows.map(r => {
        const delta = r.after - r.before;
        const improved = r.betterLower ? delta < 0 : delta > 0;
        const deltaColor = delta === 0 ? COLORS.muted : (improved ? '#3ddc84' : '#FFD54F');
        const arrow = delta > 0 ? '▲' : delta < 0 ? '▼' : '·';
        const deltaText = delta === 0
          ? '—'
          : `${arrow} ${Math.abs(delta).toFixed(r.unit === '%' ? 1 : 0)} ${r.unit}`;
        return (
          <View key={r.label} style={beforeAfterStyles.row}>
            <Text style={beforeAfterStyles.rowIcon}>{r.icon}</Text>
            <Text style={beforeAfterStyles.rowLabel}>{r.label}</Text>
            <View style={beforeAfterStyles.rowVals}>
              <Text style={beforeAfterStyles.rowBefore}>{r.before}</Text>
              <Text style={beforeAfterStyles.rowArrow}>→</Text>
              <Text style={beforeAfterStyles.rowAfter}>
                {r.after}
                <Text style={beforeAfterStyles.rowUnit}> {r.unit}</Text>
              </Text>
            </View>
            <Text style={[beforeAfterStyles.rowDelta, { color: deltaColor }]}>
              {deltaText}
            </Text>
          </View>
        );
      })}
      <Text style={beforeAfterStyles.footnote}>
        Lower BPM · higher HRV · steady SpO₂ = practice landed well in your body.
      </Text>
    </View>
  );
};

// ── Styles ─────────────────────────────────────────────────────

const makeStatBoxStyles = (C: typeof COLORS) => StyleSheet.create({
  wrap: { marginHorizontal: SPACING.md, marginTop: SPACING.sm },
  box: {
    backgroundColor: C.cardBg,
    borderRadius: 16,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 184, 0, 0.30)',
  },
  heroLabel: {
    fontSize: 13, color: C.gold,
    fontWeight: '700', letterSpacing: 1.2,
    marginBottom: 6,
  },
  heroValue: { fontSize: 52, color: C.cream, fontWeight: '800', lineHeight: 58 },
  heroGoal:  { fontSize: 16, color: C.muted, fontWeight: '600' },
  progressTrack: {
    height: 10, backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 5, marginTop: SPACING.sm, overflow: 'hidden',
  },
  progressFill: { height: '100%', backgroundColor: C.gold, borderRadius: 5 },
  heroPct: { fontSize: 14, color: C.cream, fontWeight: '600', marginTop: 6 },

  // Depth score tile
  depthHeaderRow: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginBottom: SPACING.sm,
  },
  depthValue: { fontSize: 36, fontWeight: '800' },
  depthOf:    { fontSize: 14, color: C.muted, fontWeight: '600' },
  depthHint:  {
    fontSize: 11, color: C.muted, fontStyle: 'italic',
    marginTop: SPACING.sm, lineHeight: 16,
  },

  // Sub-metric row inside the time tile (e.g. "japa count today: 324")
  subMetricRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    paddingTop: SPACING.sm, marginTop: SPACING.sm,
    borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.06)',
  },
  subMetricLabel: { fontSize: 12, color: C.muted, fontWeight: '700', letterSpacing: 0.5 },
  subMetricValue: { fontSize: 24, color: C.cream, fontWeight: '800' },

  // ── Compact single-box mode (Japa screen) ──
  // Slightly tighter padding than the full mode so the box fits the
  // same fold as the bead counter and Soul Sync button.
  compactBox: { paddingVertical: 12, paddingHorizontal: 14 },

  // Hero row: yoga-style time on the left, japas-today stat on the right.
  compactHeroRow: {
    flexDirection: 'row', alignItems: 'flex-start',
  },
  compactHeroLabel: {
    fontSize: 13, color: C.gold,
    fontWeight: '700', letterSpacing: 1.2,
    marginBottom: 4,
  },
  compactHeroValue: { fontSize: 44, color: C.cream, fontWeight: '800', lineHeight: 48 },
  compactHeroGoal:  { fontSize: 14, color: C.muted, fontWeight: '600' },
  compactHeroPct:   { fontSize: 12, color: C.cream, fontWeight: '600', marginTop: 4 },
  compactRightStat: { alignItems: 'flex-end', justifyContent: 'flex-start', paddingLeft: SPACING.md },
  compactRightValue: { fontSize: 22, color: C.cream, fontWeight: '800', lineHeight: 26 },
  compactRightLabel: { fontSize: 10, color: C.muted, fontWeight: '700', marginTop: 2 },

  compactTitle: {
    fontSize: 11, color: C.gold, fontWeight: '800', letterSpacing: 1.2,
    marginBottom: 8,
  },
  compactKpiRow: {
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'flex-end',
    marginBottom: SPACING.sm,
  },
  compactKpiCell: { flex: 1, alignItems: 'center' },
  compactKpiValue: { fontSize: 28, color: C.cream, fontWeight: '800', lineHeight: 30 },
  compactKpiLabel: {
    fontSize: 10, color: C.muted, fontWeight: '700',
    textAlign: 'center', marginTop: 2, lineHeight: 12,
  },

  // Labels above each bar so the user can identify what they're seeing
  compactBarLabelRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline',
    marginTop: 8, marginBottom: 4,
  },
  compactBarLabel: { fontSize: 10, color: C.muted, fontWeight: '800', letterSpacing: 0.8 },
  compactBarValue: { fontSize: 12, color: C.cream, fontWeight: '700' },
  compactTrendIcon: { fontSize: 12, color: C.gold },
  compactTrendHint: {
    fontSize: 10, color: C.muted, fontStyle: 'italic',
    marginTop: 4, textAlign: 'right',
  },
  compactDepthBlock: { marginTop: 4 },

  // Horizontal dashed bar (12 segments)
  dashedRow: {
    flexDirection: 'row', gap: 4,
    marginTop: 2,
  },
  dashedSeg: {
    flex: 1, height: 12, borderRadius: 3,
  },
});

const makeSessionStyles = (C: typeof COLORS) => StyleSheet.create({
  wrap: { marginHorizontal: SPACING.md, marginTop: SPACING.sm },
  card: {
    backgroundColor: C.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1, borderColor: C.border,
    marginBottom: SPACING.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  cardIcon:   { fontSize: 28, marginRight: SPACING.sm },
  cardName:   { fontSize: 16, color: C.cream, fontWeight: '700' },
  cardSub:    { fontSize: 12, color: C.muted, marginTop: 2 },
  cardScoreBox: { alignItems: 'flex-end' },
  cardScore:  { fontSize: 28, fontWeight: '800' },
  cardScoreLabel: { fontSize: 9, color: C.muted, fontWeight: '700', letterSpacing: 1 },

  weekLabel: {
    fontSize: 10, color: C.muted, fontWeight: '800',
    letterSpacing: 1, marginTop: 6, marginBottom: 4,
  },
  weekTotal: {
    fontSize: 11, color: C.muted, fontStyle: 'italic',
    marginTop: 6, textAlign: 'right',
  },
});

const makeBeforeAfterStyles = (C: typeof COLORS) => StyleSheet.create({
  card: {
    marginHorizontal: SPACING.md, marginTop: SPACING.sm,
    backgroundColor: C.cardBg,
    borderRadius: 14,
    padding: SPACING.md,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.18)',
  },
  title: {
    fontSize: 12, color: C.gold,
    fontWeight: '800', letterSpacing: 1,
    marginBottom: SPACING.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  rowIcon:  { fontSize: 18, width: 26 },
  rowLabel: { flex: 1.1, fontSize: 13, color: C.cream, fontWeight: '500' },
  rowVals:  { flex: 1.4, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'flex-end', gap: 6 },
  rowBefore: { fontSize: 13, color: C.muted },
  rowArrow:  { fontSize: 11, color: C.muted },
  rowAfter:  { fontSize: 17, color: C.cream, fontWeight: '700' },
  rowUnit:   { fontSize: 11, color: C.muted, fontWeight: '500' },
  rowDelta:  { width: 70, fontSize: 12, fontWeight: '700', textAlign: 'right' },
  footnote: {
    fontSize: 10, color: C.muted, fontStyle: 'italic',
    textAlign: 'center', marginTop: SPACING.sm,
  },
});

const statBoxStyles = makeStatBoxStyles(COLORS);
const sessionStyles = makeSessionStyles(COLORS);
const beforeAfterStyles = makeBeforeAfterStyles(COLORS);
