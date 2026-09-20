/**
 * JapaGoalCard — Japa's adapter onto the shared PracticeBox.
 *
 * All the layout lives in components/PracticeBox and all the bucketing in
 * analytics/practiceSeries, so this file holds only what is particular to
 * japa: where its figures come from, and what its four tiles say. When the
 * walk box changes shape this changes with it and cannot drift, which is the
 * whole reason the four boxes are one component rather than four that match.
 *
 * THE FIGURE HAS TO MOVE WHILE YOU COUNT
 *
 * Japa time grows RETROSPECTIVELY — the interval between two beads is only
 * known once the second one lands. So this re-reads a moment after each bead
 * rather than ticking on a timer, which would keep adding seconds after the
 * mala was put down. An open Soul Sync session is the one case whose time does
 * grow with the clock, and it gets a timer for exactly as long as it is open.
 *
 * WHAT IS MEASURED AND WHAT IS PLANNED
 *
 *   Time today   — measured from the beads themselves (analytics/JapaTime).
 *   Malas today  — completed malas, plus the one in progress on the counter.
 *   The targets  — read from Plan Your Wellbeing, never defaulted. With
 *                  nothing planned there is no bar, because marking someone
 *                  against a goal they never set is how a tracker starts lying.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { PracticeBox } from '../../components/PracticeBox';
import { JapaGoalEditor } from './JapaGoalEditor';
import { useRange } from '../../screens/health/rangeContext';
import { japaMinutesOnDate, formatJapaTime, type JapaTimeResult } from '../analytics/JapaTime';
import { japaTimeRepo } from '../db/japaTimeRepo';
import { japaPlanToday, type JapaPlanTarget } from '../analytics/JapaPlan';
import { japaSeries } from '../analytics/practiceData';
import { makeSeries, bucketsFor, type Series } from '../analytics/practiceSeries';
import { lastSessionDepth } from '../analytics/SadhanaDepth';

interface Props {
  /**
   * Malas COMPLETED today, from the history store alone.
   *
   * Not the bead counter's running total: that is restored per deity and goes
   * back to whenever the deity was first counted, and every mala in it was
   * already written to history when it completed. Adding the two reported 418
   * japa on a day with 21 beads on it.
   */
  malasToday: number;
  /** Lifetime malas, from the history store. */
  lifetimeMalas: number;
  /** How many distinct deities have ever been counted for. */
  deityCount: number;
  /** Deity this sadhana is for, shown under the name. */
  deityName?: string | null;
  /**
   * Changes on every bead. Used ONLY to trigger a re-read; the bead figures
   * themselves come from the tap log, which is dated and cannot double-count.
   */
  beadTick?: number;
  onDetails?: () => void;
  /** Opens Plan Your Wellbeing — used when a goal cannot be edited in place. */
  onOpenPlan?: () => void;
}

/**
 * Japa time as a clock, so the seconds are visible.
 *
 * Minutes alone were the wrong unit for what this number is for. Someone
 * counting beads wants to see it move, and at three seconds a bead a
 * minutes-only figure sits still for twenty beads at a stretch.
 */
