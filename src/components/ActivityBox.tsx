/**
 * ActivityBox — the Exercise tab's adapter onto the shared PracticeBox.
 *
 * Walking and the logged activities are measured by different instruments and
 * counted in different units, but they are the same box: this decides what
 * goes in the figures and the tiles, and PracticeBox decides what it all
 * looks like. Japa, Yoga and Meditation do the same through their own
 * adapters, so the four cannot drift apart.
 *
 * WALKING IS MEASURED, THE REST IS LOGGED
 *
 * Walk reads the ring — steps, distance, calories and the hours it saw
 * movement, all from the ring's own records. Everything else is minutes the
 * user entered, so its calorie figure is a MET estimate and says so. A number
 * the app measured and a number the app assumed must not look alike.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../ThemeContext';
import { SPACING, type Palette } from '../theme';
import { PracticeBox } from './PracticeBox';
import { WalkGlyph } from './WalkGlyph';
import { useRange } from '../screens/health/rangeContext';
import {
  walkSeries, bodyActivitySeries, walkWindowTotals, bodyActivityWindowTotals,
} from '../soulsync/analytics/practiceData';
import { makeSeries, bucketsFor, type Series } from '../soulsync/analytics/practiceSeries';
import type { BodyActivity, ExerciseEntry } from '../types';

export interface ActivityBoxProps {
  activity: BodyActivity;
  icon: string;
  name: string;
  ringAutoDetect?: boolean;
  reminder?: string;

  /** Target and its unit, as the user set them. */
  goalValue: number;
  goalUnitShort: string;

  /** Walking, from the ring. Null means the ring has not reported it. */
  stepsToday?: number;
  walkKm?: number | null;
  walkKcal?: number | null;
  walkHours?: number | null;

  /** Logged activities. */
  minutesToday: number;
  estKcalPerMin: number;
  history: ExerciseEntry[];

  onDetails?: () => void;
  onEditGoal: () => void;
  onLog: () => void;
}

