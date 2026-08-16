/**
 * SleepDetailScreen — bespoke sleep tab per the design proposal:
 *   ScreenHeader → ViewSwitch → WeekStrip → Gauge → Stage bars →
 *   Breathing panel (ODI from SpO₂) → Vitals grid.
 *
 * Data flow: syncAllRingVitals() on mount → group sleep samples into the
 * selected night, compute totals per stage, derive ODI from the SpO₂ samples
 * whose timestamps fall inside the sleep window, average vitals across that
 * window.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import Svg, { Path, Line, Text as SvgText, Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { COLORS, SPACING } from '../../theme';
import { useTheme } from '../../ThemeContext';
import {
  ScreenHeader, ViewSwitch, WeekStrip,
  type HealthView, type DayQuality,
} from './HealthPrimitives';
import { HEALTH_COLORS } from './healthTokens';
import { syncAllRingVitals, type RingVitalsSyncResult } from '../../soulsync/ring';
import { sleepModelToStage, type SleepSample } from '../../soulsync/ring/sync';

const DAY_MS = 86_400_000;
const SLEEP_TARGET_H = 8;

const STAGE_COLORS = {
  deep:  '#6B47C7',
  light: '#B39BFF',
  rem:   '#7CB1FF',
  wake:  '#F5C56B',
} as const;

function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

/** A "night" bucket: samples between 18:00 and noon next day → wake date. */
function nightBucketIso(d: Date): string {
  const c = new Date(d);
  if (c.getHours() >= 12) c.setDate(c.getDate() + 1);
  return isoDay(c);
}

interface NightStats {
  totalMin: number;
  deepMin: number;
  lightMin: number;
  remMin: number;
  awakeMin: number;
  bedtime: Date | null;
  wakeTime: Date | null;
}

function computeNightStats(samples: SleepSample[]): NightStats {
  const stats: NightStats = {
    totalMin: 0, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0,
    bedtime: null, wakeTime: null,
  };
  const sorted = [...samples].sort((a, b) => a.ringTs - b.ringTs);
  if (sorted.length < 2) return stats;
  stats.bedtime  = sorted[0].timestamp;
  stats.wakeTime = sorted[sorted.length - 1].timestamp;
  for (let i = 0; i < sorted.length - 1; i++) {
    const cur = sorted[i], next = sorted[i + 1];
    const durSec = next.ringTs - cur.ringTs;
    if (durSec <= 0 || durSec > 6 * 3600) continue;
    const durMin = durSec / 60;
    switch (sleepModelToStage(cur.sleepModel)) {
      case 'deep':  stats.deepMin  += durMin; break;
      case 'light': stats.lightMin += durMin; break;
      case 'rem':   stats.remMin   += durMin; break;
      case 'awake': stats.awakeMin += durMin; break;
      case 'onset': stats.lightMin += durMin; break;
      // 'end' — no duration
    }
  }
  stats.totalMin = Math.round(stats.deepMin + stats.lightMin + stats.remMin);
  return stats;
}

/** ODI = count of SpO₂ dips ≥4% per hour of sleep, using a rolling baseline. */
function computeOdi(spo2: Array<{ timestamp: Date; spo2: number }>, from: Date, to: Date): {
  odi: number;
  min: number | null;
  avg: number | null;
  dips: number;
  hours: number;
} {
  const inWindow = spo2
    .filter((s) => s.timestamp >= from && s.timestamp <= to && Number.isFinite(s.spo2) && s.spo2 > 0)
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  if (inWindow.length < 4) return { odi: 0, min: null, avg: null, dips: 0, hours: 0 };
  const values = inWindow.map((s) => s.spo2);
  const avg = values.reduce((a, b) => a + b, 0) / values.length;
  const min = Math.min(...values);
  // Rolling baseline over last 8 samples; dip counted when current <= baseline − 4
  let dips = 0;
  const win = 8;
  for (let i = win; i < values.length; i++) {
    const base = values.slice(i - win, i).reduce((a, b) => a + b, 0) / win;
    if (values[i] <= base - 4) dips++;
  }
  const hours = Math.max(0.5, (inWindow[inWindow.length - 1].timestamp.getTime() - inWindow[0].timestamp.getTime()) / 3_600_000);
  const odi = dips / hours;
  return { odi, min, avg, dips, hours };
}