const clock = (seconds: number): string => {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

export const JapaGoalCard: React.FC<Props> = ({
  malasToday, lifetimeMalas, deityCount, deityName, beadTick, onDetails, onOpenPlan,
}) => {
  const { view, selected } = useRange();

  const [time, setTime] = useState<JapaTimeResult | null>(null);
  const [plan, setPlan] = useState<JapaPlanTarget | null>(null);
  const [series, setSeries] = useState<Series>(() => {
    const b = bucketsFor(view, selected);
    return makeSeries(view, b, new Array(b.length).fill(0));
  });
  const [unavailable, setUnavailable] = useState<string | undefined>();
  const [depth, setDepth] = useState<number | null>(null);
  const [lifetimeSec, setLifetimeSec] = useState(0);
  const [editingGoal, setEditingGoal] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    void (async () => {
      const [t, p, s, d, all] = await Promise.all([
        japaMinutesOnDate(selected),
        japaPlanToday(),
        japaSeries(view, selected),
        lastSessionDepth('japa').catch(() => null),
        japaTimeRepo.allTime().catch(() => ({ seconds: 0, taps: 0, days: 0 })),
      ]);
      if (!alive) return;
      setTime(t);
      setPlan(p);
      setSeries(s.series);
      setUnavailable(s.unavailable);
      setDepth(d?.score ?? null);
      setLifetimeSec(all.seconds);

      /*
       * So the figure can be checked against a stopwatch from outside the app:
       *   adb logcat -s ReactNativeJS:V | grep JAPATIME
       * If taps climbs while sec does not, the beads are being stored but
       * their intervals are not being read back.
       */

      console.log(
        `[JAPATIME] ${selected} sec=${t.seconds} taps=${t.taps} ` +
        `stretches=${t.stretches} live=${t.live} sessions=${t.sessions}`
      );

    })();
    return () => { alive = false; };
  }, [selected, view]);

  useEffect(load, [load]);
  useFocusEffect(load);

  /*
   * Re-read shortly after each bead. Debounced rather than throttled: during
   * continuous counting the beads arrive every few seconds, so a debounce
   * lands one query in each gap instead of one per bead. The wait is capped,
   * because a plain debounce would freeze the figure during fast counting —
   * if every bead fell inside the window the timer would never expire.
   */
  const firstRun = useRef(true);
  const lastLoadAt = useRef(Date.now());
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    const MAX_WAIT = 4_000;
    const run = () => { lastLoadAt.current = Date.now(); load(); };
    if (Date.now() - lastLoadAt.current >= MAX_WAIT) { run(); return; }
    const id = setTimeout(run, 900);
    return () => clearTimeout(id);
  }, [beadTick, malasToday, load]);

  const live = time?.live ?? false;
  useEffect(() => {
    if (!live) return;
    const id = setInterval(load, 5_000);
    return () => clearInterval(id);
  }, [live, load]);

  const secondsToday = time?.seconds ?? 0;
  // Beads recorded today, from the tap log — dated, and so incapable of the
  // double count the deity's running total produced.
  const beadsToday = time?.taps ?? 0;
  const goalMin = plan?.minutes ?? null;
  const goalMalas = plan?.malas ?? null;

  return (
    <PracticeBox
      icon="📿"
      name="Japa"
      /* No margin of its own: the Japa ScrollView already pads 16, and that
         is the width the Sadhana selector below uses. Everything on this
         screen — header, weekday strip, this card, the Sadhana box — now
         shares one edge. */
      inset={false}
      /* Vertical rhythm only: the gaps between rows close up, every
         horizontal measurement untouched, so nothing shifts out of line. */
      dense
      /* One line under the name, matching the source badge the walk box has
         there — so the two headers are the same height. It carries the deity
         being counted, or says the counter is live. */
      subtitle={live
        ? '● counting now'
        : (deityName ?? plan?.names.join(' · ') ?? 'No sadhana picked')}
      onDetails={onDetails}
      primary={{
        // Malas is the headline, matching the walk box's single primary
        // figure. Time moved down to the tiles, where it is one fact about the
        // day rather than the thing the practice is measured by.
        label: 'MALAS TODAY',
        value: String(malasToday),
        goalText: goalMalas != null ? `/ ${goalMalas} malas` : undefined,
        pct: goalMalas ? (malasToday / goalMalas) * 100 : 0,
        // The same chip the walk box has. The target is read here, so it is
        // changed here — and it writes straight into Plan Your Wellbeing
        // rather than into a second store that could disagree with it.
        onEditGoal: () => setEditingGoal(true),
      }}
      /*
       * TIME on the right of the primary line, matching the walk box exactly:
       * both boxes now lead with the thing being counted and carry the day's
       * elapsed practice beside it, so moving between the two tabs does not
       * mean relearning where to look. The bead count moved down into the
       * tiles, where the other running totals are.
       */
      primaryAside={{
        label: 'TIME TODAY',
        value: secondsToday > 0 ? clock(secondsToday) : '—',
      }}
      series={series}
      seriesUnit="min"
      seriesUnavailable={unavailable}
      kpis={[
        { value: beadsToday.toLocaleString(), label: '📿 counts\ntoday' },
        { value: lifetimeMalas.toLocaleString(), label: '🪷 total\nmalas' },
        { value: String(deityCount), label: '🛕 deities\npractised' },
        {
          value: lifetimeSec > 0 ? formatJapaTime(lifetimeSec) : '—',
          label: '⏳ total\ntime',
        },
      ]}
    >
      <JapaGoalEditor
        visible={editingGoal}
        malas={goalMalas}
        minutes={goalMin}
        deityName={deityName}
        onClose={() => setEditingGoal(false)}
        onSaved={load}
        onOpenPlan={() => onOpenPlan?.()}
      />
    </PracticeBox>
  );
};
