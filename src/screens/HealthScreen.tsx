/**
 * HealthScreen — three sub-tabs (Activity / Sleep / Health) accessible via a
 * segmented control just below the header. Each sub-view maps to what RWfit
 * shows under those sections:
 *
 *   • Activity — semicircle gauge + Calories/Target/Mileage + hourly steps bar
 *   • Sleep    — score circle + hypnogram + stage rows + sleep target
 *   • Health   — dashboard of mini-chart cards (HR, HRV, SpO2, Temp, Stress,
 *                Daily Prayer Count)
 *
 * One ring sync on mount populates all three; ⟳ button re-runs it.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions,
} from 'react-native';
import { LineChart, BarChart } from 'react-native-chart-kit';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';
import { useTheme } from '../ThemeContext';
import { syncAllRingVitals, type RingVitalsSyncResult } from '../soulsync/ring';
import { SadhanaRing } from '../soulsync/ring/SadhanaRing';
import { readSr16DeviceId } from '../soulsync/ring/japaCounter';
import {
  sleepModelToStage,
  type StepSample, type SleepSample, type HrSample, type HrvSample,
  type Spo2Sample, type TempSample, type StressSample, type TasbihSample,
  type TsSample,
} from '../soulsync/ring/sync';

const SCREEN_W = Dimensions.get('window').width;
const CARD_W = SCREEN_W - SPACING.md * 2;
const CHART_W = CARD_W - SPACING.md * 2;

const STEP_TARGET = 8000;
const DISTANCE_TARGET_KM = 3.0;
const CALORIE_TARGET_KCAL = 300;
const JAPA_TARGET = 108;
const SLEEP_TARGET_MIN = 480;

type Sub = 'sleep' | 'health';

const startOfDay = (d: Date) => { const c = new Date(d); c.setHours(0,0,0,0); return c; };
const endOfDay   = (d: Date) => { const c = new Date(d); c.setHours(23,59,59,999); return c; };
const today0 = () => startOfDay(new Date()).getTime();
const today1 = () => endOfDay(new Date()).getTime();

const chartLineConfig = (rgb: string, _bg?: string) => ({
  backgroundGradientFrom: 'transparent',
  backgroundGradientTo: 'transparent',
  backgroundGradientFromOpacity: 0,
  backgroundGradientToOpacity: 0,
  color: (op = 1) => `rgba(${rgb}, ${op})`,
  labelColor: (op = 1) => `rgba(${rgb}, ${op * 0.5})`,
  strokeWidth: 2,
  propsForDots: { r: '0' },
  propsForBackgroundLines: { strokeDasharray: '', strokeOpacity: 0 },
  decimalPlaces: 0,
});

// ═════════════════════════════════════════════════════════════════════

export const HealthScreen = () => {
  const { palette } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const [sub, setSub] = useState<Sub>('health');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'done' | 'error'>('idle');
  const [vitals, setVitals] = useState<RingVitalsSyncResult | null>(null);
  const [steps, setSteps] = useState<StepSample[]>([]);
  const [sleep, setSleep] = useState<SleepSample[]>([]);
  const [hr, setHr] = useState<HrSample[]>([]);
  const [hrv, setHrv] = useState<HrvSample[]>([]);
  const [spo2, setSpo2] = useState<Spo2Sample[]>([]);
  const [temp, setTemp] = useState<TempSample[]>([]);
  const [stress, setStress] = useState<StressSample[]>([]);
  const [japa, setJapa] = useState<TasbihSample[]>([]);

  const runSync = async () => {
    setSyncStatus('syncing');
    try {
      const r = await syncAllRingVitals();
      setVitals(r);
      // Raw samples now come back from the SAME connection — no reconnect,
      // no dropped charts if the second BLE session had failed.
      setSteps(r.raw.steps);
      setSleep(r.raw.sleep);
      setHr(r.raw.hr);
      setHrv(r.raw.hrv);
      setSpo2(r.raw.spo2);
      setTemp(r.raw.temp);
      setStress(r.raw.stress);
      setJapa(r.raw.japa);
      setSyncStatus('done');
    } catch {
      setSyncStatus('error');
    }
  };

  useEffect(() => { runSync(); }, []);

  const todayLabel = new Date().toISOString().slice(0, 10).replace(/-/g, '/');

  // ── Activity totals ──
  const activityToday = useMemo(() => {
    const s0 = today0(), s1 = today1();
    const day = steps.filter((x) => x.timestamp.getTime() >= s0 && x.timestamp.getTime() <= s1);
    return {
      steps: day.reduce((s, x) => s + x.steps, 0),
      distanceKm: day.reduce((s, x) => s + x.distanceKm, 0),
      calorieKcal: day.reduce((s, x) => s + x.calorieKcal, 0),
      day,
    };
  }, [steps]);

  const hourlySteps = useMemo(() => {
    const bins = new Array(24).fill(0);
    for (const s of activityToday.day) {
      const h = s.timestamp.getHours();
      bins[h] += s.steps;
    }
    return bins;
  }, [activityToday]);

  // ── Sleep last night ──
  const nightSleep = useMemo(() => {
    const eve = new Date(); eve.setHours(18, 0, 0, 0); eve.setDate(eve.getDate() - 1);
    const noon = new Date(); noon.setHours(12, 0, 0, 0);
    return sleep.filter((x) => x.timestamp >= eve && x.timestamp <= noon)
      .sort((a, b) => a.ringTs - b.ringTs);
  }, [sleep]);
  const sleepStats = useMemo(() => computeSleepStats(nightSleep), [nightSleep]);

  // ── Filter helpers for health mini charts ──
  const hrToday = useMemo(() => filterToday(hr), [hr]);
  const spo2Today = useMemo(() => filterToday(spo2), [spo2]);
  const hrvToday = useMemo(() => filterToday(hrv), [hrv]);
  const tempToday = useMemo(() => filterToday(temp), [temp]);
  const stressToday = useMemo(() => filterToday(stress), [stress]);
  const japaToday = useMemo(() => filterToday(japa), [japa]);
  const latestJapa = japaToday.length ? japaToday[japaToday.length - 1].count : 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: palette.deep }]} contentContainerStyle={{ paddingBottom: SPACING.xl }}>
      {/* Header + refresh */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: palette.cream }]}>{sub === 'sleep' ? 'Sleep' : 'Health'}</Text>
        <TouchableOpacity onPress={runSync} disabled={syncStatus === 'syncing'} style={styles.refreshBtn}>
          <Text style={styles.refreshIcon}>{syncStatus === 'syncing' ? '↻' : '⟳'}</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.date}>{todayLabel}</Text>

      {/* Segmented sub-tabs — Activity was moved out (lives in the Exercise tab). */}
      <View style={styles.segmented}>
        <SubTabBtn label="🌙 Sleep"    active={sub === 'sleep'}    onPress={() => setSub('sleep')}    activeColor="#a855f7" />
        <SubTabBtn label="💗 Health"   active={sub === 'health'}   onPress={() => setSub('health')}   activeColor="#ef4444" />
      </View>

      {syncStatus === 'syncing' && <Text style={styles.syncText}>Syncing ring…</Text>}
      {syncStatus === 'error' && <Text style={[styles.syncText, { color: COLORS.error }]}>Sync failed — tap ⟳ to retry</Text>}

      {sub === 'sleep' && (
        <SleepView date={todayLabel} stats={sleepStats} samples={nightSleep} />
      )}
      {sub === 'health' && (
        <HealthView
          date={todayLabel}
          vitals={vitals}
          hrSamples={hrToday.map((s) => s.hr)}
          hrvSamples={hrvToday.map((s) => s.hrv)}
          spo2Samples={spo2Today.map((s) => s.spo2)}
          tempSamples={tempToday.map((s) => s.tempCx10 / 10)}
          stressSamples={stressToday.map((s) => s.stress)}
          japaCount={latestJapa}
        />
      )}
    </ScrollView>
  );
};

