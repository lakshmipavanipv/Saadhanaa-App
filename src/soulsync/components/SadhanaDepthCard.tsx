/**
 * SadhanaDepthCard — the Sadhana Depth Score across time, in the Insights tab.
 *
 * WHY THE AVERAGE EXCLUDES UNSCORED SITTINGS
 *
 * A sitting that ran for ninety seconds, or where the ring sent four readings,
 * has no depth score. Folding it in as a zero would say "your practice was
 * shallow" when the truth is "we did not measure it", and a fortnight of brief
 * sittings would bury a genuinely deep one. So the average is over the SCORED
 * sittings, and the header states how many of the total that was. A reader who
 * sees "7 of 11 scored" can judge the average for themselves; a reader shown
 * only the average cannot.
 *
 * WHY THE DEITY BREAKDOWN INCLUDES YOGA AND MEDITATION
 *
 * They have no deity, and dropping them would make the rows fail to add up to
 * the header above them. A breakdown that does not reconcile with its own
 * total is worse than no breakdown, so they appear under their practice name.
 *
 * WHY THE BARS ARE DRAWN BY HAND
 *
 * Percentage-height flex children cannot overflow the card, which the chart
 * library's fixed pixel width did. There is no axis to misalign.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING } from '../../theme';
import {
  sessionsInRange, aggregateDepth, depthByDeity, depthByDay, depthBand,
  type StoredSession, type DepthAggregate, type DeityDepth,
} from '../analytics/SadhanaDepth';

type Range = 'day' | 'week' | 'month';

const RANGE_DAYS: Record<Range, number> = { day: 1, week: 7, month: 30 };
const RANGE_LABEL: Record<Range, string> = { day: 'Today', week: '7 days', month: '30 days' };

const iso = (d: Date): string => {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export const SadhanaDepthCard: React.FC = () => {
  const [range, setRange] = useState<Range>('week');
  const [rows, setRows] = useState<StoredSession[] | null>(null);

  const load = useCallback(() => {
    let alive = true;
    const to = new Date();
    const from = new Date(to.getTime() - (RANGE_DAYS[range] - 1) * 86_400_000);
    void sessionsInRange(iso(from), iso(to)).then((r) => { if (alive) setRows(r); });
    return () => { alive = false; };
  }, [range]);

  useEffect(load, [load]);
  useFocusEffect(load);

  if (rows == null) {
    return <View style={styles.card}><Text style={styles.sub}>Reading your sittings…</Text></View>;
  }

  const agg: DepthAggregate = aggregateDepth(rows);
  const byDeity: DeityDepth[] = depthByDeity(rows);
  const days = depthByDay(rows);

  return (
    <View style={styles.card}>
      {/* ── Range switch ── */}
      <View style={styles.segment}>
        {(['day', 'week', 'month'] as Range[]).map((r) => (
          <TouchableOpacity
            key={r}
            style={[styles.segBtn, range === r && styles.segBtnOn]}
            onPress={() => setRange(r)}
            activeOpacity={0.8}
          >
            <Text style={[styles.segText, range === r && styles.segTextOn]}>{RANGE_LABEL[r]}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {agg.sessions === 0 ? (
        <Text style={styles.empty}>
          No Soul Sync sittings in {range === 'day' ? 'today' : `the last ${RANGE_DAYS[range]} days`}.
          Depth is measured during a sitting, so it only exists for practice you
          recorded with Soul Sync running — counting beads alone leaves nothing
          to measure the body against.
        </Text>
      ) : (
        <>
          {/* ── Headline ── */}
          <View style={styles.heroRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.kicker}>AVERAGE DEPTH</Text>
              {agg.avgScore != null ? (
                <View style={styles.heroValueRow}>
                  <Text style={[styles.hero, { color: depthBand(agg.avgScore).color }]}>
                    {agg.avgScore}
                  </Text>
                  <Text style={styles.heroOf}>/ 100</Text>
                </View>
              ) : (
                <Text style={styles.heroNone}>Not scored</Text>
              )}
              <Text style={styles.sub}>
                {agg.scored === agg.sessions
                  ? `across ${agg.sessions} sitting${agg.sessions === 1 ? '' : 's'}`
                  : `from ${agg.scored} of ${agg.sessions} sittings — the rest were too brief or too lightly measured to score`}
              </Text>
            </View>
            {agg.bestScore != null && (
              <View style={styles.bestBox}>
                <Text style={[styles.bestValue, { color: depthBand(agg.bestScore).color }]}>
                  {agg.bestScore}
                </Text>
                <Text style={styles.bestLabel}>best</Text>
                {agg.bestAt && (
                  <Text style={styles.bestWhen}>
                    {agg.bestAt.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  </Text>
                )}
              </View>
            )}
          </View>

          {/* ── Facts that are true regardless of scoring ── */}
          <View style={styles.statRow}>
            <Stat label="Sittings" value={String(agg.sessions)} />
            <Stat label="Minutes" value={String(agg.totalMinutes)} />
            <Stat
              label="Days practised"
              value={range === 'day' ? (agg.activeDays ? 'yes' : 'no') : `${agg.activeDays}/${RANGE_DAYS[range]}`}
            />
          </View>

          {/* ── Daily trend ── */}
          {range !== 'day' && days.length > 1 && (
            <>
              <Text style={styles.sectionHead}>Day by day</Text>
              <View style={styles.chart}>
                {days.map((d) => (
                  <View key={d.date} style={styles.barSlot}>
                    <View style={styles.barTrack}>
                      <View
                        style={[styles.bar, {
                          // A day with sittings but no score gets a hairline —
                          // it happened, it just could not be measured.
                          height: `${d.score != null ? Math.max(4, d.score) : 2}%`,
                          backgroundColor: d.score != null ? depthBand(d.score).color : COLORS.muted,
                        }]}
                      />
                    </View>
                  </View>
                ))}
              </View>
              <View style={styles.axis}>
                <Text style={styles.axisLabel}>{days[0].date.slice(5)}</Text>
                <Text style={styles.axisLabel}>{days[days.length - 1].date.slice(5)}</Text>
              </View>
            </>
          )}

          {/* ── Deity / practice breakdown ── */}
          <Text style={styles.sectionHead}>By sadhana</Text>
          {byDeity.map((d) => (
            <View key={d.deityId} style={styles.deityRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.deityName}>{d.deityName}</Text>
                <Text style={styles.deityMeta}>
                  {d.sessions} sitting{d.sessions === 1 ? '' : 's'} · {d.minutes} min
                  {d.malas > 0 ? ` · ${d.malas} mala${d.malas === 1 ? '' : 's'}` : ''}
                  {d.scored < d.sessions ? ` · ${d.scored} scored` : ''}
                </Text>
              </View>
              {d.avgScore != null ? (
                <Text style={[styles.deityScore, { color: depthBand(d.avgScore).color }]}>
                  {d.avgScore}
                </Text>
              ) : (
                <Text style={styles.deityScoreNone}>—</Text>
              )}
            </View>
          ))}

          {/* ── Individual sittings ── */}
          <Text style={styles.sectionHead}>Each sitting</Text>
          {[...rows].reverse().slice(0, 8).map((r) => {
            const when = new Date(r.start_time);
            return (
              <View key={r.session_id} style={styles.sessionRow}>
                <Text style={styles.sessionWhen}>
                  {when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                  {'  '}
                  {when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </Text>
                <Text style={styles.sessionWhat} numberOfLines={1}>
                  {r.deity_name ?? (r.practice ? r.practice : 'sitting')}
                  {r.duration_min != null ? ` · ${Math.round(r.duration_min)} min` : ''}
                </Text>
                {r.depth_score != null ? (
                  <Text style={[styles.sessionScore, { color: depthBand(r.depth_score).color }]}>
                    {r.depth_score}
                  </Text>
                ) : (
                  <Text style={styles.deityScoreNone}>—</Text>
                )}
              </View>
            );
          })}
          {rows.length > 8 && (
            <Text style={styles.more}>and {rows.length - 8} more in this window</Text>
          )}
        </>
      )}

      <Text style={styles.footnote}>
        Depth compares your body during a sitting with how it was beforehand:
        heart-rate variability, how far your pulse came down, how steadily you
        held, and whether you went deeper as it went on. Each score was settled
        when that sitting ended and does not change afterwards.
      </Text>
    </View>
  );
};

const Stat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.stat}>
    <Text style={styles.statValue}>{value}</Text>
    <Text style={styles.statLabel}>{label}</Text>
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

  segment: {
    flexDirection: 'row',
    backgroundColor: COLORS.darkBg,
    borderRadius: 10,
    padding: 3,
    marginBottom: SPACING.md,
  },
  segBtn: { flex: 1, paddingVertical: 7, borderRadius: 8, alignItems: 'center' },
  segBtnOn: { backgroundColor: COLORS.gold },
  segText: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  segTextOn: { color: '#1a1206', fontWeight: '700' },

  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.md },
  kicker: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  heroValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 },
  hero: { fontSize: 42, fontWeight: '700', letterSpacing: -1.5 },
  heroOf: { color: COLORS.muted, fontSize: 12, fontWeight: '600' },
  heroNone: { color: COLORS.muted, fontSize: 20, fontWeight: '700', marginTop: 4 },
  sub: { color: COLORS.muted, fontSize: 11, lineHeight: 16, marginTop: 3 },

  bestBox: {
    alignItems: 'center', paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: 12, borderWidth: 1, borderColor: COLORS.border,
  },
  bestValue: { fontSize: 20, fontWeight: '700' },
  bestLabel: { color: COLORS.muted, fontSize: 9.5, marginTop: 1 },
  bestWhen: { color: COLORS.muted, fontSize: 9.5, opacity: 0.8 },

  statRow: {
    flexDirection: 'row', marginTop: SPACING.md, paddingTop: SPACING.sm,
    borderTopWidth: 1, borderColor: COLORS.border,
  },
  stat: { flex: 1 },
  statValue: { color: COLORS.cream, fontSize: 16, fontWeight: '700' },
  statLabel: { color: COLORS.muted, fontSize: 10, marginTop: 2 },

  sectionHead: {
    color: COLORS.muted, fontSize: 10, fontWeight: '800',
    letterSpacing: 1.4, marginTop: SPACING.lg, marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },

  chart: { flexDirection: 'row', alignItems: 'flex-end', height: 76, gap: 3 },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end' },
  barTrack: { height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 3 },
  axis: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 5 },
  axisLabel: { color: COLORS.muted, fontSize: 10 },

  deityRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderTopWidth: 1, borderColor: COLORS.border,
  },
  deityName: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  deityMeta: { color: COLORS.muted, fontSize: 10.5, marginTop: 2 },
  deityScore: { fontSize: 18, fontWeight: '700' },
  deityScoreNone: { color: COLORS.muted, fontSize: 16, fontWeight: '700' },

  sessionRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: 6, borderTopWidth: 1, borderColor: COLORS.border,
  },
  sessionWhen: { color: COLORS.muted, fontSize: 10.5, width: 96 },
  sessionWhat: { color: COLORS.cream, fontSize: 11.5, flex: 1 },
  sessionScore: { fontSize: 14, fontWeight: '700' },
  more: { color: COLORS.muted, fontSize: 10.5, marginTop: 8 },

  empty: { color: COLORS.muted, fontSize: 12, lineHeight: 18 },
  footnote: { color: COLORS.muted, fontSize: 10.5, lineHeight: 15, marginTop: SPACING.lg },
});