export const SleepDetailScreen: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();
  const styles = useMemo(() => makeStyles(palette), [palette]);
  const [view, setView] = useState<HealthView>('day');
  const [selected, setSelected] = useState<string>(isoDay(new Date()));
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);

  useEffect(() => {
    void (async () => {
      try { setVitals(await syncAllRingVitals()); } catch { /* noop */ }
    })();
  }, []);

  // Bucket sleep samples by night → find the samples for the selected night.
  const nightSamples = useMemo(() => {
    if (!vitals) return [] as SleepSample[];
    return vitals.raw.sleep.filter((s) => nightBucketIso(s.timestamp) === selected);
  }, [vitals, selected]);

  const stats = useMemo(() => computeNightStats(nightSamples), [nightSamples]);

  const odi = useMemo(() => {
    if (!vitals || !stats.bedtime || !stats.wakeTime) {
      return { odi: 0, min: null as number | null, avg: null as number | null, dips: 0, hours: 0 };
    }
    return computeOdi(vitals.raw.spo2, stats.bedtime, stats.wakeTime);
  }, [vitals, stats]);

  // Vitals averaged over the sleep window.
  const nightVitals = useMemo(() => {
    if (!vitals || !stats.bedtime || !stats.wakeTime) {
      return { hr: null as number | null, hrv: null as number | null, spo2Avg: null as number | null, tempC: null as number | null, stress: null as number | null };
    }
    const f = stats.bedtime.getTime(), t = stats.wakeTime.getTime();
    const avg = <T,>(arr: T[], get: (v: T) => number, ts: (v: T) => number): number | null => {
      let s = 0, c = 0;
      for (const x of arr) {
        const time = ts(x);
        if (time < f || time > t) continue;
        const v = get(x);
        if (!Number.isFinite(v) || v <= 0) continue;
        s += v; c++;
      }
      return c > 0 ? s / c : null;
    };
    return {
      hr:      avg(vitals.raw.hr,   (v) => v.hr,   (v) => v.timestamp.getTime()),
      hrv:     avg(vitals.raw.hrv,  (v) => v.hrv,  (v) => v.timestamp.getTime()),
      spo2Avg: avg(vitals.raw.spo2, (v) => v.spo2, (v) => v.timestamp.getTime()),
      tempC:   avg(vitals.raw.temp, (v) => v.tempCx10 / 10, (v) => v.timestamp.getTime()),
      stress:  avg(vitals.raw.stress,(v) => v.stress, (v) => v.timestamp.getTime()),
    };
  }, [vitals, stats]);

  const quality = useMemo(() => {
    if (!vitals) return {} as Record<string, DayQuality>;
    const nights = new Map<string, SleepSample[]>();
    for (const s of vitals.raw.sleep) {
      const key = nightBucketIso(s.timestamp);
      if (!nights.has(key)) nights.set(key, []);
      nights.get(key)!.push(s);
    }
    const out: Record<string, DayQuality> = {};
    for (const [iso, arr] of nights) {
      const st = computeNightStats(arr);
      out[iso] =
        st.totalMin >= 420 ? 'good' :
        st.totalMin >= 300 ? 'fair' : 'poor';
    }
    return out;
  }, [vitals]);

  const totalH = Math.floor(stats.totalMin / 60);
  const totalM = stats.totalMin % 60;
  const targetMin = SLEEP_TARGET_H * 60;
  const pct = Math.min(1, stats.totalMin / targetMin);
  const deltaMin = stats.totalMin - targetMin;

  const stageMax = Math.max(1, stats.deepMin, stats.lightMin, stats.remMin, stats.awakeMin);

  const riskInfo: { label: string; tone: 'good' | 'mid' | 'bad'; head: string } = (() => {
    const v = odi.odi;
    if (v < 5)   return { label: 'Healthy range',    tone: 'good', head: "You're breathing well" };
    if (v < 15)  return { label: 'Watch this',       tone: 'mid',  head: 'Some dips overnight' };
    return                { label: 'See a clinician', tone: 'bad',  head: 'Frequent breathing pauses' };
  })();

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.body}>
      <ScreenHeader title="Sleep" iconEmoji="🌙" onBack={() => navigation?.goBack?.()} />

      <ViewSwitch value={view} onChange={setView} />
      <WeekStrip
        selected={selected}
        onSelect={setSelected}
        quality={quality}
        accent={HEALTH_COLORS.sleep}
      />

      {/* Sleep-time gauge with target reference */}
      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: HEALTH_COLORS.sleep }]}>
        <Text style={styles.eyebrow}>
          {formatLongDate(selected)}
          {stats.bedtime && stats.wakeTime
            ? `  ·  ${formatHm(stats.bedtime)} – ${formatHm(stats.wakeTime)}`
            : ''}
        </Text>

        <SleepGauge percent={pct} accent={HEALTH_COLORS.sleep} />

        <Text style={styles.gaugeNum}>
          {stats.totalMin > 0 ? `${totalH}h ${String(totalM).padStart(2, '0')}m` : '— h — m'}
        </Text>
        <Text style={styles.gaugeCap}>You slept</Text>

        <View style={styles.targetRow}>
          <Text style={styles.targetK}>Target · 8h nightly</Text>
          <Text style={[styles.targetV, deltaMin < 0 ? styles.targetUnder : styles.targetOver]}>
            {stats.totalMin === 0 ? '—' :
              (deltaMin < 0
                ? `−${Math.round(Math.abs(deltaMin))} min under`
                : `+${Math.round(deltaMin)} min over`)}
          </Text>
        </View>
      </View>

      {/* Sleep stages — simple horizontal bars */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Sleep stages</Text>
        <StageRow name="Deep"  color={STAGE_COLORS.deep}  minutes={stats.deepMin}  scale={stageMax} />
        <StageRow name="Light" color={STAGE_COLORS.light} minutes={stats.lightMin} scale={stageMax} />
        <StageRow name="REM"   color={STAGE_COLORS.rem}   minutes={stats.remMin}   scale={stageMax} />
        <StageRow name="Wake"  color={STAGE_COLORS.wake}  minutes={stats.awakeMin} scale={stageMax} />
        <View style={styles.totalRow}>
          <Text style={styles.totalK}>Total sleep</Text>
          <Text style={styles.totalV}>{stats.totalMin > 0 ? `${totalH}h ${String(totalM).padStart(2, '0')}m` : '—'}</Text>
        </View>
      </View>

      {/* Breathing / apnea — plain-language */}
      <View style={styles.card}>
        <Text style={styles.cardLabel}>Breathing while you slept</Text>

        <View style={[
          styles.breathHero,
          riskInfo.tone === 'good' && styles.breathHeroGood,
          riskInfo.tone === 'mid'  && styles.breathHeroMid,
          riskInfo.tone === 'bad'  && styles.breathHeroBad,
        ]}>
          <View style={[
            styles.shield,
            riskInfo.tone === 'good' && styles.shieldGood,
            riskInfo.tone === 'mid'  && styles.shieldMid,
            riskInfo.tone === 'bad'  && styles.shieldBad,
          ]}>
            <Text style={styles.shieldIcon}>
              {riskInfo.tone === 'good' ? '✓' : riskInfo.tone === 'mid' ? '!' : '×'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.breathHead}>{riskInfo.head}</Text>
            <Text style={styles.breathSub}>
              <Text style={styles.breathSubB}>{odi.odi.toFixed(1)}</Text>
              {' pauses / hour · '}
              <Text style={styles.breathSubB}>{riskInfo.label}</Text>
            </Text>
          </View>
        </View>

        <Text style={styles.breathDesc}>
          <Text style={styles.bold}>What we measured.</Text>{' '}
          While you slept, your ring watched your blood-oxygen (SpO₂). A brief dip usually
          means your breathing slowed or paused for a few seconds. Doctors call the count of
          these dips per hour the <Text style={styles.bold}>ODI</Text>.{'\n\n'}
          <Text style={styles.bold}>Why it matters.</Text>{' '}
          Frequent dips over time can strain the heart and leave you tired even after a full
          night. Most healthy adults sit under 5 events per hour.
        </Text>

        {/* Risk scale */}
        <View style={styles.scaleBar}>
          <View style={[styles.scaleSeg, { flex: 1, backgroundColor: '#7BE4B8' }]} />
          <View style={[styles.scaleSeg, { flex: 1, backgroundColor: '#F5C56B' }]} />
          <View style={[styles.scaleSeg, { flex: 1, backgroundColor: '#FF7A85' }]} />
          <View style={[styles.marker, { left: `${Math.min(100, (odi.odi / 30) * 100)}%` }]} />
        </View>
        <View style={styles.scaleLabels}>
          <Text style={[styles.scaleTxt, riskInfo.tone === 'good' && styles.scaleTxtYou]}>Healthy 0–5</Text>
          <Text style={[styles.scaleTxt, riskInfo.tone === 'mid'  && styles.scaleTxtYou]}>Watch 5–15</Text>
          <Text style={[styles.scaleTxt, riskInfo.tone === 'bad'  && styles.scaleTxtYou]}>See doctor 15+</Text>
        </View>

        <View style={styles.factRow}>
          <View style={styles.fact}>
            <Text style={styles.factK}>Lowest SpO₂</Text>
            <Text style={styles.factV}>{odi.min == null ? '—' : `${Math.round(odi.min)}%`}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factK}>Dips ≥ 4%</Text>
            <Text style={styles.factV}>{odi.dips}</Text>
          </View>
          <View style={styles.fact}>
            <Text style={styles.factK}>Avg SpO₂</Text>
            <Text style={styles.factV}>{odi.avg == null ? '—' : `${Math.round(odi.avg)}%`}</Text>
          </View>
        </View>

        <Text style={styles.breathFoot}>
          Estimate from the ring — not a medical diagnosis. If your score stays above 5
          several nights, please talk to a clinician.
        </Text>
      </View>

      {/* Vitals during sleep */}
      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardLabel}>While you slept</Text>
          {stats.bedtime && stats.wakeTime ? (
            <Text style={styles.cardAside}>{formatHm(stats.bedtime)} – {formatHm(stats.wakeTime)}</Text>
          ) : null}
        </View>
        <View style={styles.vGrid}>
          <VitalTile k="HR avg"   v={nightVitals.hr}      unit="bpm" color={HEALTH_COLORS.hr} />
          <VitalTile k="HRV"      v={nightVitals.hrv}     unit="ms"  color={HEALTH_COLORS.hrv} />
          <VitalTile k="SpO₂"     v={nightVitals.spo2Avg} unit="%"   color={HEALTH_COLORS.spo2} />
          <VitalTile k="Skin"     v={nightVitals.tempC}   unit="°C"  color={HEALTH_COLORS.temp} precision={1} />
          <VitalTile k="Resp"     v={14}                  unit="/min" color={HEALTH_COLORS.resp} />
          <VitalTile k="Stress"   v={nightVitals.stress}  unit=""     color={HEALTH_COLORS.stress} />
        </View>
      </View>
    </ScrollView>
  );
};