// ═════════════════════════════════════════════════════════════════════

const SubTabBtn: React.FC<{ label: string; active: boolean; onPress: () => void; activeColor: string }> = ({
  label, active, onPress, activeColor,
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={[styles.segBtn, active && { backgroundColor: activeColor }]}
  >
    <Text style={[styles.segTxt, active && { color: '#000', fontWeight: '700' }]}>{label}</Text>
  </TouchableOpacity>
);

const filterToday = <T extends { timestamp: Date; ringTs: number }>(arr: T[]): T[] => {
  const s0 = today0(), s1 = today1();
  return arr.filter((x) => x.timestamp.getTime() >= s0 && x.timestamp.getTime() <= s1)
    .sort((a, b) => a.ringTs - b.ringTs);
};

function computeSleepStats(samples: SleepSample[]) {
  if (samples.length < 2) return { totalMin: 0, deepMin: 0, lightMin: 0, remMin: 0, awakeMin: 0, score: 0, bedtime: null as string | null, wakeTime: null as string | null };
  let deep = 0, light = 0, rem = 0, awake = 0;
  for (let i = 0; i < samples.length - 1; i++) {
    const dur = (samples[i + 1].ringTs - samples[i].ringTs) / 60;
    if (dur <= 0 || dur > 360) continue;
    const stage = sleepModelToStage(samples[i].sleepModel);
    if (stage === 'deep') deep += dur;
    else if (stage === 'light' || stage === 'onset') light += dur;
    else if (stage === 'rem') rem += dur;
    else if (stage === 'awake') awake += dur;
  }
  const total = deep + light + rem;
  const first = samples[0]?.timestamp;
  const last = samples[samples.length - 1]?.timestamp;
  const fmt = (d: Date) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  return {
    totalMin: Math.round(total),
    deepMin: Math.round(deep),
    lightMin: Math.round(light),
    remMin: Math.round(rem),
    awakeMin: Math.round(awake),
    score: Math.round(Math.min(100, (total / SLEEP_TARGET_MIN) * 100)),
    bedtime: first ? fmt(first) : null,
    wakeTime: last ? fmt(last) : null,
  };
}

// ═════════════════════════════════════════════════════════════════════
// ACTIVITY VIEW
// ═════════════════════════════════════════════════════════════════════

const ActivityView: React.FC<{
  date: string; steps: number; distanceKm: number; calorieKcal: number; hourlySteps: number[];
}> = ({ date, steps, distanceKm, calorieKcal, hourlySteps }) => {
  const { palette, mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const pct = Math.min(100, (steps / STEP_TARGET) * 100);
  const label = steps < 500 ? 'Lack of exercise'
              : steps < 4000 ? 'Getting started'
              : steps < 8000 ? 'On track'
              : 'Great job!';
  const cardBg = mode === 'light' ? palette.cardBg : '#1a3550';
  const gaugeColor = mode === 'light' ? palette.gold : '#ffffff';
  return (
    <>
      <View style={[styles.card, { backgroundColor: cardBg, borderWidth: 1, borderColor: 'rgba(93,175,255,0.35)' }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: palette.cream }]}>Activity</Text>
            <Text style={[styles.cardDate, { color: palette.muted }]}>{date}</Text>
          </View>
        </View>
        <View style={{ alignItems: 'center', marginVertical: SPACING.md }}>
          <SemicircleGauge value={pct} color={gaugeColor} />
          <Text style={[styles.gaugeLabel, { color: palette.muted }]}>{label}</Text>
          <Text style={[styles.gaugeCenter, { color: palette.cream }]}>{steps}</Text>
        </View>
        <View style={styles.metricRow}>
          <MetricLeg icon="🔥" label="Calories" value={`${calorieKcal.toFixed(0)}KCAL`} />
          <MetricLeg icon="🚶" label="Target" value={`${STEP_TARGET}Step`} />
          <MetricLeg icon="📍" label="Mileage" value={`${distanceKm.toFixed(2)}km`} />
        </View>
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: SPACING.xs }}>
          <Text style={styles.sectionTitle}>Steps · today</Text>
          <Text style={styles.dim}>{steps > 0 ? `${steps.toLocaleString()} steps` : '—'}</Text>
        </View>
        <BarChart
          data={{
            labels: ['00', '', '', '06', '', '', '12', '', '', '18', '', '', '24'],
            datasets: [{ data: sampleHourly(hourlySteps) }],
          }}
          width={CHART_W}
          height={220}
          fromZero
          withInnerLines={false}
          yAxisLabel=""
          yAxisSuffix=""
          chartConfig={{
            backgroundGradientFrom: COLORS.cardBg,
            backgroundGradientTo: COLORS.cardBg,
            color: (op = 1) => `rgba(93, 175, 255, ${op})`,
            labelColor: (op = 1) => `rgba(160, 160, 160, ${op})`,
            barPercentage: 0.6,
            decimalPlaces: 0,
          }}
          style={{ borderRadius: BORDER_RADIUS.md, marginLeft: -SPACING.sm }}
        />
      </View>
    </>
  );
};

