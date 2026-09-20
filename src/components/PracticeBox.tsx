/**
 * PracticeBox — the one box Walk, Japa, Yoga and Meditation all use.
 *
 * WHY ONE COMPONENT RATHER THAN FOUR THAT MATCH
 *
 * They were four. Each grew its own header, its own idea of a progress bar,
 * its own chart and its own tile strip, and they drifted apart the moment any
 * one of them was touched — which is how the Japa box ended up twice the
 * height of the walk box it was written to resemble. "Make them look the same"
 * is not a styling instruction; it is an instruction to stop having four.
 *
 * The walk box was the one that read best, so its measurements are the ones
 * kept here: 30pt figure, 6pt bar, 48pt chart, a tile strip on a faint panel.
 * Anything that wants to differ does so through props, and anything that has
 * no prop cannot differ at all.
 *
 * WHAT EACH PRACTICE SUPPLIES
 *
 *   primary     the headline figure and its target — steps, minutes, whatever
 *               that practice counts in.
 *   secondary   an optional second figure sharing the row (Japa's malas).
 *   series      already bucketed by analytics/practiceSeries, so every box's
 *               bars cover the same stretch of clock.
 *   kpis        three or four totals.
 *
 * A TARGET THAT WAS NEVER SET DRAWS NO BAR
 *
 * An empty track beside a figure reads as "you achieved none of it" when the
 * truth is that nothing was set to achieve. `goalText` absent means no bar.
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../ThemeContext';
import { SPACING, type Palette } from '../theme';
import type { Series } from '../soulsync/analytics/practiceSeries';

/**
 * Chart height. The walk box called `<WeekSparkline height={48} />`, so 48 is
 * the number, not the component's own 56 default.
 */
const CHART_H = 48;
/** The same chart with its rows closed up. See the `dense` prop. */
const CHART_H_DENSE = 38;

export interface BoxFigure {
  label: string;
  /** Already formatted — "6,240", "0:09", "18". */
  value: string;
  /** "/ 6,000 steps". Absent means no target was set, so no bar is drawn. */
  goalText?: string;
  /** 0-100. Ignored when goalText is absent. */
  pct?: number;
  /**
   * Shows the inline chip the walk box has always had, right beside the
   * target. It sat there because that is where the target is being read, and
   * moving it to a full-width button below put the control a long way from the
   * number it changes.
   */
  onEditGoal?: () => void;
}

export interface BoxKpi {
  value: string;
  /** Two lines: an emoji-led word and a qualifier. Use \n between them. */
  label: string;
}

interface Props {
  icon: string;
  /** A drawn icon, used instead of `icon` when supplied. */
  iconNode?: React.ReactNode;
  name: string;
  /**
   * Show the icon alone, without the name, subtitle or badges.
   *
   * Japa only. On that tab the card sits under a header that already says
   * "Japa Counter" and a picker that already says which deity — so repeating
   * both inside the card spent the whole header row restating the screen. The
   * mala icon is enough to say what the box is.
   */
  iconOnly?: boolean;
  /**
   * A figure shown in the header row, where the name would be. Used by Japa
   * for today's bead count, which is the number being watched while counting
   * and so belongs at the top rather than in the tile strip.
   */
  headerStat?: { label: string; value: string };
  /** Deity, or the auto/manual source — one short line under the name. */
  subtitle?: string;
  /** Small pills beside the name: "auto by ring", a reminder time. */
  badges?: { text: string; tone?: 'auto' | 'manual' | 'info' }[];
  onDetails?: () => void;

  primary: BoxFigure;
  secondary?: BoxFigure;
  /**
   * A figure parked at the RIGHT end of the primary figure's line.
   *
   * Japa's bead count lives here: it belongs beside the malas, not in the
   * header above it and not in the tile strip below, because malas and beads
   * are the same act counted two ways and reading one against the other is
   * the point. It shares the line rather than taking a column, so the
   * progress bar underneath still spans the full width.
   */
  primaryAside?: { label: string; value: string };

  series: Series;
  /** Unit word for the chart total — "steps", "min", "beads". */
  seriesUnit: string;
  /**
   * Said instead of the chart when the source cannot fill these buckets — a
   * yoga session logged with a date and no time cannot be placed in a
   * two-hour slot, and spreading it across the day would invent a shape.
   */
  seriesUnavailable?: string;

  kpis: BoxKpi[];
  /**
   * Side margin, as the original walk box had it.
   *
   * Exercise, Yoga and Meditation scroll with NO horizontal padding on the
   * container, so their cards carried `marginHorizontal: SPACING.md`
   * themselves. Dropping it when this component was extracted is what made the
   * walk box run edge to edge. Japa's ScrollView already pads, so it passes
   * false and the two do not stack up into a double gutter.
   */
  inset?: boolean;
  /**
   * Trim the VERTICAL rhythm only.
   *
   * Japa's card carries no name, subtitle or badges, so the space the other
   * three need for those reads as slack here. Every horizontal measurement is
   * untouched — the label, figure, bar, chart and tiles keep their widths and
   * their left edges, so nothing shifts out of line with anything else. Only
   * the gaps between the rows close up.
   */
  dense?: boolean;
  /** Anything the practice needs below the tiles — a log button, a last-session line. */
  children?: React.ReactNode;
}

