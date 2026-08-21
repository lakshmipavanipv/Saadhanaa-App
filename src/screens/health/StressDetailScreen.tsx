/**
 * StressDetailScreen — 4-band chart (Relaxed / Low / Moderate / High) with
 * the same hero + range + about pattern as MetricDetailScreen.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import {
  ScreenHeader, ViewSwitch, WeekStrip, HeroCard, BandedChart, RangeCard, AboutCard,
  type HealthView, type DayQuality, useBackToHealth } from './HealthPrimitives';
import { STRESS_CONFIG, bandForValue } from './healthTokens';
import { syncAllRingVitals, loadStoredVitals, type RingVitalsSyncResult } from '../../soulsync/ring';
import { vitalsRepo } from '../../soulsync/db/vitalsRepo';

const DAY_MS = 86_400_000;

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

export const StressDetailScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const cfg = STRESS_CONFIG;

  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(isoDay(new Date()));
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);

  // Stored stress history. The live sync result only carries what the ring
  // handed over on THIS pull, and reads are destructive — once a page is
  // ACKed the ring drops it, so `raw.stress` is empty on every sync after the
  // one that first collected a sample. Reading vitals_sample is what makes
  // the chart survive.
  const [history, setHistory] = useState<Array<{ timestamp: Date; value: number }>>([]);
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
      try {
        const now = Date.now();
        const rows = await vitalsRepo.range('stress', now - 30 * DAY_MS, now);
        if (!cancelled) setHistory(rows.map((r) => ({ timestamp: new Date(r.ts), value: r.value })));
      } catch { /* DB not ready */ }
    })();
    return () => { cancelled = true; };
  }, [vitals]);

  /** Stored history merged with anything this sync just returned. */
  const stressSamples = useMemo(() => {
    const byTs = new Map<number, { timestamp: Date; value: number }>();
    for (const s of history) byTs.set(s.timestamp.getTime(), s);
    if (vitals) {
      for (const s of vitals.raw.stress) {
        byTs.set(s.timestamp.getTime(), { timestamp: s.timestamp, value: s.stress });
      }
    }
    return [...byTs.values()].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  }, [history, vitals]);

  const dayData = useMemo(() => {
    const arr = stressSamples;
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
  }, [vitals, selected]);

  const current = dayData.values.length > 0 ? dayData.values[dayData.values.length - 1] : null;
  const currentBand = current != null ? bandForValue(cfg, current) : null;
  const delta = current != null && dayData.baseline != null ? current - dayData.baseline : null;
  const deltaKind: 'good' | 'mid' | 'bad' = (() => {
    if (delta == null || Math.abs(delta) < 1) return 'mid';
    return delta < 0 ? 'good' : 'bad';
  })();

  const quality = useMemo(() => {
    if (!vitals) return {} as Record<string, DayQuality>;
    const buckets: Record<string, number[]> = {};
    for (const s of vitals.raw.stress) {
      if (!Number.isFinite(s.stress) || s.stress <= 0) continue;
      const iso = isoDay(s.timestamp);
      (buckets[iso] ??= []).push(s.stress);
    }
    const out: Record<string, DayQuality> = {};
    for (const [iso, vals] of Object.entries(buckets)) {
      const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
      out[iso] =
        avg < 25 ? 'good' :
        avg < 50 ? 'good' :
        avg < 75 ? 'fair' : 'poor';
    }
    return out;
  }, [vitals]);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader
        title="Stress"
        iconEmoji="🧘"
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
        eyebrow={`Now · ${formatLongDate(selected)}`}
        current={current == null ? '—' : Math.round(current)}
        unit={cfg.unit}
        baseline={dayData.baseline == null ? '—' : Math.round(dayData.baseline)}
        delta={delta != null && Math.abs(delta) >= 1
          ? `${delta > 0 ? '+' : ''}${Math.round(delta)} vs baseline`
          : null}
        deltaKind={deltaKind}
        sub={currentBand ? `In the ${currentBand} zone` : undefined}
        accent={cfg.color}
      />

      <View style={styles.chartCard}>
        <View style={styles.chartHead}>
          <Text style={styles.chartLabel}>Weekly trend · this week</Text>
          <Text style={styles.chartAside}>{dayData.values.length} readings</Text>
        </View>
        <BandedChart
          cfg={cfg}
          data={dayData.values}
          baseline={dayData.baseline}
          xLabels={['M', 'T', 'W', 'T', 'F', 'S', 'S']}
        />
      </View>

      <RangeCard
        entries={[
          { label: 'Min',  value: dayData.min == null ? '—' : Math.round(dayData.min),  unit: cfg.unit },
          { label: 'Avg',  value: dayData.avg == null ? '—' : Math.round(dayData.avg),  unit: cfg.unit },
          { label: 'Peak', value: dayData.max == null ? '—' : Math.round(dayData.max),  unit: cfg.unit },
        ]}
      />

      <AboutCard
        icon="🌬️"
        title="How stress is scored"
        body={cfg.aboutBody}
        bands={[
          { name: 'Relaxed',  range: '0–25',   tone: 'good' },
          { name: 'Low',      range: '25–50',  tone: 'good' },
          { name: 'Moderate', range: '50–75',  tone: 'mid'  },
          { name: 'High',     range: '75–100', tone: 'bad'  },
        ]}
        footnote="Bands are indicative — most healthy days sit in Relaxed or Low. Trend matters more than a single reading."
        accent={cfg.color}
      />
    </ScrollView>
  );
};

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
