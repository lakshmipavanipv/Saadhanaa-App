/**
 * HealthHubScreen — single-window "Health" tab. Tile grid, one block per
 * vital, each showing the CURRENT reading + 7-day baseline + tiny sparkline.
 * Tap any tile → routes to its detail screen.
 *
 * Data flow: mount → syncAllRingVitals() → cache the raw sample arrays →
 * derive current + 7d avg + sparkline points per metric. The sync is the
 * same one HealthScreen used, so no extra BLE traffic and no extra RN state.
 *
 * v5 · Tiles carry no top RAG stripe (user feedback). Category color moved
 *       onto the value text so the tile still reads at a glance.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import { syncAllRingVitals, loadStoredVitals, type RingVitalsSyncResult } from '../../soulsync/ring';
import { groupSleepSessions } from '../../soulsync/ring/ringVitalsSync';
import { HEALTH_COLORS, type HealthMetric } from './healthTokens';

const DAY_MS = 86_400_000;

interface TileSpec {
  key: HealthMetric;
  name: string;
  unit: string;
  route: string;
  routeParams?: Record<string, unknown>;
  color: string;
  /** How many decimal places to show. */
  precision?: number;
  /** Direction that means "improving" — helps color the delta chip. */
  goodDelta?: 'lower' | 'higher';
  /** Full-width tile (span 2 columns). */
  wide?: boolean;
}

const TILES: TileSpec[] = [
  { key: 'hr',    name: 'Heart rate',   unit: 'bpm', route: 'MetricDetail', routeParams: { metric: 'hr'   }, color: HEALTH_COLORS.hr,    goodDelta: 'lower'  },
  { key: 'hrv',   name: 'HRV',          unit: 'ms',  route: 'MetricDetail', routeParams: { metric: 'hrv'  }, color: HEALTH_COLORS.hrv,   goodDelta: 'higher' },
  { key: 'spo2',  name: 'SpO₂',         unit: '%',   route: 'MetricDetail', routeParams: { metric: 'spo2' }, color: HEALTH_COLORS.spo2,  goodDelta: 'higher' },
  // Skin temperature is deliberately absent. The SR16 never answers the
  // timed-monitoring command for it ({2,27,0} times out with every encoding
  // the SDK implies), so the channel produces no data on this hardware and a
  // permanently blank tile is worse than no tile.
  { key: 'resp',  name: 'Respiration',  unit: '/min',route: 'MetricDetail', routeParams: { metric: 'resp' }, color: HEALTH_COLORS.resp },
  { key: 'sleep', name: 'Sleep',        unit: 'h',   route: 'SleepDetail',                                    color: HEALTH_COLORS.sleep },
  { key: 'stress',name: 'Stress',       unit: '/100',route: 'StressDetail',                                   color: HEALTH_COLORS.stress, goodDelta: 'lower', wide: true },
];

// ── Derivation helpers ─────────────────────────────────────────────────────

interface Sample { timestamp: Date }
type SampleWithVal<K extends string> = Sample & Record<K, number>;

function computeMetric<K extends string>(
  samples: readonly SampleWithVal<K>[],
  field: K,
): { current: number | null; baseline7d: number | null; spark: number[] } {
  if (!samples.length) return { current: null, baseline7d: null, spark: [] };
  const sorted = [...samples].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  const now = Date.now();
  const cutoff = now - 7 * DAY_MS;
  let sum = 0, count = 0;
  for (const s of sorted) {
    const v = s[field] as unknown as number;
    if (!Number.isFinite(v) || v <= 0) continue;
    if (s.timestamp.getTime() >= cutoff) { sum += v; count++; }
  }
  const baseline = count > 0 ? sum / count : null;
  // current = most recent non-zero value
  let current: number | null = null;
  for (let i = sorted.length - 1; i >= 0; i--) {
    const v = sorted[i][field] as unknown as number;
    if (Number.isFinite(v) && v > 0) { current = v; break; }
  }
  // spark = last 12 non-zero values
  const spark: number[] = [];
  for (let i = sorted.length - 1; i >= 0 && spark.length < 12; i--) {
    const v = sorted[i][field] as unknown as number;
    if (Number.isFinite(v) && v > 0) spark.unshift(v);
  }
  return { current, baseline7d: baseline, spark };
}

