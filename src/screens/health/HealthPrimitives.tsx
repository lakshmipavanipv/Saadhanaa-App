/**
 * HealthPrimitives — shared building blocks for the redesigned Health hub
 * and every metric detail screen. Each component takes the palette from
 * ThemeContext, so light/dark toggle keeps working.
 *
 * Kept in one file because they're tightly coupled: the DetailScreens
 * all glue WeekStrip → HeroCard → BandedChart → RangeCard → AboutCard
 * top-to-bottom.
 */

import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Dimensions, BackHandler } from 'react-native';
import Svg, { Path, Line, Rect, Circle, LinearGradient, Stop, Defs } from 'react-native-svg';
import { COLORS, SPACING, FONT_SIZES } from '../../theme';
import { useTheme } from '../../ThemeContext';
import { useFocusEffect } from '@react-navigation/native';
import type { MetricConfig } from './healthTokens';
import { HEALTH_COLORS } from './healthTokens';

const SCREEN_W = Dimensions.get('window').width;

// ═══════════════════════════════════════════════════════════════════════════
//  ViewSwitch — Day / Week / Month segmented control
// ═══════════════════════════════════════════════════════════════════════════

export type HealthView = 'day' | 'week' | 'month';

interface ViewSwitchProps {
  value: HealthView;
  onChange: (v: HealthView) => void;
}

export const ViewSwitch: React.FC<ViewSwitchProps> = ({ value, onChange }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => switchStyles(palette), [palette]);
  return (
    <View style={styles.wrap}>
      {(['day', 'week', 'month'] as HealthView[]).map((v) => (
        <TouchableOpacity
          key={v}
          style={[styles.btn, value === v && styles.btnActive]}
          onPress={() => onChange(v)}
          activeOpacity={0.75}
        >
          <Text style={[styles.txt, value === v && styles.txtActive]}>
            {v[0].toUpperCase() + v.slice(1)}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
};

const switchStyles = (C: typeof COLORS) => StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    backgroundColor: C.cardBg,
    borderColor: C.border, borderWidth: 1,
    borderRadius: 10, padding: 3, marginBottom: 14,
    gap: 2,
  },
  btn: { flex: 1, paddingVertical: 7, alignItems: 'center', borderRadius: 8 },
  btnActive: { backgroundColor: 'rgba(255,255,255,0.05)' },
  txt: { fontSize: 12, fontWeight: '600', color: C.muted, letterSpacing: 0.2 },
  txtActive: { color: C.cream },
});

// ═══════════════════════════════════════════════════════════════════════════
//  WeekStrip — 7-day row with prev/next chevrons and per-day quality dots
// ═══════════════════════════════════════════════════════════════════════════

export type DayQuality = 'good' | 'fair' | 'poor' | null;

interface WeekStripProps {
  /** ISO date (YYYY-MM-DD) of the selected day. */
  selected: string;
  /** Called with a new ISO date when the user taps a different day. */
  onSelect: (isoDate: string) => void;
  /** Optional per-day quality lookup. */
  quality?: Record<string, DayQuality>;
  /** Accent tint for the selected day pill (defaults to gold). */
  accent?: string;
}

const DAY_LETTERS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