// ── Sub-components ─────────────────────────────────────────────────────────

const SleepGauge: React.FC<{ percent: number; accent: string }> = ({ percent, accent }) => {
  const w = 240, h = 132;
  const r = 100, cx = w / 2, cy = 118;
  const start = { x: cx - r, y: cy };
  const end = { x: cx + r, y: cy };
  const track = `M${start.x} ${start.y} A${r} ${r} 0 0 1 ${end.x} ${end.y}`;
  // Total arc length ≈ πr; dash-offset it to show progress
  const arcLen = Math.PI * r;
  const dashOffset = arcLen * (1 - Math.max(0, Math.min(1, percent)));
  return (
    <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
      <Defs>
        <LinearGradient id="sleepFill" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor="#6B47C7" />
          <Stop offset="0.6" stopColor="#B39BFF" />
          <Stop offset="1" stopColor="#7CB1FF" />
        </LinearGradient>
      </Defs>
      <Path d={track} stroke="rgba(255,255,255,0.06)" strokeWidth={16} strokeLinecap="round" fill="none" />
      <Path
        d={track}
        stroke="url(#sleepFill)"
        strokeWidth={16}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={arcLen}
        strokeDashoffset={dashOffset}
      />
      {/* Target tick at 8h endpoint */}
      <Rect x={end.x - 3} y={end.y - 24} width={6} height={30} rx={2} fill="#F0D08A" />
      <SvgText x={20}  y={128} fill="#7C8CA3" fontSize={10} fontWeight="600" textAnchor="middle">0h</SvgText>
      <SvgText x={220} y={128} fill="#F0D08A" fontSize={10} fontWeight="700" textAnchor="middle">8h target</SvgText>
    </Svg>
  );
};