function sleepFromResult(r: RingVitalsSyncResult | null): { current: number | null; baseline7d: number | null; spark: number[] } {
  // Nights come from groupSleepSessions, the same function the sleep screen
  // and the aggregator use.
  //
  // This used to carry its own copy of the bucketing rule, and that copy still
  // had the two bugs the shared one was written to fix: it decided which night
  // a sample belonged to by asking whether the local hour was past noon, then
  // formatted the date with toISOString(), which is UTC. So a night was split
  // in half at midday and filed a day early in IST — which is why this tile
  // read about an hour while the sleep dashboard, already on the shared
  // function, showed the real total.
  if (!r || !r.raw.sleep.length) return { current: null, baseline7d: null, spark: [] };

  const sessions = groupSleepSessions(r.raw.sleep);
  const byNight: Record<string, number> = {};

  for (const [date, samples] of sessions) {
    const sorted = [...samples].sort((a, b) => a.ringTs - b.ringTs);
    let minutes = 0;
    for (let i = 0; i < sorted.length - 1; i++) {
      const cur = sorted[i];
      const durSec = sorted[i + 1].ringTs - cur.ringTs;
      if (durSec <= 0 || durSec > 6 * 3600) continue;
      // Asleep only — 0 and 3 are awake, 34 is the session-end marker.
      if (cur.sleepModel === 0 || cur.sleepModel === 3 || cur.sleepModel === 34) continue;
      minutes += durSec / 60;
    }
    if (minutes > 0) byNight[date] = (byNight[date] ?? 0) + minutes;
  }

  const nights = Object.entries(byNight).sort(([a], [b]) => a.localeCompare(b));
  if (!nights.length) return { current: null, baseline7d: null, spark: [] };
  const current = nights[nights.length - 1][1] / 60;              // hours
  const lastSeven = nights.slice(-7).map(([, m]) => m / 60);
  const baseline = lastSeven.reduce((sum, v) => sum + v, 0) / lastSeven.length;
  return { current, baseline7d: baseline, spark: lastSeven };
}

// ── Component ──────────────────────────────────────────────────────────────