function parseIso(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Return the 7 dates that share the same week (Sun..Sat) as `iso`. */
function weekOf(iso: string): Date[] {
  const d = parseIso(iso);
  const dow = d.getDay(); // 0=Sun
  const sunday = new Date(d.getTime() - dow * DAY_MS);
  return Array.from({ length: 7 }, (_, i) => new Date(sunday.getTime() + i * DAY_MS));
}

export const WeekStrip: React.FC<WeekStripProps> = ({
  selected, onSelect, quality, accent,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => weekStripStyles(palette, accent ?? palette.gold), [palette, accent]);
  const days = weekOf(selected);
  const todayIso = isoDay(new Date());

  const shift = (delta: number) => {
    const cur = parseIso(selected);
    cur.setDate(cur.getDate() + delta * 7);
    onSelect(isoDay(cur));
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.nav} onPress={() => shift(-1)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
        <Text style={styles.chev}>‹</Text>
      </TouchableOpacity>
      <View style={styles.row}>
        {days.map((d) => {
          const iso = isoDay(d);
          const isSel = iso === selected;
          const isToday = iso === todayIso;
          const q = quality?.[iso] ?? null;
          const dotColor =
            q === 'good' ? '#7BE4B8' :
            q === 'fair' ? '#F5C56B' :
            q === 'poor' ? '#FF7A85' : null;
          return (
            <TouchableOpacity
              key={iso}
              style={[styles.day, isSel && styles.daySel]}
              onPress={() => onSelect(iso)}
              activeOpacity={0.75}
            >
              <Text style={[styles.letter, isSel && styles.letterSel]}>
                {DAY_LETTERS[d.getDay()]}
              </Text>
              <Text style={[styles.num, isSel && styles.numSel, isToday && styles.numToday]}>
                {d.getDate()}
              </Text>
              {dotColor
                ? <View style={[styles.dot, { backgroundColor: dotColor }]} />
                : <View style={[styles.dot, styles.dotEmpty]} />}
            </TouchableOpacity>
          );
        })}
      </View>
      <TouchableOpacity style={styles.nav} onPress={() => shift(1)} hitSlop={{top:8,bottom:8,left:8,right:8}}>
        <Text style={styles.chev}>›</Text>
      </TouchableOpacity>
    </View>
  );
};

const weekStripStyles = (C: typeof COLORS, accent: string) => StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 16 },
  nav: { width: 20, height: 40, alignItems: 'center', justifyContent: 'center' },
  chev: { fontSize: 22, color: C.muted, fontWeight: '300' },
  row: { flex: 1, flexDirection: 'row', gap: 3 },
  day: {
    flex: 1, alignItems: 'center', paddingVertical: 7,
    borderRadius: 10, gap: 4,
  },
  daySel: {
    backgroundColor: 'rgba(179,155,255,0.10)',
    borderWidth: 1, borderColor: accent,
  },
  letter: {
    fontSize: 9, fontWeight: '700', color: C.muted,
    letterSpacing: 1, textTransform: 'uppercase',
  },
  letterSel: { color: accent },
  num: { fontSize: 14, fontWeight: '600', color: C.cream },
  numSel: { color: C.cream },
  numToday: { color: C.gold },
  dot: {
    width: 5, height: 5, borderRadius: 3, marginTop: 2,
  },
  dotEmpty: { backgroundColor: 'transparent', borderWidth: 1, borderColor: C.muted },
});

// ═══════════════════════════════════════════════════════════════════════════
//  HeroCard — current value LEFT · 7-day baseline RIGHT
// ═══════════════════════════════════════════════════════════════════════════

interface HeroCardProps {
  eyebrow: string;
  current: string | number;
  unit: string;
  baseline: string | number;
  /** Signed delta, e.g. "−3", "+4". Set null to hide the pill. */
  delta?: string | null;
  /** How to color the delta pill. */
  deltaKind?: 'good' | 'mid' | 'bad';
  /** Small line under the big number. */
  sub?: string;
  /** Small line under the baseline number. */
  baselineSub?: string;
  accent: string;
}

export const HeroCard: React.FC<HeroCardProps> = ({
  eyebrow, current, unit, baseline, delta, deltaKind = 'good',
  sub, baselineSub, accent,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => heroStyles(palette, accent), [palette, accent]);
  const chipStyle =
    deltaKind === 'good' ? styles.deltaGood :
    deltaKind === 'mid'  ? styles.deltaMid : styles.deltaBad;
  return (
    <View style={styles.card}>
      <View style={styles.col}>
        <Text style={styles.k}>{eyebrow}</Text>
        <View style={styles.bigRow}>
          <Text style={styles.big}>{current}</Text>
          <Text style={styles.bigU}>{unit}</Text>
        </View>
        {delta ? <Text style={[styles.delta, chipStyle]}>{delta}</Text> : null}
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
      </View>
      <View style={[styles.col, styles.colRight]}>
        <Text style={styles.k}>7-day baseline</Text>
        <View style={styles.medRow}>
          <Text style={styles.med}>{baseline}</Text>
          <Text style={styles.medU}>{unit}</Text>
        </View>
        <Text style={styles.sub}>{baselineSub ?? 'rolling avg\nover last 7 days'}</Text>
      </View>
    </View>
  );
};

