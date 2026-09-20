/**
 * JapaTimeCard — how long japa actually took, day by day.
 *
 * WHY THIS IS A BAR CHART AND NOT A LINE
 *
 * A line implies the value existed between the points. Japa time does not: a
 * day with no practice is a real zero, not a dip on the way somewhere. Bars
 * say "this day, this much" and nothing more, which is all the data supports.
 *
 * WHY THE BARS ARE DRAWN BY HAND
 *
 * They are flex children with a percentage height, so they cannot overflow the
 * card the way the chart library's fixed pixel width did. There is no axis to
 * misalign and no label to collide.
 *
 * WHAT EACH NUMBER MEANS
 *
 *   Total      — every measured second in the window, added up.
 *   Typical    — the median of the days japa actually happened, not the mean
 *                over all days. A mean across a fortnight with four blank days
 *                describes nobody's practice; the median describes a normal
 *                day of practice, which is the question being asked.
 *   Longest    — the best single day, with its date, so the figure can be
 *                recognised rather than just admired.
 *
 * Days with beads but no measurable time are drawn as a hairline rather than
 * nothing, so "I practised and it vanished" never happens.
 */

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { japaDaysInRange, formatJapaTime } from '../analytics/JapaTime';
import type { JapaDayRow } from '../db/japaTimeRepo';

/** Local YYYY-MM-DD, matching the app's own day boundary. */
const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};

export const JapaTimeCard: React.FC<{ days?: number }> = ({ days = 14 }) => {
  const [rows, setRows] = useState<JapaDayRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    const to = new Date();
    const from = new Date(to.getTime() - (days - 1) * 86_400_000);
    void japaDaysInRange(iso(from), iso(to)).then((r) => {
      if (!cancelled) setRows(r);
    });
    return () => { cancelled = true; };
  }, [days]);

  if (rows == null) {
    return (
      <View style={styles.card}>
        <Text style={styles.subtitle}>Reading your japa log…</Text>
      </View>
    );
  }

  // Fill the blank days explicitly. Leaving them out would compress the chart
  // and quietly hide the gaps, which are the most useful thing on it.
  const byDate = new Map(rows.map((r) => [r.japa_date, r]));
  const today = new Date();
  const series: { date: string; sec: number; taps: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = iso(new Date(today.getTime() - i * 86_400_000));
    const row = byDate.get(d);
    series.push({ date: d, sec: row?.active_sec ?? 0, taps: row?.tap_count ?? 0 });
  }

  const practised = series.filter((p) => p.sec > 0);
  const totalSec = series.reduce((a, p) => a + p.sec, 0);
  const typicalSec = median(practised.map((p) => p.sec));
  const best = series.reduce<{ date: string; sec: number; taps: number } | null>(
    (b, p) => (b == null || p.sec > b.sec ? p : b), null
  );
  const peak = Math.max(1, ...series.map((p) => p.sec));

  if (totalSec === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.title}>Time spent in japa</Text>
        <Text style={styles.subtitle}>
          Nothing timed in the last {days} days. Japa is timed from the beads
          themselves — count on the ring or on screen and the minutes appear
          here on their own. There is no timer to remember to start.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Time spent in japa</Text>
      <Text style={styles.subtitle}>
        Measured from the gaps between your beads, over the last {days} days.
      </Text>

      <View style={styles.chart}>
        {series.map((p) => {
          const pct = (p.sec / peak) * 100;
          const isToday = p.date === iso(today);
          return (
            <View key={p.date} style={styles.barSlot}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    {
                      // A day with beads but no measurable time still gets a
                      // visible mark; it happened, it was just too short.
                      height: `${p.sec > 0 ? Math.max(4, pct) : p.taps > 0 ? 2 : 0}%`,
                      backgroundColor: isToday ? COLORS.gold : '#7a6320',
                    },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.axis}>
        <Text style={styles.axisLabel}>{series[0].date.slice(5)}</Text>
        <Text style={styles.axisLabel}>today</Text>
      </View>

      <View style={styles.statRow}>
        <Stat label="Total" value={formatJapaTime(totalSec)} />
        <Stat label="Typical day" value={formatJapaTime(typicalSec)} />
        <Stat
          label="Longest"
          value={best && best.sec > 0 ? formatJapaTime(best.sec) : '—'}
          note={best && best.sec > 0 ? best.date.slice(5) : undefined}
        />
      </View>

      <Text style={styles.footnote}>
        Practised on {practised.length} of the last {days} days. A pause longer
        than two minutes is treated as a break and is not counted, so this is
        time chanting rather than time with the app open.
      </Text>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string; note?: string }> = ({ label, value, note }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
    {note ? <Text style={styles.statNote}>{note}</Text> : null}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
  },
  title: { color: COLORS.cream, fontSize: 15, fontWeight: '700' },
  subtitle: { color: COLORS.muted, fontSize: 11.5, lineHeight: 17, marginTop: 4 },

  chart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 96,
    gap: 3,
    marginTop: SPACING.md,
  },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3, minHeight: 0 },

  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  axisLabel: { color: COLORS.muted, fontSize: 10 },

  statRow: { flexDirection: 'row', marginTop: SPACING.md, gap: SPACING.sm },
  stat: { flex: 1 },
  statValue: { color: COLORS.cream, fontSize: 17, fontWeight: '700' },
  statLabel: { color: COLORS.muted, fontSize: 10.5, marginTop: 2 },
  statNote: { color: COLORS.muted, fontSize: 9.5, marginTop: 1, opacity: 0.8 },

  footnote: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: SPACING.md },
});