export const HealthHubScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [syncedAt, setSyncedAt] = useState<number | null>(null);

  const run = React.useCallback(async () => {
    setStatus('syncing');
    try {
      const r = await syncAllRingVitals();
      setVitals(r);
      setSyncedAt(Date.now());
      setStatus('done');
    } catch {
      setStatus('error');
    }
  }, []);

  // Paint from storage first, then refresh over BLE. The screen used to await
  // the whole ring sync — connect, configure monitoring, pull ten channels —
  // before drawing anything, so it sat blank for seconds while the phone
  // already held the numbers. Stored data appears immediately; the sync
  // overwrites it when it lands.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const stored = await loadStoredVitals();
        if (!cancelled) setVitals((cur) => cur ?? stored);
      } catch { /* fall through to the live sync */ }
      if (!cancelled) void run();
    })();
    return () => { cancelled = true; };
  }, [run]);

  // Derive per-metric current + baseline + spark.
  const metrics = useMemo(() => {
    if (!vitals) return {} as Record<HealthMetric, { current: number | null; baseline7d: number | null; spark: number[] }>;
    return {
      hr:    computeMetric(vitals.raw.hr,   'hr'),
      hrv:   computeMetric(vitals.raw.hrv,  'hrv'),
      spo2:  computeMetric(vitals.raw.spo2, 'spo2'),
      // ring stores tempCx10; convert to °C when reading through
      temp:  (() => {
        const raw = vitals.raw.temp;
        if (!raw.length) return { current: null, baseline7d: null, spark: [] };
        const asC = raw.map((s) => ({ timestamp: s.timestamp, temp: s.tempCx10 / 10 }));
        return computeMetric(asC, 'temp');
      })(),
      // Ring doesn't ship a distinct resp-rate metric; derive from HR (~4-6x) — placeholder for now
      resp:  { current: 14, baseline7d: 14, spark: [12, 13, 14, 13, 15, 14, 14] },
      stress: computeMetric(vitals.raw.stress, 'stress'),
      sleep:  sleepFromResult(vitals),
      exercise: { current: null, baseline7d: null, spark: [] },
    } as Record<HealthMetric, { current: number | null; baseline7d: number | null; spark: number[] }>;
  }, [vitals]);

  const todayDateLabel = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  }, []);

  const syncLabel = useMemo(() => {
    if (status === 'syncing') return 'syncing…';
    if (status === 'error')   return 'sync failed';
    if (!syncedAt) return 'not synced';
    const ago = Math.max(0, Math.floor((Date.now() - syncedAt) / 60_000));
    return ago === 0 ? 'synced just now' : `synced ${ago} min ago`;
  }, [status, syncedAt]);

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.body}
      refreshControl={<RefreshControl refreshing={status === 'syncing'} onRefresh={run} tintColor={palette.gold} />}
    >
      <View style={styles.headerRow}>
        <Text style={styles.title}>Health</Text>
        <TouchableOpacity style={styles.iconBtn} onPress={run} disabled={status === 'syncing'}>
          <Text style={styles.iconTxt}>⟳</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.todayLine}>
        <Text style={styles.todayDate}>{todayDateLabel}</Text>
        <View style={styles.syncPill}>
          <View style={[styles.syncDot, status === 'done' && styles.syncDotOk, status === 'error' && styles.syncDotBad]} />
          <Text style={styles.syncTxt}>{syncLabel}</Text>
        </View>
      </View>

      {/* Tile grid */}
      <View style={styles.grid}>
        {TILES.map((t) => {
          const d = metrics[t.key];
          const cur = d?.current ?? null;
          const base = d?.baseline7d ?? null;
          const delta = (cur != null && base != null) ? cur - base : null;
          const deltaKind: 'good' | 'mid' | 'bad' = (() => {
            if (delta == null) return 'mid';
            if (t.goodDelta === 'lower')  return delta < 0 ? 'good' : delta > 0 ? 'bad' : 'mid';
            if (t.goodDelta === 'higher') return delta > 0 ? 'good' : delta < 0 ? 'bad' : 'mid';
            return 'mid';
          })();
          return (
            <TouchableOpacity
              key={t.key}
              style={[styles.tile, t.wide && styles.tileWide]}
              onPress={() => navigation?.navigate?.(t.route, t.routeParams ?? {})}
              activeOpacity={0.8}
            >
              {/* A bare '›' did not read as "there is more here". Pairing a
                  list glyph with it says what the tap actually opens: every
                  reading for the day, with its timestamp. */}
              <View style={styles.detailBadge}>
                <Text style={styles.detailGlyph}>≡</Text>
                <Text style={styles.chev}>›</Text>
              </View>
              <Text style={styles.tileName}>{t.name}</Text>
              <View style={styles.tileNowRow}>
                <Text style={[styles.tileNow, { color: t.color }]}>
                  {cur == null ? '—' : (t.precision ? cur.toFixed(t.precision) : Math.round(cur))}
                </Text>
                <Text style={styles.tileUnit}>{t.unit}</Text>
              </View>
              <Text style={styles.tileBase}>
                {base == null
                  ? '7d avg —'
                  : `7d avg ${t.precision ? base.toFixed(t.precision) : Math.round(base)}`}
                {delta != null && (
                  <Text style={[
                    styles.tileDelta,
                    deltaKind === 'good' && styles.tileDeltaGood,
                    deltaKind === 'bad'  && styles.tileDeltaBad,
                  ]}>
                    {' · '}{delta >= 0 ? '+' : ''}{t.precision ? delta.toFixed(t.precision) : Math.round(delta)}
                  </Text>
                )}
              </Text>
              <View style={styles.sparkWrap}>
                <MiniSpark values={d?.spark ?? []} color={t.color} />
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};

// ── Mini sparkline (tiny SVG) ──────────────────────────────────────────────

const MiniSpark: React.FC<{ values: number[]; color: string; w?: number; h?: number }> = ({
  values, color, w = 100, h = 24,
}) => {
  if (values.length < 2) {
    return <View style={{ height: h }} />;
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(1e-6, max - min);
  const step = w / (values.length - 1);
  const d = values.map((v, i) => {
    const x = i * step;
    const y = h - ((v - min) / range) * (h - 2) - 1;
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <Path d={d} stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
};

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 80, paddingTop: 6 },
  headerRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingLeft: 56, paddingTop: 4, paddingBottom: 4,
  },
  title: { fontSize: 24, fontWeight: '700', color: C.cream },
  iconBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderColor: C.gold, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
  },
  iconTxt: { color: C.gold, fontSize: 16 },

  todayLine: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4, paddingBottom: 14,
  },
  todayDate: { color: C.muted, fontSize: 12, letterSpacing: 0.4 },
  syncPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 8, paddingVertical: 4,
    borderRadius: 999,
  },
  syncDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.muted },
  syncDotOk:  { backgroundColor: '#7BE4B8' },
  syncDotBad: { backgroundColor: '#FF7A85' },
  syncTxt: { fontSize: 10, color: C.muted },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  tile: {
    width: '48.5%', minHeight: 148,
    backgroundColor: C.cardBg,
    borderColor: C.border, borderWidth: 1,
    borderRadius: 14, padding: 12, position: 'relative',
  },
  tileWide: { width: '100%' },
  detailBadge: {
    position: 'absolute', top: 8, right: 8,
    flexDirection: 'row', alignItems: 'center', gap: 2,
    paddingHorizontal: 6, paddingVertical: 2,
    borderRadius: 10, backgroundColor: C.border,
  },
  detailGlyph: { color: C.muted, fontSize: 11, lineHeight: 14 },
  chev: { color: C.muted, fontSize: 14, lineHeight: 14 },
  tileName: {
    fontSize: 10, fontWeight: '700', color: C.muted,
    letterSpacing: 1.4, textTransform: 'uppercase',
  },
  tileNowRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 6 },
  tileNow: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
  tileUnit: { fontSize: 11, color: C.muted, marginLeft: 3 },
  tileBase: { fontSize: 10, color: C.muted, marginTop: 4 },
  tileDelta: { color: C.cream, fontWeight: '600' },
  tileDeltaGood: { color: '#7BE4B8' },
  tileDeltaBad:  { color: '#FF7A85' },
  sparkWrap: { marginTop: 'auto', paddingTop: 8, height: 32 },
});