const heroStyles = (C: typeof COLORS, accent: string) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: C.cardBg,
    borderColor: C.border, borderWidth: 1,
    borderLeftWidth: 3, borderLeftColor: accent,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  col: { flex: 1 },
  colRight: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderLeftColor: C.border,
    paddingLeft: 12, marginLeft: 12,
  },
  k: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  bigRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  big: { fontSize: 46, color: C.cream, fontWeight: '700' /* serif fallback */, letterSpacing: -1 },
  bigU: { fontSize: 14, color: C.muted, marginLeft: 3 },
  medRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  med: { fontSize: 28, color: C.cream, fontWeight: '600', letterSpacing: -0.5 },
  medU: { fontSize: 12, color: C.muted, marginLeft: 3 },
  delta: {
    alignSelf: 'flex-start', marginTop: 6,
    paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999,
    fontSize: 10, fontWeight: '700', letterSpacing: 0.6,
  },
  deltaGood: { backgroundColor: 'rgba(123,228,184,0.14)', color: '#7BE4B8' },
  deltaMid:  { backgroundColor: 'rgba(245,197,107,0.14)', color: '#F5C56B' },
  deltaBad:  { backgroundColor: 'rgba(255,122,133,0.14)', color: '#FF7A85' },
  sub: {
    marginTop: 'auto', paddingTop: 8,
    fontSize: 11, color: C.muted, lineHeight: 15,
  },
});

// ═══════════════════════════════════════════════════════════════════════════
//  BandedChart — Y-axis with named bands + line trace + baseline dashed line
// ═══════════════════════════════════════════════════════════════════════════

interface BandedChartProps {
  cfg: MetricConfig;
  /** Data points ordered chronologically. */
  data: number[];
  /** 7-day baseline plotted as a dashed horizontal line. */
  baseline?: number | null;
  /** X-axis tick labels (must be same length as ticks you want; auto-spaces evenly). */
  xLabels?: string[];
}

const CHART_H = 180;
const CHART_LEFT_W = 46;

export const BandedChart: React.FC<BandedChartProps> = ({ cfg, data, baseline, xLabels }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => bandedStyles(palette), [palette]);
  const chartW = SCREEN_W - SPACING.md * 2 /* screen padding */ - 16 * 2 /* card padding */ - CHART_LEFT_W - 8;
  const plotW = Math.max(120, chartW);
  const plotH = CHART_H;

  const yRange = cfg.yMax - cfg.yMin;
  const vy = (v: number) => plotH - ((v - cfg.yMin) / yRange) * plotH;

  // Build the line path
  const path = useMemo(() => {
    if (!data.length) return '';
    const step = plotW / Math.max(1, data.length - 1);
    return data.map((v, i) => {
      const x = i * step;
      const y = Math.max(0, Math.min(plotH, vy(v)));
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }, [data, plotW, cfg.yMin, cfg.yMax]);

  const fillPath = path ? `${path} L${plotW.toFixed(1)},${plotH} L0,${plotH} Z` : '';
  const baselineY = baseline != null ? vy(baseline) : null;
  const gradId = `bandFill-${cfg.key}`;

  // Y-axis labels ordered top → bottom (band names + upper values)
  const yLabels = [...cfg.bands].reverse();

  return (
    <View>
      <View style={styles.wrap}>
        <View style={[styles.yaxis, { height: plotH }]}>
          {yLabels.map((b, i) => (
            <View key={`${b.name}-${i}`} style={styles.yaxisRow}>
              <Text style={styles.yval}>{Math.round(b.to)}</Text>
              <Text style={styles.yname}>{b.name}</Text>
            </View>
          ))}
        </View>

        <View style={[styles.plot, { width: plotW, height: plotH }]}>
          {/* Band backgrounds — stacked from bottom */}
          {cfg.bands.map((b, i) => {
            const bottomPct = ((b.from - cfg.yMin) / yRange) * 100;
            const heightPct = ((b.to - b.from) / yRange) * 100;
            const bg =
              b.tint === 'low'  ? HEALTH_COLORS.tintLow :
              b.tint === 'warn' ? HEALTH_COLORS.tintWarn : HEALTH_COLORS.tintOk;
            return (
              <View
                key={`band-${i}`}
                pointerEvents="none"
                style={[
                  styles.band,
                  { bottom: `${bottomPct}%`, height: `${heightPct}%`, backgroundColor: bg },
                ]}
              />
            );
          })}
          {/* Band divider lines */}
          {cfg.bands.slice(0, -1).map((b, i) => {
            const bottomPct = ((b.to - cfg.yMin) / yRange) * 100;
            return (
              <View
                key={`line-${i}`}
                pointerEvents="none"
                style={[styles.bandLine, { bottom: `${bottomPct}%`, borderColor: palette.border }]}
              />
            );
          })}
          {/* SVG line + fill */}
          <Svg width={plotW} height={plotH} style={StyleSheet.absoluteFillObject}>
            <Defs>
              <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={cfg.color} stopOpacity={0.30} />
                <Stop offset="1" stopColor={cfg.color} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            {fillPath ? <Path d={fillPath} fill={`url(#${gradId})`} /> : null}
            {path ? <Path d={path} stroke={cfg.color} strokeWidth={2} fill="none" strokeLinecap="round" strokeLinejoin="round" /> : null}
            {baselineY != null && (
              <Line x1={0} y1={baselineY} x2={plotW} y2={baselineY}
                    stroke={cfg.color} strokeDasharray="3 4" strokeWidth={1} opacity={0.6} />
            )}
            {data.length > 0 && (
              <Circle
                cx={plotW}
                cy={vy(data[data.length - 1])}
                r={4}
                fill={cfg.color}
                stroke={palette.cardBg}
                strokeWidth={2}
              />
            )}
          </Svg>
        </View>
      </View>
      {xLabels && xLabels.length > 0 && (
        <View style={styles.xrow}>
          <View style={{ width: CHART_LEFT_W + 8 }} />
          <View style={styles.xlabels}>
            {xLabels.map((lbl, i) => (
              <Text key={`${lbl}-${i}`} style={styles.xlbl}>{lbl}</Text>
            ))}
          </View>
        </View>
      )}
    </View>
  );
};

const bandedStyles = (C: typeof COLORS) => StyleSheet.create({
  wrap: { flexDirection: 'row', gap: 8, marginTop: 8 },
  yaxis: {
    width: CHART_LEFT_W,
    justifyContent: 'space-between',
    paddingVertical: 6,
    alignItems: 'flex-end',
  },
  yaxisRow: { alignItems: 'flex-end' },
  yval: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 1 },
  yname: { fontSize: 10, color: C.cream, marginTop: 1, fontWeight: '500' },
  plot: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10, overflow: 'hidden', position: 'relative',
  },
  band: { position: 'absolute', left: 0, right: 0 },
  bandLine: {
    position: 'absolute', left: 0, right: 0,
    borderTopWidth: StyleSheet.hairlineWidth, borderStyle: 'dashed',
  },
  xrow: { flexDirection: 'row', marginTop: 6 },
  xlabels: { flex: 1, flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  xlbl: { fontSize: 10, color: C.muted, letterSpacing: 0.4 },
});