export const ActivityBox: React.FC<ActivityBoxProps> = ({
  activity, icon, name, ringAutoDetect, reminder,
  goalValue, goalUnitShort,
  stepsToday = 0, walkKm, walkKcal, walkHours,
  minutesToday, estKcalPerMin, history,
  onDetails, onEditGoal, onLog,
}) => {
  const { palette } = useTheme();
  const s = React.useMemo(() => makeStyles(palette), [palette]);
  const { view, selected } = useRange();
  const isWalk = activity === 'walk';

  const [series, setSeries] = useState<Series>(() => {
    const b = bucketsFor(view, selected);
    return makeSeries(view, b, new Array(b.length).fill(0));
  });
  const [unavailable, setUnavailable] = useState<string | undefined>();
  /*
   * The tiles read the SELECTED WINDOW, not today.
   *
   * They used to read today while the chart beside them followed the range.
   * On Day they agreed by accident; on Week or Month the chart said one thing
   * and the tiles under it another, with nothing on screen to say why. These
   * come from the same store the bars do, so a tile is the sum of the bars
   * above it.
   */
  const [totals, setTotals] = useState({
    km: 0, kcal: 0, steps: 0, activeHours: 0, minutes: 0, sessions: 0,
  });

  const load = useCallback(() => {
    let alive = true;
    void (async () => {
      const [r, t] = await Promise.all([
        isWalk ? walkSeries(view, selected) : bodyActivitySeries(activity, view, selected),
        isWalk
          ? walkWindowTotals(view, selected).then((w) => ({ ...w, minutes: 0, sessions: 0 }))
          : bodyActivityWindowTotals(activity, view, selected)
              .then((m) => ({ km: 0, kcal: 0, steps: 0, activeHours: 0, ...m })),
      ]);
      if (!alive) return;
      setSeries(r.series);
      setUnavailable(r.unavailable);
      setTotals(t);
    })().catch(() => { /* the box shows an empty window */ });
    return () => { alive = false; };
  }, [activity, isWalk, view, selected]);

  useEffect(load, [load]);
  useFocusEffect(load);


  const todayValue = isWalk ? stepsToday : minutesToday;
  const pct = Math.min(100, Math.round((todayValue / Math.max(1, goalValue)) * 100));

  const calories: number | null = isWalk
    ? (walkKcal != null ? Math.round(walkKcal) : null)
    : Math.round(totals.minutes * estKcalPerMin);

  // "today" / "last 7 days" / "last 5 weeks", so each tile says which window
  // it is counting rather than leaving the reader to assume.
  const rangeWord = view === 'day' ? 'today' : view === 'week' ? 'this week' : 'this month';

  const mine = history.filter((h) => h.activity === activity);
  const last = mine[0];
  const daysSince = last
    ? Math.round((Date.now() - new Date(last.date).getTime()) / 86_400_000)
    : null;

  return (
    <PracticeBox
      icon={icon}
      // Walking gets a drawn mark; the rest keep their catalogue emoji.
      iconNode={isWalk ? <WalkGlyph size={34} color={palette.gold} /> : undefined}
      name={name}
      badges={[
        ringAutoDetect
          ? { text: '📡 auto by ring', tone: 'auto' as const }
          : { text: '✍️ manual entry', tone: 'manual' as const },
        ...(reminder ? [{ text: `⏰ ${reminder}`, tone: 'info' as const }] : []),
      ]}
      onDetails={onDetails}
      /* The same tightened vertical rhythm the Japa box uses, so the two cards
         are the same height as well as the same width. Horizontal measurements
         are untouched in both. */
      dense
      primary={{
        label: isWalk ? 'STEPS TODAY' : 'MINUTES TODAY',
        value: todayValue.toLocaleString(),
        goalText: `/ ${goalValue.toLocaleString()} ${goalUnitShort}`,
        pct,
        // Inline, where the walk box has always had it — beside the target it
        // changes, not as a separate button further down the card.
        onEditGoal,
      }}
      /*
       * The right of the primary line, where Japa puts its second figure — so
       * the two boxes read the same way wherever you are in the app.
       *
       * For walking this is ACTIVE TODAY, not "time today", and the difference
       * is not pedantry. The ring reports steps per HOUR, not minutes walked,
       * so what is actually known is how many hours saw any movement. Printing
       * "TIME TODAY 5h" beside a 3,495-step count would tell the user they
       * walked for five hours. Converting the steps to minutes would need a
       * strides-per-minute constant — the kind of invented multiplier this app
       * keeps having to take back out.
       *
       * Logged activities have real minutes, so those say TIME TODAY.
       */
      primaryAside={isWalk
        ? {
            label: 'ACTIVE TODAY',
            value: walkHours != null && walkHours > 0 ? `${walkHours}h` : '—',
          }
        : {
            label: 'TIME TODAY',
            value: minutesToday > 0 ? `${minutesToday}m` : '—',
          }}
      series={series}
      seriesUnit={isWalk ? 'steps' : 'min'}
      seriesUnavailable={unavailable}
      kpis={isWalk
        ? [
            {
              value: totals.km > 0 ? totals.km.toFixed(2) : '—',
              label: `📏 km\n${rangeWord}`,
            },
            {
              value: totals.kcal > 0 ? totals.kcal.toLocaleString() : '—',
              label: `🔥 kcal\n${rangeWord}`,
            },
          ]
        : [
            { value: String(totals.minutes), label: `⏱ minutes\n${rangeWord}` },
            {
              value: calories != null ? calories.toLocaleString() : '—',
              label: '🔥 kcal\nestimated',
            },
            { value: String(totals.sessions), label: `📅 sessions\n${rangeWord}` },
          ]}
    >
      {!ringAutoDetect && (
        <TouchableOpacity style={s.logBtn} onPress={onLog} activeOpacity={0.85}>
          <Text style={s.logBtnText}>+ Log a {name.toLowerCase()} session</Text>
        </TouchableOpacity>
      )}

      {/* Only for the activities you log. "Last session" means nothing for
          walking — the ring counts it continuously, so there is no session to
          have been last — and the line was the one row making this card taller
          than the Japa box beside it. */}
      {!ringAutoDetect && daysSince != null && last && (
        <Text style={s.lastSession}>
          Last session:{' '}
          {daysSince === 0 ? 'today' : daysSince === 1 ? 'yesterday' : `${daysSince} days ago`}
          {` · ${last.durationMin} min`}
        </Text>
      )}
    </PracticeBox>
  );
};

const makeStyles = (C: Palette) => StyleSheet.create({
  logBtn: {
    marginTop: SPACING.sm, paddingVertical: 10, borderRadius: 10,
    backgroundColor: 'rgba(212,160,23,0.15)', borderWidth: 1, borderColor: C.gold,
    alignItems: 'center',
  },
  logBtnText: { color: C.gold, fontWeight: '700', fontSize: 13 },
  lastSession: {
    fontSize: 11, color: C.muted, fontStyle: 'italic',
    marginTop: 6, textAlign: 'center',
  },
});
