/**
 * MetricDetailScreen — one screen, five metrics. Route param `metric` picks
 * which MetricConfig from healthTokens applies.
 *
 * Layout follows the mockup:
 *   ScreenHeader → ViewSwitch → WeekStrip → HeroCard → BandedChart → RangeCard → AboutCard
 *
 * All rendering primitives live in HealthPrimitives.tsx so Stress/Sleep share
 * the same visual language.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { vitalsRepo } from '../../soulsync/db/vitalsRepo';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import {
  ScreenHeader, ViewSwitch, WeekStrip, HeroCard, BandedChart, RangeCard, AboutCard,
  type HealthView, type DayQuality, useBackToHealth } from './HealthPrimitives';
import { METRIC_CONFIG, qualityForValue, type HealthMetric } from './healthTokens';
import { syncAllRingVitals, loadStoredVitals, type RingVitalsSyncResult } from '../../soulsync/ring';

type ScalarMetric = Exclude<HealthMetric, 'sleep' | 'stress' | 'exercise'>;

const DAY_MS = 86_400_000;
/** How far back the detail screen charts and lists stored samples.
 *  Month view compares against the previous month, so it needs two of them. */
const HISTORY_DAYS = 62;
/** Days each Day/Week/Month view spans, and what it compares itself against. */
const VIEW_DAYS: Record<HealthView, number> = { day: 1, week: 7, month: 30 };
const isScalar = (m: string): m is ScalarMetric =>
  m === 'hr' || m === 'hrv' || m === 'spo2' || m === 'temp' || m === 'resp';

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export const MetricDetailScreen: React.FC<any> = ({ navigation, route }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const metric: ScalarMetric = isScalar(route?.params?.metric) ? route.params.metric : 'hr';
  const cfg = METRIC_CONFIG[metric];

  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(isoDay(new Date()));
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);
  // Stored history, read straight from vitals_sample. The screen used to
  // render only whatever the last live sync happened to return, so anything
  // the ring had already handed over and been asked to forget disappeared
  // from the charts the moment you navigated away.
  const [history, setHistory] = useState<{ timestamp: Date; value: number }[]>([]);
  const [showReadings, setShowReadings] = useState(false);
  const goBack = useBackToHealth(navigation);

  useEffect(() => {
    // Storage first so the screen has numbers immediately; the ring sync
    // then refreshes them. Awaiting the sync meant a connect, a monitoring
    // configure and ten channel pulls before anything rendered.
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadStoredVitals();
        if (!cancelled) setVitals((cur) => cur ?? stored);
      } catch { /* fall through */ }
      try {
        const live = await syncAllRingVitals();
        if (!cancelled) setVitals(live);
      } catch { /* keep whatever storage gave us */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (metric === 'resp') return;   // not a stored metric
      try {
        const now = Date.now();
        const rows = await vitalsRepo.range(metric, now - HISTORY_DAYS * DAY_MS, now);
        if (!cancelled) {
          setHistory(rows.map((r) => ({ timestamp: new Date(r.ts), value: r.value })));
        }
      } catch { /* DB not ready */ }
    })();
    return () => { cancelled = true; };
  }, [metric, vitals]);

  /**
   * Stored history plus anything the current sync just returned, de-duplicated
   * by timestamp. The live result can contain samples not yet committed, and
   * the store holds everything from before — neither is complete alone.
   */
  const samples = useMemo(() => {
    const byTs = new Map<number, { timestamp: Date; value: number }>();
    for (const s of history) byTs.set(s.timestamp.getTime(), s);
    if (vitals) for (const s of pickSamples(vitals, metric)) byTs.set(s.timestamp.getTime(), s);
    return [...byTs.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [history, vitals, metric]);

  /**
   * One average per calendar day across everything loaded. Week and month
   * views chart these, not raw readings — 30 days of 10-minute samples is
   * thousands of points, and the day-to-day trend is the thing being asked
   * for. Days with no reading are simply absent rather than plotted as zero.
   */
  const dailyAvg = useMemo(() => {
    const buckets = new Map<string, { sum: number; n: number }>();
    for (const s of samples) {
      if (!Number.isFinite(s.value) || s.value <= 0) continue;
      const iso = isoDay(s.timestamp);
      const b = buckets.get(iso) ?? { sum: 0, n: 0 };
      b.sum += s.value; b.n += 1;
      buckets.set(iso, b);
    }
    return new Map([...buckets].map(([iso, b]) => [iso, b.sum / b.n] as const));
  }, [samples]);

  /**
   * Week / month summary: daily averages inside the window ending on the
   * selected day, with the window immediately before it as the baseline. That
   * makes the hero delta "this week vs last week" rather than the day view's
   * "right now vs a rolling 7-day mean".
   */
  const periodData = useMemo(() => {
    const days = VIEW_DAYS[view];
    const end = new Date(selected + 'T00:00:00').getTime() + DAY_MS;
    const start = end - days * DAY_MS;
    const prevStart = start - days * DAY_MS;

    const series: { iso: string; value: number }[] = [];
    let prevSum = 0, prevCount = 0;
    for (const [iso, avg] of dailyAvg) {
      const t = new Date(iso + 'T00:00:00').getTime();
      if (t >= start && t < end) series.push({ iso, value: avg });
      else if (t >= prevStart && t < start) { prevSum += avg; prevCount += 1; }
    }
    series.sort((a, b) => (a.iso < b.iso ? -1 : 1));

    const values = series.map((d) => d.value);
    const avg = values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
    return {
      series,
      values,
      avg,
      min: values.length ? Math.min(...values) : null,
      max: values.length ? Math.max(...values) : null,
      baseline: prevCount > 0 ? prevSum / prevCount : null,
    };
  }, [dailyAvg, view, selected]);

  // Pull raw samples for THIS metric and reduce to the selected day.
  const dayData = useMemo(() => {
    const arr = samples;
    if (!arr.length) return { values: [], baseline: null, min: null, avg: null, max: null };
    const dayStart = new Date(selected + 'T00:00:00').getTime();
    const dayEnd = dayStart + DAY_MS;
    const cutoff7 = dayEnd - 7 * DAY_MS;
    let sum = 0, count = 0, mn = Infinity, mx = -Infinity;
    let sum7 = 0, cnt7 = 0;
    const values: number[] = [];
    for (const s of arr) {
      const t = s.timestamp.getTime();
      const v = s.value;
      if (!Number.isFinite(v) || v <= 0) continue;
      if (t >= cutoff7 && t < dayEnd) { sum7 += v; cnt7++; }
      if (t >= dayStart && t < dayEnd) {
        values.push(v);
        sum += v; count++;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    return {
      values,
      baseline: cnt7 > 0 ? sum7 / cnt7 : null,
      min: count > 0 ? mn : null,
      avg: count > 0 ? sum / count : null,
      max: count > 0 ? mx : null,
    };
  }, [samples, selected]);

  /**
   * The one shape the whole screen renders from, so Day/Week/Month differ in
   * what they summarise and nothing else. The switch used to set state that
   * no render path read, which is why tapping Week or Month changed only
   * which pill looked selected.
   */
  const panel = useMemo(() => {
    if (view === 'day') {
      const vals = dayData.values;
      return {
        headline: vals.length ? vals[vals.length - 1] : null,
        baseline: dayData.baseline,
        min: dayData.min, avg: dayData.avg, max: dayData.max,
        values: vals,
        eyebrow: `Now · ${formatLongDate(selected)}`,
        baselineWord: 'vs baseline',
        chartLabel: 'Today · every reading',
        chartAside: `${vals.length} samples`,
        xLabels: ['00', '06', '12', '18', 'now'],
      };
    }
    const week = view === 'week';
    const { series, values, avg, min, max, baseline } = periodData;
    return {
      headline: avg,
      baseline,
      min, avg, max,
      values,
      eyebrow: `${week ? '7 days' : '30 days'} to ${formatLongDate(selected)}`,
      baselineWord: week ? 'vs previous week' : 'vs previous month',
      chartLabel: `${week ? 'This week' : 'This month'} · daily average`,
      chartAside: `${series.length} of ${VIEW_DAYS[view]} days`,
      xLabels: periodXLabels(series, week),
    };
  }, [view, dayData, periodData, selected]);

  const current = panel.headline;
  const delta = current != null && panel.baseline != null ? current - panel.baseline : null;
  const deltaKind: 'good' | 'mid' | 'bad' = (() => {
    if (delta == null || Math.abs(delta) < 0.1) return 'mid';
    if (cfg.goodDelta === 'lower')  return delta < 0 ? 'good' : 'bad';
    return delta > 0 ? 'good' : 'bad';
  })();

  /**
   * The detailed report, newest first: every reading on the selected day, or
   * one row per day when the view is a week or a month. Listing 30 days of
   * raw samples would be thousands of rows nobody reads.
   */
  const reportRows = useMemo(() => {
    if (view !== 'day') {
      return [...periodData.series]
        .reverse()
        .map((d) => ({ key: d.iso, when: formatLongDate(d.iso), value: d.value }));
    }
    const start = new Date(selected + 'T00:00:00').getTime();
    const end = start + DAY_MS;
    return samples
      .filter((s) => s.timestamp.getTime() >= start && s.timestamp.getTime() < end)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .map((s) => ({
        key: String(s.timestamp.getTime()),
        when: s.timestamp.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        value: s.value,
      }));
  }, [view, periodData, samples, selected]);

  const quality = useMemo(() => {
    const out: Record<string, DayQuality> = {};
    for (const [iso, avg] of dailyAvg) out[iso] = qualityForValue(cfg, avg);
    return out;
  }, [dailyAvg, cfg]);

  const fmt = (v: number | null): string =>
    v == null ? '—' : (cfg.unit === '°C' ? v.toFixed(1) : String(Math.round(v)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader
        title={cfg.label}
        iconEmoji={cfg.aboutIcon}
        onBack={goBack}
      />

      <ViewSwitch value={view} onChange={setView} />
      <WeekStrip
        selected={selected}
        onSelect={setSelected}
        quality={quality}
        accent={cfg.color}
      />

      <HeroCard
        eyebrow={panel.eyebrow}
        current={fmt(current)}
        unit={cfg.unit}
        baseline={fmt(panel.baseline)}
        delta={delta != null && Math.abs(delta) >= 0.1
          ? `${delta > 0 ? '+' : ''}${cfg.unit === '°C' ? delta.toFixed(1) : Math.round(delta)} ${panel.baselineWord}`
          : null}
        deltaKind={deltaKind}
        sub={panel.min != null && panel.max != null ? `Range · ${fmt(panel.min)} – ${fmt(panel.max)} ${cfg.unit}` : undefined}
        accent={cfg.color}
      />

      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartLabel}>{panel.chartLabel}</Text>
          <Text style={styles.chartAside}>{panel.chartAside}</Text>
        </View>
        <BandedChart
          cfg={cfg}
          data={panel.values}
          baseline={panel.baseline}
          xLabels={panel.xLabels}
        />
      </View>

      <RangeCard
        entries={[
          { label: view === 'day' ? 'Min' : 'Lowest day',  value: fmt(panel.min), unit: cfg.unit },
          { label: view === 'day' ? 'Avg' : 'Daily avg',   value: fmt(panel.avg), unit: cfg.unit },
          { label: view === 'day' ? 'Max' : 'Highest day', value: fmt(panel.max), unit: cfg.unit },
        ]}
      />

      {/* Every reading the ring recorded on this day. The chart shows the
          shape; this shows the actual numbers and when they were taken, which
          is what makes a sparse day legible — three readings and a flat line
          look identical otherwise. */}
      <View style={styles.chartCard}>
        {/* Collapsed by default so the screen still opens on the summary, with
            an explicit control to pull up every reading — the detailed-report
            affordance rather than a list the user has to scroll past. */}
        <TouchableOpacity
          style={styles.reportBtn}
          onPress={() => setShowReadings((v) => !v)}
          activeOpacity={0.8}
        >
          <Text style={[styles.reportBtnTxt, { color: cfg.color }]}>
            {showReadings ? '▾  Hide detailed report' : '▸  Detailed report'}
          </Text>
          <Text style={styles.reportCount}>
            {reportRows.length === 0
              ? 'no readings'
              : `${reportRows.length} ${view === 'day' ? 'readings' : 'days'}`}
          </Text>
        </TouchableOpacity>
        {showReadings && (
        <>
        <View style={styles.chartHead}>
          <Text style={styles.chartLabel}>{view === 'day' ? 'Readings' : 'Daily averages'}</Text>
          <Text style={styles.chartAside}>
            {reportRows.length === 0
              ? 'none recorded'
              : view === 'day'
                ? `${reportRows.length} on ${formatLongDate(selected)}`
                : `${reportRows.length} days with data`}
          </Text>
        </View>
        {reportRows.length === 0 ? (
          <Text style={styles.emptyNote}>
            Nothing stored for this {view === 'day' ? 'day' : view} yet. The ring samples on its
            own schedule — check the monitoring interval in Settings.
          </Text>
        ) : (
          reportRows.map((r) => (
            <View key={r.key} style={styles.readingRow}>
              <Text style={styles.readingTime}>{r.when}</Text>
              <Text style={[styles.readingValue, { color: cfg.color }]}>
                {cfg.unit === '°C' ? r.value.toFixed(1) : Math.round(r.value)}
                <Text style={styles.readingUnit}> {cfg.unit}</Text>
              </Text>
            </View>
          ))
        )}
        </>
        )}
      </View>

      <AboutCard
        icon={cfg.aboutIcon}
        title={cfg.aboutTitle}
        body={cfg.aboutBody}
        bands={cfg.bands.map((b) => ({
          name: b.name,
          range: cfg.unit === '°C' ? `${b.from.toFixed(1)}–${b.to.toFixed(1)}` : `${b.from}–${b.to}`,
          tone: b.tint === 'low' ? 'bad' : b.tint === 'warn' ? 'mid' : 'good',
        }))}
        footnote={
          cfg.key === 'hr'
            ? 'Ranges for resting HR in adults. If yours sits above 100 at rest often, consider talking to a clinician.'
            : cfg.key === 'hrv'
            ? 'Bands vary by age. What matters most is your own trend against your baseline.'
            : cfg.key === 'spo2'
            ? 'Persistent readings below 92% at rest warrant medical review.'
            : cfg.key === 'temp'
            ? 'Compare against your own baseline. A sustained 0.3°C rise for days can precede feeling unwell.'
            : 'Rest values shown; expect a rise during exertion.'
        }
        accent={cfg.color}
      />
    </ScrollView>
  );
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function pickSamples(v: RingVitalsSyncResult, metric: ScalarMetric): { timestamp: Date; value: number }[] {
  switch (metric) {
    case 'hr':   return v.raw.hr.map((s)   => ({ timestamp: s.timestamp, value: s.hr }));
    case 'hrv':  return v.raw.hrv.map((s)  => ({ timestamp: s.timestamp, value: s.hrv }));
    case 'spo2': return v.raw.spo2.map((s) => ({ timestamp: s.timestamp, value: s.spo2 }));
    case 'temp': return v.raw.temp.map((s) => ({ timestamp: s.timestamp, value: s.tempCx10 / 10 }));
    case 'resp': return []; // ring doesn't ship this metric today
  }
}

/**
 * Evenly spaced date ticks. A week labels every day; a month would overrun the
 * axis, so it labels roughly one point a week plus the final day.
 */
function periodXLabels(series: { iso: string }[], week: boolean): string[] {
  if (!series.length) return [];
  const short = (iso: string, withDay: boolean): string => {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return withDay
      ? dt.toLocaleDateString(undefined, { weekday: 'narrow' })
      : `${d}/${m}`;
  };
  if (week) return series.map((p) => short(p.iso, true));
  const step = Math.max(1, Math.ceil(series.length / 5));
  const out = series.filter((_, i) => i % step === 0).map((p) => short(p.iso, false));
  const last = short(series[series.length - 1].iso, false);
  if (out[out.length - 1] !== last) out.push(last);
  return out;
}

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 80, paddingTop: 6 },
  chartCard: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  chartHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 },
  chartLabel: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase' },
  chartAside: { fontSize: 10, color: C.muted },
  reportBtn: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 4,
  },
  reportBtnTxt: { fontSize: 13, fontWeight: '700' },
  reportCount: { fontSize: 11, color: C.muted },
  readingRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingVertical: 9, borderTopWidth: 1, borderTopColor: C.border,
  },
  readingTime: { fontSize: 13, color: C.muted, fontVariant: ['tabular-nums'] },
  readingValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  readingUnit: { fontSize: 11, fontWeight: '400', color: C.muted },
  emptyNote: { fontSize: 12, color: C.muted, lineHeight: 18, paddingTop: 4 },
});