// ═══════════════════════════════════════════════════════════════════════════
//  RangeCard — three-column min / avg / max strip
// ═══════════════════════════════════════════════════════════════════════════

interface RangeCardProps {
  entries: Array<{ label: string; value: string | number; unit?: string }>;
}

export const RangeCard: React.FC<RangeCardProps> = ({ entries }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => rangeStyles(palette), [palette]);
  return (
    <View style={styles.card}>
      {entries.map((e, i) => (
        <View key={`${e.label}-${i}`} style={[styles.col, i > 0 && styles.colBorder]}>
          <Text style={styles.k}>{e.label}</Text>
          <View style={styles.vRow}>
            <Text style={styles.v}>{e.value}</Text>
            {e.unit ? <Text style={styles.u}>{e.unit}</Text> : null}
          </View>
        </View>
      ))}
    </View>
  );
};

const rangeStyles = (C: typeof COLORS) => StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: C.cardBg,
    borderColor: C.border, borderWidth: 1,
    borderRadius: 14, paddingVertical: 14, marginBottom: 12,
  },
  col: { flex: 1, alignItems: 'center', paddingHorizontal: 6 },
  colBorder: { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: C.border },
  k: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase' },
  vRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  v: { fontSize: 22, color: C.cream, fontWeight: '600', letterSpacing: -0.4 },
  u: { fontSize: 11, color: C.muted, marginLeft: 3 },
});

// ═══════════════════════════════════════════════════════════════════════════
//  AboutCard — plain-language explainer with icon + optional band chips
// ═══════════════════════════════════════════════════════════════════════════

interface AboutCardProps {
  icon: string;
  title: string;
  body: string;
  bands?: Array<{ name: string; range: string; tone?: 'good' | 'mid' | 'bad' | 'flat' }>;
  footnote?: string;
  accent: string;
}