const sampleHourly = (hourly: number[]): number[] => {
  const idx = [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 23];
  return idx.map((i) => hourly[i] ?? 0);
};

const MetricLeg: React.FC<{ icon: string; label: string; value: string }> = ({ icon, label, value }) => {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text style={{ color: palette.cream, fontSize: FONT_SIZES.base, marginTop: 4 }}>{label}</Text>
      <Text style={{ color: palette.muted, fontSize: FONT_SIZES.sm, opacity: 0.95 }}>{value}</Text>
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════
// SLEEP VIEW
// ═════════════════════════════════════════════════════════════════════

const SleepView: React.FC<{
  date: string;
  stats: ReturnType<typeof computeSleepStats>;
  samples: SleepSample[];
}> = ({ date, stats, samples }) => {
  const { palette, mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const totalH = Math.floor(stats.totalMin / 60);
  const totalM = stats.totalMin % 60;
  const grand = stats.totalMin + stats.awakeMin;
  const pct = (m: number) => grand > 0 ? ((m / grand) * 100) : 0;
  const targetPct = Math.min(100, (stats.totalMin / SLEEP_TARGET_MIN) * 100);
  const scoreLabel = stats.score >= 90 ? 'Excellent' : stats.score >= 70 ? 'Good' : stats.score >= 50 ? 'Fair' : stats.score > 0 ? 'Poor' : '—';
  const cardBg = mode === 'light' ? palette.cardBg : '#1a1a4a';

  return (
    <>
      <View style={[styles.card, { backgroundColor: cardBg, borderWidth: 1, borderColor: 'rgba(168,85,247,0.35)' }]}>
        <View style={styles.cardHeader}>
          <View>
            <Text style={[styles.cardTitle, { color: palette.cream }]}>Total sleep time</Text>
            <Text style={[styles.cardDate, { color: palette.muted }]}>{date}</Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: SPACING.md }}>
          <Text style={[styles.sleepTotal, { color: palette.cream }]}>
            {stats.totalMin > 0 ? `${totalH}H ${totalM}M` : '—H —M'}
          </Text>
          <View style={{ flex: 1 }} />
          <View style={styles.sleepCircle}>
            <Text style={[styles.sleepScoreTxt, { color: palette.cream }]}>{stats.totalMin > 0 ? stats.score : '—'}</Text>
            <Text style={[styles.sleepScoreLabel, { color: palette.muted }]}>{scoreLabel}</Text>
          </View>
        </View>
        <Hypnogram samples={samples} bedtime={stats.bedtime} wakeTime={stats.wakeTime} />
        <View style={styles.legend}>
          <LegendDot color="#a855f7" label="REM" />
          <LegendDot color="#f59e0b" label="Wake up" />
          <LegendDot color="#c4b5fd" label="Light Sleep" />
          <LegendDot color="#7c3aed" label="Deep sleep" />
        </View>
      </View>

      <View style={styles.card}>
        <StageBarRow label="Duration of REM"   min={stats.remMin}   pct={pct(stats.remMin)}   color="#a855f7" />
        <StageBarRow label="Wake Time"          min={stats.awakeMin} pct={pct(stats.awakeMin)} color="#f59e0b" />
        <StageBarRow label="Light sleep time"   min={stats.lightMin} pct={pct(stats.lightMin)} color="#c4b5fd" />
        <StageBarRow label="Deep sleep time"    min={stats.deepMin}  pct={pct(stats.deepMin)}  color="#7c3aed" />
      </View>

      <View style={styles.card}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <Text style={styles.dim}>Sleep target time</Text>
          <Text style={styles.stageValue}>{Math.floor(SLEEP_TARGET_MIN / 60)}H 0M</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: SPACING.sm }}>
          <Text style={styles.dim}>Total sleep time</Text>
          <Text style={styles.stageValue}>{totalH}H {totalM}M</Text>
        </View>
        <View style={[styles.stageBarBg, { marginTop: SPACING.sm, height: 6 }]}>
          <View style={[styles.stageBarFill, { width: `${targetPct}%`, backgroundColor: '#5dafff' }]} />
        </View>
      </View>
    </>
  );
};