const StageRow: React.FC<{ name: string; color: string; minutes: number; scale: number }> = ({
  name, color, minutes, scale,
}) => {
  const { palette } = useTheme();
  const pct = Math.max(0, Math.min(100, (minutes / scale) * 100));
  return (
    <View style={stageStyles(palette).row}>
      <View style={stageStyles(palette).name}>
        <View style={[stageStyles(palette).swatch, { backgroundColor: color }]} />
        <Text style={stageStyles(palette).nameTxt}>{name}</Text>
      </View>
      <View style={stageStyles(palette).track}>
        <View style={[stageStyles(palette).fill, { width: `${pct}%`, backgroundColor: color }]} />
      </View>
      <Text style={stageStyles(palette).val}>{fmtMin(minutes)}</Text>
    </View>
  );
};

const stageStyles = (C: typeof COLORS) => StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  name: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 62 },
  swatch: { width: 8, height: 8, borderRadius: 2 },
  nameTxt: { fontSize: 12, color: C.cream },
  track: { flex: 1, height: 8, borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.05)', overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  val: { width: 62, textAlign: 'right', fontSize: 12, color: C.muted },
});

const VitalTile: React.FC<{ k: string; v: number | null; unit: string; color: string; precision?: number }> = ({
  k, v, unit, color, precision,
}) => {
  const { palette } = useTheme();
  const styles = useMemo(() => vitalTileStyles(palette, color), [palette, color]);
  return (
    <View style={styles.wrap}>
      <Text style={styles.k}>{k}</Text>
      <View style={styles.vRow}>
        <Text style={styles.v}>
          {v == null ? '—' : (precision ? v.toFixed(precision) : Math.round(v))}
        </Text>
        {unit ? <Text style={styles.u}>{unit}</Text> : null}
      </View>
    </View>
  );
};