export const AboutCard: React.FC<AboutCardProps> = ({ icon, title, body, bands, footnote, accent }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => aboutStyles(palette, accent), [palette, accent]);
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        <View style={styles.pill}><Text style={styles.pillIcon}>{icon}</Text></View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.body}>{body}</Text>
      {bands && bands.length > 0 ? (
        <View style={[styles.bandRow, { marginTop: 12 }]}>
          {bands.map((b, i) => (
            <View
              key={`${b.name}-${i}`}
              style={[
                styles.bandChip,
                b.tone === 'good' ? styles.bandGood :
                b.tone === 'mid'  ? styles.bandMid  :
                b.tone === 'bad'  ? styles.bandBad  : styles.bandFlat,
              ]}
            >
              <Text style={styles.bandName}>{b.name}</Text>
              <Text
                style={[
                  styles.bandVal,
                  b.tone === 'good' ? styles.bandValGood :
                  b.tone === 'mid'  ? styles.bandValMid  :
                  b.tone === 'bad'  ? styles.bandValBad  : styles.bandValFlat,
                ]}
              >{b.range}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {footnote ? <Text style={styles.foot}>{footnote}</Text> : null}
    </View>
  );
};

const aboutStyles = (C: typeof COLORS, accent: string) => StyleSheet.create({
  card: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  pill: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: 'rgba(240,208,138,0.15)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 10,
  },
  pillIcon: { fontSize: 16 },
  title: { fontSize: 14, fontWeight: '600', color: C.cream, flex: 1 },
  body: { fontSize: 12.5, color: C.cream, lineHeight: 19, marginTop: 6, opacity: 0.9 },
  bandRow: { flexDirection: 'row', gap: 6 },
  bandChip: {
    flex: 1, borderRadius: 8, padding: 8, alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.03)',
  },
  bandGood: { backgroundColor: 'rgba(123,228,184,0.12)' },
  bandMid:  { backgroundColor: 'rgba(245,197,107,0.12)' },
  bandBad:  { backgroundColor: 'rgba(255,122,133,0.12)' },
  bandFlat: { backgroundColor: 'rgba(255,255,255,0.03)' },
  bandName: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 1, textTransform: 'uppercase' },
  bandVal:  { fontSize: 13, color: C.cream, marginTop: 3, fontWeight: '600' },
  bandValGood: { color: '#7BE4B8' },
  bandValMid:  { color: '#F5C56B' },
  bandValBad:  { color: '#FF7A85' },
  bandValFlat: { color: C.cream },
  foot: { marginTop: 12, fontSize: 11, color: C.muted, fontStyle: 'italic', lineHeight: 16 },
});

// ═══════════════════════════════════════════════════════════════════════════
//  ScreenHeader — back arrow + title with optional inline icon
// ═══════════════════════════════════════════════════════════════════════════

interface ScreenHeaderProps {
  title: string;
  iconEmoji?: string;
  onBack: () => void;
}

export const ScreenHeader: React.FC<ScreenHeaderProps> = ({ title, iconEmoji, onBack }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => headerStyles(palette), [palette]);
  return (
    <View style={styles.row}>
      <TouchableOpacity style={styles.back} onPress={onBack} hitSlop={{top:8,bottom:8,left:8,right:8}}>
        <Text style={styles.backTxt}>‹</Text>
      </TouchableOpacity>
      {iconEmoji ? <Text style={styles.icon}>{iconEmoji}</Text> : null}
      <Text style={styles.title}>{title}</Text>
    </View>
  );
};

const headerStyles = (C: typeof COLORS) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, marginBottom: 12 },
  back: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center', marginRight: 10,
  },
  backTxt: { fontSize: 22, color: C.cream, fontWeight: '400', marginTop: -3 },
  icon: { fontSize: 22, marginRight: 8 },
  title: { fontSize: 22, color: C.cream, fontWeight: '600' },
});

/**
 * Send Back to the Health tab from any health detail screen.
 *
 * These screens are hidden routes on a BOTTOM TAB navigator, not a stack, so
 * there is no back entry to pop — goBack() lands on the navigator's first tab,
 * which is Home. Both the header button and Android's hardware/gesture back
 * have to be redirected, or the two disagree.
 */
export function useBackToHealth(navigation: { navigate?: (r: string) => void } | undefined) {
  const goHealth = React.useCallback(() => {
    navigation?.navigate?.('Health');
    return true;   // handled — do not let the default pop through
  }, [navigation]);

  useFocusEffect(
    React.useCallback(() => {
      const sub = BackHandler.addEventListener('hardwareBackPress', goHealth);
      return () => sub.remove();
    }, [goHealth])
  );

  return goHealth;
}