export const PracticeBox: React.FC<Props> = ({
  icon, iconNode, name, iconOnly, headerStat, subtitle, badges, onDetails,
  primary, primaryAside, secondary, series, seriesUnit, seriesUnavailable, kpis,
  inset = true, dense, children,
}) => {
  const { palette } = useTheme();
  const s = React.useMemo(() => makeStyles(palette), [palette]);

  const total = series.values.reduce((a, b) => a + b, 0);
  const peak = Math.max(1, ...series.values);

  return (
    <View style={[s.card, inset && s.cardInset]}>
      {/* ── Header ── */}
      <View style={[s.header, dense && s.headerDense]}>
        {iconNode
          ? <View style={s.iconSlot}>{iconNode}</View>
          : <Text style={s.icon}>{icon}</Text>}
        <View style={{ flex: 1 }}>
          {iconOnly ? null : (
            <>
              <Text style={s.name}>{name}</Text>
              {subtitle ? <Text style={s.subtitle} numberOfLines={1}>{subtitle}</Text> : null}
              {badges && badges.length > 0 && (
                <View style={s.badgeRow}>
                  {badges.map((b) => (
                    <View key={b.text} style={[s.badge, b.tone === 'manual' && s.badgeManual]}>
                      <Text style={[s.badgeText, b.tone === 'manual' && s.badgeTextManual]}>{b.text}</Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          )}
          {headerStat && (
            <View style={s.headerStat}>
              <Text style={s.headerStatValue}>{headerStat.value}</Text>
              <Text style={s.headerStatLabel}>{headerStat.label}</Text>
            </View>
          )}
        </View>
        {onDetails && (
          <TouchableOpacity style={s.detailsBtn} onPress={onDetails} activeOpacity={0.8}>
            <Text style={s.detailsText}>↗ Details</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── Figures ── */}
      <View style={[s.figures, dense && s.figuresDense]}>
        <Figure f={primary} s={s} aside={primaryAside} />
        {secondary ? <Figure f={secondary} s={s} /> : null}
      </View>

      {/* ── Chart ── */}
      <Text style={[s.subLabel, dense && s.subLabelDense]}>{series.windowLabel.toUpperCase()}</Text>
      {/*
        THE FRAME IS ALWAYS DRAWN. THE BARS ARE NOT.

        An empty day still gets its chart area and its axis, because the axis
        is what makes the emptiness legible: "nothing between 6a and 8a" is a
        fact, and it needs the hours present to be read. Hiding the whole
        chart — which this did briefly — removed the frame along with the
        data and left a card that changed shape depending on whether you had
        practised.

        What a zero must NOT get is a bar. Every bar used to be clamped to a
        2px minimum, so an empty day came out as twelve identical stubs, which
        reads as "a little bit, all day" when the truth is none. A zero is not
        a small number; it is the absence of one, and it occupies no height.
      */}
      <View style={[s.chart, dense && s.chartDense]}>
        {series.values.map((v, i) => (
          <View key={series.buckets[i].key} style={s.barSlot}>
            <View style={[
              s.bar,
              { height: v > 0 ? Math.max(2, (v / peak) * ((dense ? CHART_H_DENSE : CHART_H) - 14)) : 0 },
              i === series.currentIndex && s.barNow,
            ]} />
          </View>
        ))}
      </View>
      <View style={s.axis}>
        {series.axis.map((label, i) => (
          <Text
            key={`${series.buckets[i].key}`}
            style={[s.axisLabel, i === series.currentIndex && s.axisLabelNow]}
          >
            {label}
          </Text>
        ))}
      </View>

      {/* One line under the axis: why the chart is empty, or what it totals. */}
      {seriesUnavailable ? (
        <Text style={s.unavailable}>{seriesUnavailable}</Text>
      ) : (
        <Text style={s.total}>
          {total > 0
            ? `${series.windowLabel} · ${Math.round(total).toLocaleString()} ${seriesUnit}`
            : 'Nothing recorded in this window.'}
        </Text>
      )}

      {/* ── Tiles ── */}
      <View style={[s.kpiGrid, dense && s.kpiGridDense]}>
        {kpis.map((k) => (
          <View key={k.label} style={s.kpiCell}>
            <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit>{k.value}</Text>
            <Text style={s.kpiLabel}>{k.label}</Text>
          </View>
        ))}
      </View>

      {children}
    </View>
  );
};

const Figure: React.FC<{
  f: BoxFigure;
  s: ReturnType<typeof makeStyles>;
  aside?: { label: string; value: string };
}> = ({ f, s, aside }) => (
  <View style={s.figureCol}>
    <View style={s.labelRow}>
      <Text style={s.figureLabel}>{f.label}</Text>
      {aside ? <Text style={s.asideLabel}>{aside.label}</Text> : null}
    </View>
    <View style={s.figureRow}>
      <Text style={s.figureValue}>{f.value}</Text>
      {f.goalText ? <Text style={s.figureGoal}> {f.goalText}</Text> : null}
      {f.onEditGoal && (
        <TouchableOpacity style={s.editGoalBtn} onPress={f.onEditGoal} activeOpacity={0.8}>
          <Text style={s.editGoalText}>✎ goal</Text>
        </TouchableOpacity>
      )}
      {aside ? (
        <>
          <View style={{ flex: 1 }} />
          <Text style={s.asideValue}>{aside.value}</Text>
        </>
      ) : null}
    </View>
    {f.goalText ? (
      <View style={s.track}>
        <View style={[s.fill, { width: `${Math.max(0, Math.min(100, f.pct ?? 0))}%` }]} />
      </View>
    ) : (
      // Keeps two columns level when only one of them has a target.
      <View style={s.trackSpacer} />
    )}
  </View>
);

// Measurements lifted from ExerciseScreen's activityMetricCard, which is the
// box the others are being matched to.
const makeStyles = (C: Palette) => StyleSheet.create({
  card: {
    marginBottom: SPACING.md,
    padding: SPACING.md,
    backgroundColor: C.cardBg,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardInset: { marginHorizontal: SPACING.md },

  header: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.sm },
  headerDense: { marginBottom: 4 },
  icon: { fontSize: 30, width: 42, textAlign: 'center', marginRight: 6 },
  // Same footprint as the emoji it replaces, so swapping one for the other
  // moves nothing else on the row.
  iconSlot: { width: 42, marginRight: 6, alignItems: 'center' },
  name: { color: C.cream, fontSize: 17, fontWeight: '800' },
  subtitle: { color: C.muted, fontSize: 11.5, marginTop: 1 },
  badgeRow: { flexDirection: 'row', gap: 6, marginTop: 4, flexWrap: 'wrap' },
  badge: {
    backgroundColor: 'rgba(125,211,252,0.12)', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  badgeManual: { backgroundColor: 'rgba(255,184,0,0.12)' },
  badgeText: { fontSize: 9, color: '#7dd3fc', fontWeight: '700' },
  headerStat: { flexDirection: 'row', alignItems: 'baseline', gap: 6 },
  headerStatValue: { color: C.cream, fontSize: 20, fontWeight: '800' },
  headerStatLabel: {
    color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1,
  },
  badgeTextManual: { color: C.gold },
  detailsBtn: {
    paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
    borderWidth: 1, borderColor: C.gold, backgroundColor: 'rgba(212,160,23,0.12)',
  },
  detailsText: { color: C.gold, fontSize: 11, fontWeight: '700' },

  figures: { flexDirection: 'row', gap: SPACING.md, marginVertical: SPACING.sm },
  figuresDense: { marginVertical: 4 },
  figureCol: { flex: 1 },
  figureLabel: {
    fontSize: 10, color: C.muted, fontWeight: '700',
    letterSpacing: 1.2, marginBottom: 4,
  },
  labelRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  figureRow: { flexDirection: 'row', alignItems: 'baseline' },
  asideLabel: { fontSize: 10, color: C.muted, fontWeight: '700', letterSpacing: 1.2 },
  asideValue: { fontSize: 24, color: C.cream, fontWeight: '800' },
  figureValue: { fontSize: 30, color: C.gold, fontWeight: '800', lineHeight: 32 },
  figureGoal: { fontSize: 13, color: C.muted, fontWeight: '500' },
  track: {
    height: 6, backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 3, marginTop: 8, overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: C.gold },
  trackSpacer: { height: 6, marginTop: 8 },
  editGoalBtn: {
    marginLeft: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6, borderWidth: 1, borderColor: C.border,
  },
  editGoalText: { color: C.muted, fontSize: 10, fontWeight: '700' },

  subLabel: {
    fontSize: 10, color: C.muted, fontWeight: '700',
    letterSpacing: 1.2, marginTop: SPACING.sm, marginBottom: 4,
  },
  subLabelDense: { marginTop: 4, marginBottom: 2 },
  chart: {
    flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around',
    height: CHART_H, paddingHorizontal: 2,
  },
  chartDense: { height: CHART_H_DENSE },
  barSlot: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  bar: {
    width: 12, borderTopLeftRadius: 3, borderTopRightRadius: 3,
    backgroundColor: 'rgba(212,160,23,0.25)',
  },
  barNow: { backgroundColor: C.gold },
  axis: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 2 },
  axisLabel: { flex: 1, textAlign: 'center', fontSize: 9, color: C.muted, fontWeight: '600' },
  axisLabelNow: { color: C.gold, fontWeight: '800' },
  total: { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 2 },
  unavailable: { fontSize: 11, color: C.muted, lineHeight: 16 },

  kpiGrid: {
    flexDirection: 'row', marginTop: SPACING.sm,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 8,
  },
  kpiGridDense: { marginTop: 6, paddingVertical: 6 },
  kpiCell: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  kpiValue: { fontSize: 16, color: C.cream, fontWeight: '700' },
  kpiLabel: {
    fontSize: 9, color: C.muted, fontWeight: '600',
    textAlign: 'center', marginTop: 3, letterSpacing: 0.3,
  },
});