const vitalTileStyles = (C: typeof COLORS, accent: string) => StyleSheet.create({
  wrap: {
    width: '31.5%', padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: C.border, borderWidth: 1, borderTopWidth: 2, borderTopColor: accent,
    borderRadius: 10,
  },
  k: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase' },
  vRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 5 },
  v: { fontSize: 20, color: C.cream, fontWeight: '700', letterSpacing: -0.3 },
  u: { fontSize: 10, color: C.muted, marginLeft: 3 },
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatLongDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatHm(d: Date): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function fmtMin(m: number): string {
  if (!m || m < 1) return '—';
  const h = Math.floor(m / 60);
  const mm = Math.round(m % 60);
  return h > 0 ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
}

// ── Styles ─────────────────────────────────────────────────────────────────

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 80, paddingTop: 6 },
  card: {
    backgroundColor: C.cardBg, borderColor: C.border, borderWidth: 1,
    borderRadius: 16, padding: 16, marginBottom: 12,
  },
  cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  cardLabel: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase', marginBottom: 4 },
  cardAside: { fontSize: 10, color: C.muted },
  eyebrow: { fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.4, textTransform: 'uppercase' },
  gaugeNum: { textAlign: 'center', fontSize: 40, fontWeight: '700', color: C.cream, marginTop: -6, letterSpacing: -1 },
  gaugeCap: { textAlign: 'center', fontSize: 10, fontWeight: '700', color: C.muted, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 2 },
  targetRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: 14, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 10,
    borderLeftWidth: 3, borderLeftColor: '#F0D08A',
  },
  targetK: { fontSize: 10, fontWeight: '700', color: '#F0D08A', letterSpacing: 1.2, textTransform: 'uppercase' },
  targetV: { fontSize: 12, fontWeight: '600' },
  targetUnder: { color: '#F5C56B' },
  targetOver:  { color: '#7BE4B8' },

  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.border },
  totalK: { fontSize: 12, color: C.muted },
  totalV: { fontSize: 16, color: C.cream, fontWeight: '700' },

  breathHero: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    padding: 14, marginBottom: 12,
    backgroundColor: 'rgba(123,228,184,0.09)',
    borderColor: 'rgba(123,228,184,0.30)', borderWidth: 1,
    borderRadius: 12,
  },
  breathHeroGood: { backgroundColor: 'rgba(123,228,184,0.09)', borderColor: 'rgba(123,228,184,0.30)' },
  breathHeroMid:  { backgroundColor: 'rgba(245,197,107,0.09)', borderColor: 'rgba(245,197,107,0.30)' },
  breathHeroBad:  { backgroundColor: 'rgba(255,122,133,0.09)', borderColor: 'rgba(255,122,133,0.30)' },
  shield: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#7BE4B8',
  },
  shieldGood: { backgroundColor: '#7BE4B8' },
  shieldMid:  { backgroundColor: '#F5C56B' },
  shieldBad:  { backgroundColor: '#FF7A85' },
  shieldIcon: { color: '#0A1A0F', fontSize: 22, fontWeight: '800' },
  breathHead: { fontSize: 14, fontWeight: '600', color: C.cream, lineHeight: 18 },
  breathSub:  { fontSize: 12, color: C.cream, marginTop: 3, opacity: 0.9 },
  breathSubB: { fontWeight: '700', color: '#7BE4B8' },

  breathDesc: { fontSize: 12.5, color: C.cream, lineHeight: 18, marginBottom: 12, opacity: 0.85 },
  bold: { fontWeight: '700', color: C.cream, opacity: 1 },

  scaleBar: { flexDirection: 'row', height: 10, borderRadius: 6, overflow: 'hidden', position: 'relative', marginTop: 6 },
  scaleSeg: { height: 10 },
  marker: {
    position: 'absolute', top: -6,
    width: 4, height: 22, backgroundColor: C.cream,
    borderRadius: 2,
    transform: [{ translateX: -2 }],
  },
  scaleLabels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 },
  scaleTxt: { flex: 1, textAlign: 'center', fontSize: 10, color: C.muted },
  scaleTxtYou: { color: '#7BE4B8', fontWeight: '700' },

  factRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  fact: { flex: 1, padding: 8, backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 8, alignItems: 'center' },
  factK: { fontSize: 9, fontWeight: '700', color: C.muted, letterSpacing: 1.2, textTransform: 'uppercase' },
  factV: { fontSize: 16, color: C.cream, fontWeight: '700', marginTop: 4 },

  breathFoot: { marginTop: 10, fontSize: 11, color: C.muted, fontStyle: 'italic', lineHeight: 15 },

  vGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
});