const Hypnogram: React.FC<{ samples: SleepSample[]; bedtime: string | null; wakeTime: string | null }> = ({
  samples, bedtime, wakeTime,
}) => {
  if (samples.length < 2) {
    return (
      <View style={{ height: 120, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={styles.dim}>No sleep data yet. Wear the ring overnight and sync.</Text>
      </View>
    );
  }
  const start = samples[0].ringTs;
  const end = samples[samples.length - 1].ringTs;
  const totalSpan = Math.max(1, end - start);
  const stageY: Record<string, number> = { rem: 0.1, awake: 0.35, light: 0.6, deep: 0.85, onset: 0.6, end: 0.85 };
  const stageColor: Record<string, string> = { rem: '#a855f7', awake: '#f59e0b', light: '#c4b5fd', deep: '#7c3aed', onset: '#c4b5fd', end: '#7c3aed' };
  const HYP_H = 120;

  return (
    <View style={{ marginVertical: SPACING.sm }}>
      <View style={{ height: HYP_H, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: 6, padding: 4 }}>
        {samples.slice(0, -1).map((s, i) => {
          const next = samples[i + 1];
          const durFrac = (next.ringTs - s.ringTs) / totalSpan;
          if (durFrac <= 0 || durFrac > 0.5) return null;
          const stage = sleepModelToStage(s.sleepModel);
          const y = stageY[stage] ?? 0.5;
          const color = stageColor[stage] ?? '#666';
          return (
            <View key={i} style={{
              flex: durFrac,
              height: HYP_H - 8 - (HYP_H - 8) * y,
              marginTop: (HYP_H - 8) * y,
              backgroundColor: color,
              marginHorizontal: 0.5,
            }} />
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
        <Text style={styles.dim}>{bedtime ?? '—'}</Text>
        <Text style={styles.dim}>{wakeTime ?? '—'}</Text>
      </View>
    </View>
  );
};

const LegendDot: React.FC<{ color: string; label: string }> = ({ color, label }) => (
  <View style={styles.legendItem}>
    <View style={[styles.legendDot, { backgroundColor: color }]} />
    <Text style={styles.legendLabel}>{label}</Text>
  </View>
);

const StageBarRow: React.FC<{ label: string; min: number; pct: number; color: string }> = ({
  label, min, pct, color,
}) => {
  const h = Math.floor(min / 60), m = min % 60;
  return (
    <View style={{ marginBottom: SPACING.md }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
        <Text style={styles.stageLabel}>
          {label} <Text style={styles.stageValue}>{min > 0 ? `${h}H${m}M` : '— —'}</Text>
        </Text>
        <Text style={styles.dim}>{pct.toFixed(1)}%</Text>
      </View>
      <View style={styles.stageBarBg}>
        <View style={[styles.stageBarFill, { width: `${Math.max(0.5, pct)}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
};

// ═════════════════════════════════════════════════════════════════════
// HEALTH VIEW — vitals dashboard (mini-chart cards)
// ═════════════════════════════════════════════════════════════════════

const HealthView: React.FC<{
  date: string;
  vitals: RingVitalsSyncResult | null;
  hrSamples: number[];
  hrvSamples: number[];
  spo2Samples: number[];
  tempSamples: number[];
  stressSamples: number[];
  japaCount: number;
}> = ({ date, vitals, hrSamples, hrvSamples, spo2Samples, tempSamples, stressSamples, japaCount }) => (
  <>
    <MiniChartCard
      title="Heart Rate"      date={date} bg="#2a2a3a" accent="239, 68, 68"
      samples={hrSamples} current={vitals?.hr.avg ?? null} currentUnit=" bpm"
      subtitle={vitals?.hr.min !== null && vitals?.hr.max !== null ? `Range ${vitals?.hr.min}-${vitals?.hr.max} bpm` : 'Range 60 - 100 bpm'}
    />
    <MiniChartCard
      title="HRV"             date={date} bg="#1a2a4a" accent="168, 85, 247"
      samples={hrvSamples} current={vitals?.hrv.avg ?? null} currentUnit=" ms"
      subtitle="Heart Rate Variability"
    />
    <MiniChartCard
      title="Blood Oxygen"    date={date} bg="#3a2a5a" accent="93, 175, 255"
      samples={spo2Samples} current={vitals?.spo2.avg ?? null} currentUnit="%"
      subtitle="SpO₂"
    />
    {/* Body temperature removed: the ring never answers its timed-monitoring
        command, so this card could only ever render "no data". */}
    <MiniChartCard
      title="Stress"          date={date} bg="#4a3a2a" accent="245, 158, 11"
      samples={stressSamples} current={vitals?.stress.avg ?? null} currentUnit=""
      subtitle="0 = calm · 100 = high"
    />
    <PrayerCountCard date={date} count={japaCount} target={JAPA_TARGET} />
  </>
);

const MiniChartCard: React.FC<{
  title: string; date: string; bg: string; accent: string;
  samples: number[]; current: number | string | null; currentUnit?: string; subtitle?: string;
}> = ({ title, date, bg, accent, samples, current, currentUnit = '', subtitle }) => {
  const { palette, mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const data = samples.length > 0 ? sampleDown(samples, 24) : [];
  // In light mode, use white card bg with a subtle accent-tinted border;
  // in dark mode, keep the hand-tuned per-metric dark hex.
  const cardBg = mode === 'light' ? palette.cardBg : bg;
  const textPrimary = palette.cream;
  const textMuted = palette.muted;
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderWidth: 1, borderColor: `rgba(${accent}, 0.35)` }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: textPrimary }]}>{title}</Text>
          <Text style={[styles.cardDate, { color: textMuted }]}>{date}</Text>
        </View>
      </View>
      {data.length >= 2 ? (
        <LineChart
          data={{ labels: [], datasets: [{ data }] }}
          width={CHART_W}
          height={140}
          bezier
          withHorizontalLines={false} withVerticalLines={false} withDots={false}
          withInnerLines={false} withOuterLines={false}
          withHorizontalLabels={false} withVerticalLabels={false}
          chartConfig={chartLineConfig(accent, cardBg)}
          style={{ marginVertical: 8, backgroundColor: 'transparent', paddingRight: 0 }}
        />
      ) : (
        <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: textMuted, fontSize: FONT_SIZES.base }}>No data yet</Text>
        </View>
      )}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: SPACING.xs }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: `rgb(${accent})`, marginRight: 6 }} />
          <Text style={{ color: textPrimary, fontSize: FONT_SIZES.lg, fontWeight: '700' }}>
            {current !== null ? `${current}${currentUnit}` : '--'}
          </Text>
        </View>
        {subtitle && <Text style={{ color: textMuted, fontSize: FONT_SIZES.xs }}>{subtitle}</Text>}
      </View>
    </View>
  );
};

const sampleDown = (arr: number[], n: number): number[] => {
  if (arr.length <= n) return arr;
  const step = arr.length / n;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
  return out;
};

const PrayerCountCard: React.FC<{ date: string; count: number; target: number }> = ({ date, count, target }) => {
  const { palette, mode } = useTheme();
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
  const pct = Math.min(100, (count / target) * 100);
  const cardBg = mode === 'light' ? palette.cardBg : '#1a4550';
  const gaugeColor = mode === 'light' ? palette.gold : '#ffffff';
  return (
    <View style={[styles.card, { backgroundColor: cardBg, borderWidth: 1, borderColor: 'rgba(93,175,255,0.35)' }]}>
      <View style={styles.cardHeader}>
        <View>
          <Text style={[styles.cardTitle, { color: palette.cream }]}>Daily Prayer Count</Text>
          <Text style={[styles.cardDate, { color: palette.muted }]}>{date}</Text>
        </View>
      </View>
      <View style={{ alignItems: 'center', marginVertical: SPACING.md }}>
        <SemicircleGauge value={pct} color={gaugeColor} />
        <Text style={[styles.gaugeLabel, { color: palette.muted }]}>/{target}times</Text>
        <Text style={[styles.gaugeCenter, { color: palette.cream }]}>{count}</Text>
      </View>
    </View>
  );
};

// ═══════════════ Semi-circle gauge ═══════════════════════════════════
const SemicircleGauge: React.FC<{ value: number; color: string }> = ({ value, color }) => {
  const { palette } = useTheme();
  const size = 220;
  const stroke = 8;
  return (
    <View style={{ width: size, height: size / 2 + stroke, alignItems: 'center' }}>
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: stroke, borderColor: palette.border,
        borderRightColor: 'transparent', borderBottomColor: 'transparent',
        transform: [{ rotate: '45deg' }], position: 'absolute',
      }} />
      <View style={{
        width: size, height: size, borderRadius: size / 2,
        borderWidth: stroke, borderColor: color,
        borderRightColor: 'transparent', borderBottomColor: 'transparent',
        transform: [{ rotate: `${45 - (100 - value) * 1.8}deg` }],
        opacity: value > 0 ? 1 : 0.3,
        position: 'absolute',
      }} />
    </View>
  );
};

// ═══════════════ styles ═══════════════════════════════════════════════

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.deep },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingTop: SPACING.xl + SPACING.md, paddingLeft: 56, paddingRight: SPACING.md,
    paddingBottom: 4,
  },
  title: { color: C.cream, fontSize: FONT_SIZES['3xl'], fontWeight: '700' },
  date: { color: C.muted, fontSize: FONT_SIZES.sm, marginHorizontal: SPACING.md },
  refreshBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: C.border,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.gold,
  },
  refreshIcon: { color: C.gold, fontSize: 20 },

  segmented: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md, marginVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md, backgroundColor: C.cardBg,
    padding: 4,
  },
  segBtn: {
    flex: 1, paddingVertical: SPACING.sm,
    alignItems: 'center', borderRadius: BORDER_RADIUS.md - 4,
  },
  segTxt: { color: C.muted, fontSize: FONT_SIZES.sm, fontWeight: '600' },
  syncText: { color: C.muted, fontSize: FONT_SIZES.xs, textAlign: 'center', marginBottom: SPACING.sm },

  card: {
    width: CARD_W,
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: BORDER_RADIUS.lg,
    minHeight: 200,
    backgroundColor: C.cardBg,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  cardTitle: { color: C.cream, fontSize: FONT_SIZES.xl, fontWeight: '700' },
  cardDate: { color: C.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },

  sectionTitle: { color: C.gold, fontSize: FONT_SIZES.sm, textTransform: 'uppercase', letterSpacing: 0.5 },
  dim: { color: C.muted, fontSize: FONT_SIZES.sm },

  gaugeLabel: { position: 'absolute', top: 20, color: C.cream, fontSize: FONT_SIZES.base },
  gaugeCenter: { position: 'absolute', top: 80, color: C.cream, fontSize: FONT_SIZES['4xl'], fontWeight: '700' },
  metricRow: { flexDirection: 'row', marginTop: SPACING.sm },

  sleepTotal: { color: C.cream, fontSize: FONT_SIZES['3xl'], fontWeight: '700' },
  sleepCircle: {
    width: 100, height: 100, borderRadius: 50,
    borderWidth: 5, borderColor: '#a855f7',
    alignItems: 'center', justifyContent: 'center',
  },
  sleepScoreTxt: { color: C.cream, fontSize: FONT_SIZES['2xl'], fontWeight: '700' },
  sleepScoreLabel: { color: C.muted, fontSize: FONT_SIZES.xs, marginTop: 2 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md, marginTop: SPACING.sm },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  legendLabel: { color: C.muted, fontSize: FONT_SIZES.xs },

  stageLabel: { color: C.cream, fontSize: FONT_SIZES.sm, fontWeight: '600' },
  stageValue: { color: C.muted, fontSize: FONT_SIZES.sm },
  stageBarBg: { height: 8, backgroundColor: C.border, borderRadius: 4, overflow: 'hidden' },
  stageBarFill: { height: '100%', borderRadius: 4 },
});


// Static dark styles for helpers rendered outside the palette-aware component.
const styles = makeStyles(COLORS);
