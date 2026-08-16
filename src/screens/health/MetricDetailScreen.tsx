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
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import {
  ScreenHeader, ViewSwitch, WeekStrip, HeroCard, BandedChart, RangeCard, AboutCard,
  type HealthView, type DayQuality,
} from './HealthPrimitives';
import { METRIC_CONFIG, HEALTH_COLORS, bandForValue, type HealthMetric } from './healthTokens';
import { syncAllRingVitals, type RingVitalsSyncResult } from '../../soulsync/ring';

type ScalarMetric = Exclude<HealthMetric, 'sleep' | 'stress' | 'exercise'>;

const DAY_MS = 86_400_000;
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

  useEffect(() => {
    void (async () => {
      try { setVitals(await syncAllRingVitals()); } catch { /* ignore */ }
    })();
  }, []);

  // Pull raw samples for THIS metric and reduce to the selected day.
  const dayData = useMemo(() => {
    if (!vitals) return { values: [] as number[], baseline: null as number | null, min: null as number | null, avg: null as number | null, max: null as number | null };
    const arr = pickSamples(vitals, metric);
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
  }, [vitals, metric, selected]);

  const current = dayData.values.length > 0 ? dayData.values[dayData.values.length - 1] : null;
  const delta = current != null && dayData.baseline != null ? current - dayData.baseline : null;
  const deltaKind: 'good' | 'mid' | 'bad' = (() => {
    if (delta == null || Math.abs(delta) < 0.1) return 'mid';
    if (cfg.goodDelta === 'lower')  return delta < 0 ? 'good' : 'bad';
    return delta > 0 ? 'good' : 'bad';
  })();

  const quality = useMemo(() => {
    if (!vitals) return {} as Record<string, DayQuality>;
    const arr = pickSamples(vitals, metric);
    const buckets: Record<string, number[]> = {};
    for (const s of arr) {
      if (!Number.isFinite(s.value) || s.value <= 0) continue;
      const iso = isoDay(s.timestamp);
      (buckets[iso] ??= []).push(s.value);
    }
    const out: Record<string, DayQuality> = {};
    for (const [iso, vals] of Object.entries(buckets)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      const band = bandForValue(cfg, avg);
      out[iso] =
        band === 'Healthy' || band === 'Rested' || band === 'Normal' || band === 'Relaxed' ? 'good' :
        band === 'Elevated' || band === 'Recovering' || band === 'Moderate' || band === 'Low' ? 'fair' :
        band === 'High' || band === 'Fatigued' ? 'poor' :
        null;
    }
    return out;
  }, [vitals, metric, cfg]);

  const fmt = (v: number | null): string =>
    v == null ? '—' : (cfg.unit === '°C' ? v.toFixed(1) : String(Math.round(v)));

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader
        title={cfg.label}
        iconEmoji={cfg.aboutIcon}
        onBack={() => navigation?.goBack?.()}
      />

      <ViewSwitch value={view} onChange={setView} />
      <WeekStrip
        selected={selected}
        onSelect={setSelected}
        quality={quality}
        accent={cfg.color}
      />

      <HeroCard
        eyebrow={`Now · ${formatLongDate(selected)}`}
        current={fmt(current)}
        unit={cfg.unit}
        baseline={fmt(dayData.baseline)}
        delta={delta != null && Math.abs(delta) >= 0.1
          ? `${delta > 0 ? '+' : ''}${cfg.unit === '°C' ? delta.toFixed(1) : Math.round(delta)} vs baseline`
          : null}
        deltaKind={deltaKind}
        sub={dayData.min != null && dayData.max != null ? `Range · ${fmt(dayData.min)} – ${fmt(dayData.max)} ${cfg.unit}` : undefined}
        accent={cfg.color}
      />

      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartLabel}>Today · every reading</Text>
          <Text style={styles.chartAside}>{dayData.values.length} samples</Text>
        </View>
        <BandedChart
          cfg={cfg}
          data={dayData.values}
          baseline={dayData.baseline}
          xLabels={['00', '06', '12', '18', 'now']}
        />
      </View>

      <RangeCard
        entries={[
          { label: 'Min', value: fmt(dayData.min), unit: cfg.unit },
          { label: 'Avg', value: fmt(dayData.avg), unit: cfg.unit },
          { label: 'Max', value: fmt(dayData.max), unit: cfg.unit },
        ]}
      />

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

function pickSamples(v: RingVitalsSyncResult, metric: ScalarMetric): Array<{ timestamp: Date; value: number }> {
  switch (metric) {
    case 'hr':   return v.raw.hr.map((s)   => ({ timestamp: s.timestamp, value: s.hr }));
    case 'hrv':  return v.raw.hrv.map((s)  => ({ timestamp: s.timestamp, value: s.hrv }));
    case 'spo2': return v.raw.spo2.map((s) => ({ timestamp: s.timestamp, value: s.spo2 }));
    case 'temp': return v.raw.temp.map((s) => ({ timestamp: s.timestamp, value: s.tempCx10 / 10 }));
    case 'resp': return []; // ring doesn't ship this metric today
  }
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
});
