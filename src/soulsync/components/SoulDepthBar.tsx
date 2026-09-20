/**
 * SoulDepthBar — the cumulative Soul Depth score, drawn along the screen.
 *
 * WHY HORIZONTAL AND NOT A BIG NUMBER
 *
 * The per-sitting report at the top of this screen already has a large figure.
 * A second one below it competes, and the reader has to work out which is
 * which. This is a different KIND of claim — everything so far, not this
 * morning — so it gets a different shape: a bar with its bands marked, which
 * reads as a position on a scale rather than a score out of a hundred.
 *
 * WHAT THE BREAKDOWN IS FOR
 *
 * A single number about one's own body invites either belief or dismissal.
 * The table underneath gives both sides of every comparison — the ordinary
 * week and the japa sittings — so the reader can see the difference for
 * themselves and check it against how the practice felt.
 *
 * Rows with no weight are shown greyed and marked "context", because SpO2 and
 * skin temperature move less than this ring can reliably measure, and a row
 * that looks scored but isn't is worse than one that says so.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { COLORS, SPACING } from '../../theme';
import { cumulativeSoulDepth, type SoulDepthSummary } from '../analytics/SoulDepthCumulative';

const BANDS = [
  { at: 0, label: 'Unchanged' },
  { at: 35, label: 'Slight' },
  { at: 50, label: 'Mild' },
  { at: 65, label: 'Settling' },
  { at: 80, label: 'Deep' },
];

const colorFor = (score: number): string =>
  score >= 80 ? '#3ddc84' : score >= 65 ? '#7ee787'
    : score >= 50 ? '#FFD54F' : score >= 35 ? '#FFB800' : '#ff8c42';

const bandFor = (score: number): string =>
  [...BANDS].reverse().find((b) => score >= b.at)?.label ?? 'Unchanged';

/** "+4.2 ms", "−3.1 bpm" — sign always shown, because the direction is the point. */
const signed = (n: number, unit: string): string =>
  `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}${unit ? ` ${unit}` : ''}`;

export const SoulDepthBar: React.FC<{ refreshKey?: number }> = ({ refreshKey }) => {
  const [d, setD] = useState<SoulDepthSummary | null>(null);

  const load = useCallback(() => {
    let alive = true;
    void cumulativeSoulDepth()
      .then((r) => { if (alive) setD(r); })
      .catch(() => { /* the card shows its own empty state */ });
    return () => { alive = false; };
  }, []);

  useEffect(load, [load, refreshKey]);
  useFocusEffect(load);

  if (!d) return null;

  return (
    <View style={styles.card}>
      <Text style={styles.kicker}>SOUL DEPTH · ALL SITTINGS SO FAR</Text>

      {d.score == null ? (
        <Text style={styles.empty}>{d.note}</Text>
      ) : (
        <>
          <View style={styles.headRow}>
            <Text style={[styles.band, { color: colorFor(d.score) }]}>{bandFor(d.score)}</Text>
            <Text style={styles.scoreNum}>{d.score}<Text style={styles.scoreOf}> / 100</Text></Text>
          </View>

          {/* The bar. Ticks mark where the bands change, so the number has a
              scale behind it rather than being a bare figure. */}
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${d.score}%`, backgroundColor: colorFor(d.score) }]} />
            {BANDS.filter((b) => b.at > 0).map((b) => (
              <View key={b.at} style={[styles.tick, { left: `${b.at}%` }]} />
            ))}
          </View>
          <View style={styles.scaleRow}>
            {BANDS.map((b) => (
              <Text key={b.at} style={styles.scaleLabel}>{b.label}</Text>
            ))}
          </View>

          <Text style={styles.note}>{d.note}</Text>
        </>
      )}

      {d.rows.length > 0 && (
        <>
          <View style={styles.tableHead}>
            <Text style={[styles.th, styles.thMetric]}>Vital</Text>
            <Text style={styles.th}>Your week</Text>
            <Text style={styles.th}>In japa</Text>
            <Text style={styles.th}>Change</Text>
          </View>

          {d.rows.map((r) => {
            const has = r.baseline != null && r.duringJapa != null;
            const better = has && r.delta != null
              ? (r.lowerIsBetter ? r.delta < 0 : r.delta > 0)
              : null;
            return (
              <View key={r.key} style={styles.tr}>
                <View style={styles.thMetric}>
                  <Text style={[styles.metric, r.weight === 0 && styles.dim]}>{r.label}</Text>
                  <Text style={styles.weightNote}>
                    {r.weight > 0 ? `${Math.round(r.weight * 100)}% of the score` : 'context only'}
                  </Text>
                </View>
                <Text style={styles.td}>{r.baseline != null ? r.baseline : '—'}</Text>
                <Text style={styles.td}>{r.duringJapa != null ? r.duringJapa : '—'}</Text>
                <Text style={[
                  styles.td,
                  better === true && styles.good,
                  better === false && styles.bad,
                ]}>
                  {r.delta != null ? signed(r.delta, r.unit) : '—'}
                </Text>
              </View>
            );
          })}
        </>
      )}

      <Text style={styles.footnote}>
        {d.sessions > 0
          ? `From ${d.japaSamples.toLocaleString()} readings across ${d.sessions} japa sitting${d.sessions === 1 ? '' : 's'} ` +
            `(${d.totalMinutes} min), against ${d.baselineSamples.toLocaleString()} readings from your last seven ordinary days. `
          : ''}
        Your own week is the comparison, not anyone else&apos;s — so this says whether
        japa changes YOUR body, not how your body compares with other people&apos;s.
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  kicker: { color: COLORS.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },

  headRow: {
    flexDirection: 'row', alignItems: 'baseline',
    justifyContent: 'space-between', marginTop: SPACING.sm,
  },
  band: { fontSize: 18, fontWeight: '800' },
  scoreNum: { color: COLORS.cream, fontSize: 20, fontWeight: '800' },
  scoreOf: { color: COLORS.muted, fontSize: 11, fontWeight: '600' },

  track: {
    height: 10, borderRadius: 5, backgroundColor: 'rgba(255,255,255,0.06)',
    marginTop: 8, overflow: 'hidden', position: 'relative',
  },
  fill: { height: '100%', borderRadius: 5 },
  tick: {
    position: 'absolute', top: 0, bottom: 0, width: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scaleRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  scaleLabel: { color: COLORS.muted, fontSize: 8.5, flex: 1, textAlign: 'center' },

  note: { color: COLORS.cream, fontSize: 12.5, lineHeight: 18, marginTop: SPACING.sm },

  tableHead: {
    flexDirection: 'row', marginTop: SPACING.md, paddingBottom: 6,
    borderBottomWidth: 1, borderColor: COLORS.border,
  },
  th: { color: COLORS.muted, fontSize: 9, fontWeight: '800', flex: 1, textAlign: 'right', letterSpacing: 0.6 },
  thMetric: { flex: 2.2, textAlign: 'left' },
  tr: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 8, borderBottomWidth: 1, borderColor: COLORS.border,
  },
  metric: { color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  weightNote: { color: COLORS.muted, fontSize: 9, marginTop: 1 },
  dim: { color: COLORS.muted },
  td: { color: COLORS.cream, fontSize: 12.5, flex: 1, textAlign: 'right', fontWeight: '600' },
  good: { color: '#3ddc84' },
  bad: { color: '#ff8c42' },

  empty: { color: COLORS.muted, fontSize: 12.5, lineHeight: 18, marginTop: SPACING.sm },
  footnote: { color: COLORS.muted, fontSize: 10, lineHeight: 15, marginTop: SPACING.md },
});
