/**
 * SoulPracticeBox — Yoga and Meditation's card, built to be the Exercise
 * card's twin.
 *
 * WHY IT MIRRORS ActivityBox EXACTLY
 *
 * Yoga and Meditation sit on one tab the way Walk and Run sit on Exercise:
 * two practices, two cards, one screen. Anything they do differently is
 * something the reader has to learn twice, so the only differences here are
 * the ones the data forces:
 *
 *   • the figure is minutes rather than steps, because that is what a logged
 *     sitting records;
 *   • the tiles are total time and number of practices, because distance and
 *     calories mean nothing for a seated practice;
 *   • Soul Sync is offered inside each card rather than once at the top of
 *     the screen. Exercise can put it above its cards because everything there
 *     is exercise; here a sitting is either yoga or meditation and the app must
 *     be told which — a bar floating above both would have to guess, and a
 *     mislabelled sitting is worse than one more control.
 *
 * Everything else — header, badges, Details, the goal chip and its sheet, the
 * chart, the tile strip, the dense rhythm — is PracticeBox, the same component
 * the walk box uses.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../ThemeContext';
import { SPACING, type Palette } from '../theme';
import { PracticeBox } from './PracticeBox';
import { PracticeGoalEditor } from './PracticeGoalEditor';
import { useRange } from '../screens/health/rangeContext';
import { bodyActivitySeries, soulActivitySeries } from '../soulsync/analytics/practiceData';
import { makeSeries, bucketsFor, type Series } from '../soulsync/analytics/practiceSeries';
import { practiceGoalToday, type SoulPractice } from '../soulsync/analytics/PracticeGoals';
import { SoulsyncSessionBar } from '../soulsync/components/SoulsyncSessionBar';
import type { useSoulsyncSession } from '../soulsync/hooks/useSoulsyncSession';

interface Props {
  practice: SoulPractice;
  icon: string;
  name: string;
  /** Minutes logged today, which the screen already computes. */
  minutesToday: number;
  /** Sittings logged today. */
  sessionsToday: number;
  /** Everything ever, for the tiles. */
  minutesEver: number;
  sessionsEver: number;

  /** The screen's Soul Sync hook, shared so both cards drive one session. */
  session: ReturnType<typeof useSoulsyncSession>;
  onSessionEnd?: () => void;

  onDetails?: () => void;
  onOpenPlan?: () => void;
  onLog?: () => void;
  /** Bumped by the screen to force a re-read. */
  refreshKey?: number;
}

const fmt = (m: number): string =>
  m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`;

export const SoulPracticeBox: React.FC<Props> = ({
  practice, icon, name, minutesToday, sessionsToday, minutesEver, sessionsEver,
  session, onSessionEnd, onDetails, onOpenPlan, onLog, refreshKey,
}) => {
  const { palette } = useTheme();
  const s = React.useMemo(() => makeStyles(palette), [palette]);
  const { view, selected } = useRange();

  const [series, setSeries] = useState<Series>(() => {
    const b = bucketsFor(view, selected);
    return makeSeries(view, b, new Array(b.length).fill(0));
  });
  const [unavailable, setUnavailable] = useState<string | undefined>();
  const [goalMin, setGoalMin] = useState<number | null>(null);
  const [planNames, setPlanNames] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    void (async () => {
      const [r, goal] = await Promise.all([
        practice === 'yoga'
          ? bodyActivitySeries('yoga', view, selected)
          : soulActivitySeries('meditation', view, selected),
        practiceGoalToday(practice),
      ]);
      if (!alive) return;
      setSeries(r.series);
      setUnavailable(r.unavailable);
      setGoalMin(goal.minutes);
      setPlanNames(goal.names);
    })();
    return () => { alive = false; };
  }, [practice, view, selected]);

  useEffect(load, [load, refreshKey]);
  useFocusEffect(load);

  const pct = goalMin ? Math.min(100, Math.round((minutesToday / goalMin) * 100)) : 0;

  return (
    <PracticeBox
      icon={icon}
      name={name}
      badges={[{ text: '✍️ logged by you', tone: 'manual' }]}
      subtitle={planNames.length ? planNames.join(' · ') : 'No daily goal set'}
      onDetails={onDetails}
      dense
      primary={{
        label: 'TIME TODAY',
        value: minutesToday > 0 ? fmt(minutesToday) : '—',
        goalText: goalMin != null ? `/ ${goalMin} min` : undefined,
        pct,
        onEditGoal: () => setEditing(true),
      }}
      primaryAside={{
        label: 'SITTINGS TODAY',
        value: String(sessionsToday),
      }}
      series={series}
      seriesUnit="min"
      seriesUnavailable={unavailable}
      kpis={[
        { value: minutesEver > 0 ? fmt(minutesEver) : '—', label: '⏳ total time\nspent' },
        { value: String(sessionsEver), label: '📅 practices\nlogged' },
      ]}
    >
      {/* Inside the card, so the sitting is attributed to THIS practice. */}
      <SoulsyncSessionBar
        practice={practice}
        session={session}
        flush
        onSessionEnd={onSessionEnd}
        onViewInsights={onDetails}
      />

      {onLog && (
        <TouchableOpacity style={s.logBtn} onPress={onLog} activeOpacity={0.85}>
          <Text style={s.logBtnText}>+ Log a past {name.toLowerCase()} session</Text>
        </TouchableOpacity>
      )}

      <PracticeGoalEditor
        visible={editing}
        practice={practice}
        minutes={goalMin}
        onClose={() => setEditing(false)}
        onSaved={load}
        onOpenPlan={() => onOpenPlan?.()}
      />
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
});
