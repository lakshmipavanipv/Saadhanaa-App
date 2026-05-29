import React, { useEffect, useState, useMemo, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Animated,
  Easing,
} from 'react-native';
import { useSadhana } from '../context';
import { Storage } from '../storage';
import {
  todayStr,
  getGreeting,
  getPersonalLine,
  formatDate,
  getUpcoming,
  getUpcomingFestivals,
  getDaysUntil,
  getTodayFest,
  japasToSeconds,
  formatSadhanaTime,
  formatTimeUntil,
  nextOccurrenceOfTime,
  formatShortDate,
} from '../utils';
import { COLORS, SPACING } from '../theme';
import { AIInsightsCard } from '../soulsync/components/AIInsightsCard';
import { SolutionMatrixCard } from '../soulsync/components/SolutionMatrixCard';
import { MicroSadhanaCard } from '../soulsync/components/MicroSadhanaCard';
import { BodySoulLogo } from '../soulsync/components/BodySoulLogo';
import { SoulsyncScoreCard, computeScores } from '../soulsync/components/SoulsyncScoreCard';
import { computeHealthDashboard } from '../soulsync/analytics/HealthDashboard';
import { computeSleepScore } from '../soulsync/analytics/SleepScore';
import { routineRepo } from '../services/routineRepo';
import { DUMMY, withFallback, isUsingDummyData } from '../services/dummyData';
import { SaadhanaScoreCard } from '../soulsync/components/SaadhanaScoreCard';
import { useEmotionalState } from '../soulsync/hooks/useEmotionalState';
import { DeityIcon } from '../components/DeityIcon';
import { TodayPrayersCard } from '../components/TodayPrayersCard';
import { exerciseRepo } from '../services/exerciseRepo';

interface FestReminder {
  shopping?: { enabled: boolean; date: string; time: string; recurrence?: string };
  morning?: { enabled: boolean; time: string };
  pooja?: { enabled: boolean };
}

interface SandhyaSettings {
  times: Record<'pratah' | 'madhyahnika' | 'sayam', string>;
  reminders: Record<'pratah' | 'madhyahnika' | 'sayam', boolean>;
}

// ─── Plan CTA — calm gentle subtle glow ────────────────────────────
//
// A single soft breathing glow at the edges — no shimmer, no bouncing,
// no aggressive scale. Just a gentle pulse that invites attention
// without disturbing the rest of the page.

const AnimatedPlanCta: React.FC<{ onPress: () => void }> = ({ onPress }) => {
  const breath = useRef(new Animated.Value(0)).current;
  const press  = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breath, { toValue: 1, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(breath, { toValue: 0, duration: 2600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    ).start();
  }, [breath]);

  const glowOpacity = breath.interpolate({ inputRange: [0, 1], outputRange: [0.18, 0.42] });

  return (
    <View style={{ marginHorizontal: SPACING.md, marginBottom: SPACING.md }}>
      {/* Soft pulsing halo behind */}
      <Animated.View
        pointerEvents="none"
        style={[styles.planCtaGlow, { opacity: glowOpacity }]}
      />

      <Animated.View style={{ transform: [{ scale: press }] }}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.88}
          onPressIn={() => Animated.spring(press, { toValue: 0.97, useNativeDriver: true }).start()}
          onPressOut={() => Animated.spring(press, { toValue: 1, useNativeDriver: true, friction: 5 }).start()}
        >
          <View style={styles.planCta}>
            <Text style={styles.planCtaIcon}>🎯</Text>
            <View style={{ flex: 1, marginLeft: SPACING.sm }}>
              <Text style={styles.planCtaTitle}>Plan your well-being</Text>
              <Text style={styles.planCtaSub}>Set goals · reminders · sadhana paths</Text>
            </View>
            <Text style={styles.planCtaArrow}>›</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

export const DashboardScreen = ({ navigation }: any) => {
  const { deities, history, setSelectedDeity, alarmQueue, dismissAlarm, deityProgress, userProfile } = useSadhana();
  // Subscribe to emotional events — used to suppress 108-goal pressure when lethargy is flagged
  const { activeEvent, dismiss: dismissEmotional } = useEmotionalState();
  const lethargyEvent = activeEvent?.trigger === 'lethargy' ? activeEvent : null;
  const [festReminders, setFestReminders] = useState<Record<string, FestReminder>>({});
  const [sandhyaSettings, setSandhyaSettings] = useState<SandhyaSettings | null>(null);
  const [_tick, setTick] = useState(0);   // refresh "in X mins" every minute
  const [todayBodyMin, setTodayBodyMin] = useState(0);
  // ── Composite health scores for the 4-box grid ──
  const [healthBoxes, setHealthBoxes] = useState({
    stress: null as number | null,
    sleep:  null as number | null,
    heart:  null as number | null,
    lung:   null as number | null,
  });
  const [commitmentScore, setCommitmentScore] = useState<number | null>(null);
  // Body Health + Soul Depth shown as breakdown inside the hero
  const [scorePack, setScorePack] = useState<{ bodyHealth: number | null; soulDepth: number | null }>({ bodyHealth: null, soulDepth: null });
  const [todayRoutine, setTodayRoutine] = useState<any[]>([]);
  // Demo-mode flag — true while no real ring data has landed yet.
  const [demoMode, setDemoMode] = useState(true);
  useEffect(() => {
    exerciseRepo.todayMinutes().then(setTodayBodyMin);
    (async () => {
      try {
        const dash = await computeHealthDashboard();
        const [bpm, hrv, spo2] = dash.metrics;
        // Stress: lower HRV + higher BPM = more stress (inverted to a 0-100 score)
        const stressScore = (hrv.today > 0 && bpm.today > 0)
          ? Math.max(0, Math.min(100, Math.round(
              100 - (hrv.today < 30 ? (30 - hrv.today) * 2 : 0)
                  - Math.max(0, bpm.today - 65) * 1.5
            )))
          : null;
        // Heart: composite of HRV (60ms = 100) + RHR (60 = 100, +1bpm = -1.5 pts)
        const heartScore = (hrv.today > 0 && bpm.today > 0)
          ? Math.max(0, Math.min(100, Math.round(
              ((hrv.today / 60) * 100) * 0.55 +
              (100 - Math.max(0, bpm.today - 60) * 1.5) * 0.45
            )))
          : null;
        // Lung: SpO2 mapped (95% → 50, 100% → 100, <90% → 0)
        const lungScore = spo2.today > 0
          ? Math.max(0, Math.min(100, Math.round((spo2.today - 90) * 10)))
          : null;
        // Sleep — from the existing sleep-score module
        let sleepScore: number | null = null;
        try {
          const s = await computeSleepScore();
          sleepScore = s.hasData ? s.score : null;
        } catch { /* ignore */ }
        setHealthBoxes({ stress: stressScore, sleep: sleepScore, heart: heartScore, lung: lungScore });
        const c = await computeScores();
        setCommitmentScore(c.overall);
        setScorePack({
          bodyHealth: c.dayBaseline,
          soulDepth: c.hasJapaToday ? c.japaEffect : null,
        });
        // Demo-mode detection — any of these means real data flowing
        setDemoMode(isUsingDummyData({
          hasAmbient: bpm.today > 0 || hrv.today > 0,
          hasSession: c.hasJapaToday,
          hasSleep:  sleepScore != null,
        }));
      } catch { /* DB not ready */ }
      // Today's planned activities (read from Plan tab's routine store)
      try {
        const items = await routineRepo.list();
        const dow = new Date().getDay();
        setTodayRoutine(items.filter(e =>
          e.frequency === 'daily' || (Array.isArray(e.frequency) && e.frequency.includes(dow))
        ));
      } catch { /* */ }
    })();
  }, [_tick]);

  useEffect(() => {
    Storage.get<Record<string, FestReminder>>('festReminders', {}).then(setFestReminders);
    Storage.get<SandhyaSettings | null>('sandhyaSettings', null).then(setSandhyaSettings);
    const id = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  // ── KPIs ─────────────────────────────────────────────────────────
  // Include in-progress count from deityProgress so dashboards update
  // on every single bead tap, not just on full-mala completion.
  // 'history' counts ALL japa entries: manual logs, app taps, and
  // ring-synced taps — all flow through saveSession() into history.
  const inProgressJapas = useMemo(
    () => Object.values(deityProgress).reduce((s, p) => s + (p.count || 0), 0),
    [deityProgress]
  );
  const totalJapasHistorical = useMemo(
    () => history.reduce((s, h) => s + h.japas, 0),
    [history]
  );
  const totalJapas = totalJapasHistorical + inProgressJapas;
  const totalMalas = useMemo(
    () => history.reduce((s, h) => s + h.malas, 0),
    [history]
  );

  // ── Measured prayer time (from Soulsync sessions with real start/end) ──
  // For history entries without timing data, we fall back to the 6-sec
  // per-japa estimate. So `sadhanaSeconds` = estimate of TOTAL time across
  // every entry (manual, app, ring). If/when measured session data exists,
  // we ADDITIONALLY surface it as a confirmation row below the hero.
  const [measuredSeconds, setMeasuredSeconds] = useState<number>(0);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { getDB } = await import('../soulsync/db/database');
        const db = await getDB();
        const row = await db.getFirstAsync<{ total_sec: number | null }>(
          `SELECT COALESCE(SUM(
            CASE WHEN end_time IS NOT NULL
              THEN (julianday(end_time) - julianday(start_time)) * 86400
              ELSE 0 END
          ), 0) AS total_sec FROM session_spiritual`
        );
        if (!cancelled) setMeasuredSeconds(Math.round(row?.total_sec ?? 0));
      } catch {
        // soft-fail — keep 0
      }
    })();
    return () => { cancelled = true; };
  }, [history]);

  const sadhanaSeconds = japasToSeconds(totalJapas);
  // Total deities the user has added to their sadhana — shown on the
  // dashboard. Previously this only counted deities with history or
  // in-progress beads, so newly-added deities were invisible until first use.
  const numDeitiesAdded = deities.length;

  const numDeitiesChanted = useMemo(() => {
    const set = new Set<string>();
    history.forEach(h => h.deityId && set.add(h.deityId));
    // include any deity with in-progress count > 0
    Object.entries(deityProgress).forEach(([id, p]) => {
      if ((p.count || 0) > 0 || (p.malas || 0) > 0) set.add(id);
    });
    return set.size;
  }, [history, deityProgress]);
  const todayFest = getTodayFest();
  const upcoming = getUpcoming();
  const todayCount = history.filter(h => h.date === todayStr()).reduce((s, h) => s + h.malas, 0);

  // ── Per-deity breakdown ──────────────────────────────────────────
  // Includes ALL added deities (even those with 0 history) so the user
  // can see every deity in their sadhana from day one.
  const perDeity = useMemo(() => {
    const m: Record<string, { id?: string; name: string; icon: string; malas: number; japas: number; color: string }> = {};

    // Seed with every added deity at zero — guarantees they appear in the list
    for (const d of deities) {
      m[d.id] = {
        id: d.id,
        name: d.name,
        icon: d.icon,
        malas: 0,
        japas: 0,
        color: d.malaColor || COLORS.gold,
      };
    }

    for (const h of history) {
      const d = deities.find(d => d.id === h.deityId);
      const key = h.deityId || h.deity;
      if (!m[key]) {
        m[key] = {
          id: h.deityId,
          name: h.deity,
          icon: d?.icon || '🙏',
          malas: 0,
          japas: 0,
          color: d?.malaColor || COLORS.gold,
        };
      }
      m[key].malas += h.malas;
      m[key].japas += h.japas;
    }
    // Add in-progress japas (current bead position) for any active deity
    for (const [id, p] of Object.entries(deityProgress)) {
      if ((p.count || 0) === 0) continue;
      const d = deities.find(d => d.id === id);
      if (!d) continue;
      if (!m[id]) {
        m[id] = { id, name: d.name, icon: d.icon, malas: 0, japas: 0, color: d.malaColor || COLORS.gold };
      }
      m[id].japas += p.count;
    }
    // Sort by total japas descending; tie-break by name so unused deities
    // appear in a stable order at the bottom.
    return Object.values(m).sort((a, b) => b.japas - a.japas || a.name.localeCompare(b.name));
  }, [history, deities, deityProgress]);
  const maxDeityMalas = Math.max(...perDeity.map(d => d.malas), 1);

  // ── Reminder feed (sorted chronologically) ───────────────────────
  type FeedItem = {
    when: Date;
    label: string;
    detail: string;
    icon: string;
    color: string;
  };
  const feedItems: FeedItem[] = useMemo(() => {
    const items: FeedItem[] = [];

    // Deity japa alarms
    for (const d of deities) {
      if (!d.alarmOn) continue;
      items.push({
        when: nextOccurrenceOfTime(d.prayerAlarm),
        label: `${d.icon} ${d.name}`,
        detail: `Japa at ${d.prayerAlarm}`,
        icon: '⏰',
        color: COLORS.gold,
      });
    }

    // Sandhya Vandanam reminders
    if (sandhyaSettings) {
      const labels: Record<string, string> = {
        pratah: 'Pratah Sandhya 🌅',
        madhyahnika: 'Madhyahnika Sandhya ☀️',
        sayam: 'Sayam Sandhya 🌙',
      };
      for (const id of ['pratah', 'madhyahnika', 'sayam'] as const) {
        if (sandhyaSettings.reminders[id]) {
          const t = sandhyaSettings.times[id];
          items.push({
            when: nextOccurrenceOfTime(t),
            label: labels[id],
            detail: `at ${t}`,
            icon: '🪷',
            color: COLORS.saffron,
          });
        }
      }
    }

    // Festival reminders (shopping + morning)
    for (const [festId, r] of Object.entries(festReminders)) {
      const fest = [...require('../festivalsData').PANCHANG_FESTIVALS].find((f: any) => f.id === festId);
      const festName = fest?.name || festId;
      if (r.shopping?.enabled && r.shopping.date) {
        const [y, mo, d] = r.shopping.date.split('-').map(Number);
        const [h, mi] = (r.shopping.time || '10:00').split(':').map(Number);
        const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
        if (dt.getTime() > Date.now()) {
          items.push({
            when: dt,
            label: `🛒 ${festName}`,
            detail: `Shopping reminder · ${r.shopping.recurrence || 'once'}`,
            icon: '🛒',
            color: COLORS.leaf,
          });
        }
      }
      if (r.morning?.enabled && fest?.date) {
        const [y, mo, d] = fest.date.split('-').map(Number);
        const [h, mi] = (r.morning.time || '06:00').split(':').map(Number);
        const dt = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
        if (dt.getTime() > Date.now()) {
          items.push({
            when: dt,
            label: `🌅 ${festName}`,
            detail: `Festival morning at ${r.morning.time}`,
            icon: '🌅',
            color: COLORS.saffron,
          });
        }
      }
    }

    items.sort((a, b) => a.when.getTime() - b.when.getTime());
    return items;
  }, [deities, sandhyaSettings, festReminders, _tick]);

  const nextJapa = feedItems.find(i => i.icon === '⏰');

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header — animated BODY & SOUL logo replaces the static greeting */}
        <View style={styles.header}>
          <BodySoulLogo width={240} />
          <Text style={styles.personalLine}>{getPersonalLine(userProfile?.name)}</Text>
          <Text style={styles.date}>{formatDate(todayStr())}</Text>
        </View>


        {/* Alarm Banner */}
        {alarmQueue.length > 0 && (
          <View style={styles.alarmBanner}>
            <Text style={{ fontSize: 22 }}>⏰</Text>
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Text style={styles.alarmTitle}>Prayer time — {alarmQueue[0].name}</Text>
              <Text style={styles.alarmDetail}>
                {alarmQueue[0].prayerAlarm} · {alarmQueue[0].mantra}
              </Text>
            </View>
            <TouchableOpacity onPress={dismissAlarm} style={styles.alarmDismiss}>
              <Text style={{ color: COLORS.cream }}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Vitality Spark — replaces 108-goal pressure when 3-day lethargy detected */}
        {lethargyEvent && (
          <MicroSadhanaCard event={lethargyEvent} onComplete={dismissEmotional} />
        )}

        {/* ── 1. BODY & SOUL HEALTH SCORE (hero) ──
            Now shows a NUMBER /100 (not time). Breakdown pills show
            Body Health Score + Soul Depth Score. */}
        <View style={styles.sadhanaHero}>
          <Text style={styles.sadhanaHeroLabel}>Body & Soul Health Score</Text>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center' }}>
            <Text style={styles.sadhanaHeroValue}>
              {withFallback(commitmentScore, DUMMY.bodySoulHealth)}
            </Text>
            <Text style={styles.heroOutOf}> / 100</Text>
          </View>

          {/* Breakdown — Body Health + Soul Depth SIDE-BY-SIDE,
              same exact layout as the Commitment Score box's
              Workout Time / Sadhana Time pair. */}
          {(() => {
            const bodyHealth = withFallback(scorePack.bodyHealth, DUMMY.bodyHealthScore);
            const soulDepth  = withFallback(scorePack.soulDepth,  DUMMY.soulDepthScore);
            const colorFor = (s: number) =>
              s >= 80 ? '#3ddc84' : s >= 60 ? '#FFB800' : s >= 40 ? '#FFD54F' : '#FF8C42';
            return (
              <View style={[styles.cscBarRow, { alignSelf: 'stretch' }]}>
                {/* Body Health */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>❤️</Text>
                    <Text style={styles.cscBarLabelNew} numberOfLines={1}>Body Health</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(bodyHealth) }]}>{bodyHealth}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${bodyHealth}%`, backgroundColor: colorFor(bodyHealth) }]} />
                  </View>
                </View>

                {/* Soul Depth */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>🪷</Text>
                    <Text style={styles.cscBarLabelNew} numberOfLines={1}>Soul Depth</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(soulDepth) }]}>{soulDepth}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${soulDepth}%`, backgroundColor: colorFor(soulDepth) }]} />
                  </View>
                </View>
              </View>
            );
          })()}

          <Text style={[styles.sadhanaHeroSource, { textAlign: 'center', marginTop: SPACING.sm }]}>
            ⏱ {formatSadhanaTime(sadhanaSeconds + todayBodyMin * 60)} total today
            {measuredSeconds > 0 && ` · ${formatSadhanaTime(measuredSeconds)} ring-timed`}
          </Text>
          <Text style={styles.sadhanaHeroToday}>
            {todayCount === 0 && todayBodyMin === 0
              ? '🌅 No exercise or soul work done yet today — gentle start awaits 🙏'
              : `🌅 Today: ${todayCount > 0 ? `${todayCount} mala${todayCount !== 1 ? 's' : ''}` : 'no japa yet'}${todayBodyMin > 0 ? ` · ${todayBodyMin} min movement` : ''}`}
          </Text>
        </View>

        {/* ── 2. 4 BEAUTIFUL HEALTH BOXES (with realistic fallback) ── */}
        <View style={styles.h4Grid}>
          {[
            { label: 'Stress', icon: '🧠', value: withFallback(healthBoxes.stress, DUMMY.healthBoxes.stress), color: '#c084fc' },
            { label: 'Sleep',  icon: '😴', value: withFallback(healthBoxes.sleep,  DUMMY.healthBoxes.sleep),  color: '#4ea8de' },
            { label: 'Heart',  icon: '❤️', value: withFallback(healthBoxes.heart,  DUMMY.healthBoxes.heart),  color: '#FF8C42' },
            { label: 'Lung',   icon: '🫁', value: withFallback(healthBoxes.lung,   DUMMY.healthBoxes.lung),   color: '#3ddc84' },
          ].map(b => (
            <View key={b.label} style={[styles.h4Box, { borderColor: b.color + '55' }]}>
              <Text style={styles.h4Icon}>{b.icon}</Text>
              <Text style={[styles.h4Value, { color: b.color }]}>
                {b.value}<Text style={styles.h4Out}>/100</Text>
              </Text>
              <Text style={styles.h4Label}>{b.label}</Text>
            </View>
          ))}
        </View>

        {/* ── 3. "Plan your routine" CTA · animated to grab attention ── */}
        <AnimatedPlanCta onPress={() => navigation?.navigate?.('Plan')} />

        {/* ── 4. COMMITMENT SCORE — bars styled like the SoulsyncScoreCard ── */}
        {(() => {
          const bodyGoal = userProfile?.goals?.bodyMinutesPerDay ?? 30;
          const soulGoal = userProfile?.goals?.soulMinutesPerDay ?? 20;
          const realSoulMin = Math.round(sadhanaSeconds / 60);
          const workoutMin = withFallback(todayBodyMin,  DUMMY.workoutMinutesToday);
          const soulMin    = withFallback(realSoulMin,   DUMMY.sadhanaMinutesToday);
          const workoutPct = Math.min(100, Math.round((workoutMin / Math.max(1, bodyGoal)) * 100));
          const soulPct    = Math.min(100, Math.round((soulMin    / Math.max(1, soulGoal)) * 100));
          // Same gradient as colorFor() in SoulsyncScoreCard
          const colorFor = (s: number) =>
            s >= 80 ? '#3ddc84' : s >= 60 ? '#FFB800' : s >= 40 ? '#FFD54F' : '#FF8C42';
          const finalCommitment = withFallback(commitmentScore, DUMMY.commitmentScore);
          const overallColor = colorFor(finalCommitment);
          return (
            <View style={styles.cscBox}>
              <Text style={styles.cscTitle}>Commitment Score</Text>

              {/* Big number — matches SoulsyncScoreCard's bigRow */}
              <View style={styles.cscBigRow}>
                <Text style={[styles.cscBigNumber, { color: overallColor }]}>
                  {finalCommitment}
                </Text>
                <Text style={styles.cscBigOutOf}>/ 100</Text>
              </View>

              {/* Two bars — same row layout as SoulsyncScoreCard.barRow */}
              <View style={styles.cscBarRow}>
                {/* Workout Time */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>🏃</Text>
                    <Text style={styles.cscBarLabelNew}>Workout Time</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(workoutPct) }]}>{workoutPct}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${workoutPct}%`, backgroundColor: colorFor(workoutPct) }]} />
                  </View>
                  <Text style={styles.cscBarSubtle}>{workoutMin} min today · goal {bodyGoal}</Text>
                </View>

                {/* Sadhana Time */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>🪷</Text>
                    <Text style={styles.cscBarLabelNew}>Sadhana Time</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(soulPct) }]}>{soulPct}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${soulPct}%`, backgroundColor: colorFor(soulPct) }]} />
                  </View>
                  <Text style={styles.cscBarSubtle}>{soulMin} min today · goal {soulGoal}</Text>
                </View>
              </View>
            </View>
          );
        })()}

        {/* ── 5. Body & Soul advice (motivational note) ── */}
        <View style={styles.sadhanaNote}>
          <Text style={styles.sadhanaNoteTitle}>🌱  Body & Soul · A Note for You</Text>
          <Text style={styles.sadhanaNoteBody}>
            <Text style={styles.sadhanaNoteBold}>Notice this — </Text>
            when you sit for japa or breath work, your <Text style={styles.sadhanaNoteBold}>vitals soften</Text>:
            heart rate calms, HRV widens, your nervous system rests.
            {'\n\n'}
            With consistent sadhana, your <Text style={styles.sadhanaNoteBold}>daily baseline shifts</Text> —
            your resting state itself becomes the calmer state.
            {'\n\n'}
            You have this capacity, my friend. Commit · go deeper · the body
            will thank you. The depth grows in proportion to the showing-up. 🙏
          </Text>
        </View>

        {/* ── 6. Your Vitals Baseline — real 7-day baseline vs current ── */}
        <SaadhanaScoreCard />

        {/* ── 7. Today's Planned Activities ── */}
        <View style={styles.tpaBox}>
          <Text style={styles.tpaTitle}>📅  Today's Planned Activities</Text>
          <View style={styles.tpaSummary}>
            <View style={styles.tpaSummaryCol}>
              <Text style={styles.tpaSummaryValue}>{todayBodyMin}</Text>
              <Text style={styles.tpaSummaryLabel}>🏃 workout{'\n'}min today</Text>
            </View>
            <View style={styles.tpaSummaryCol}>
              <Text style={styles.tpaSummaryValue}>{Math.round(sadhanaSeconds / 60)}</Text>
              <Text style={styles.tpaSummaryLabel}>🪷 sadhana{'\n'}min today</Text>
            </View>
            <View style={styles.tpaSummaryCol}>
              <Text style={styles.tpaSummaryValue}>{todayRoutine.length}</Text>
              <Text style={styles.tpaSummaryLabel}>📋 planned{'\n'}items</Text>
            </View>
          </View>
          {todayRoutine.length === 0 ? (
            <Text style={styles.tpaEmpty}>
              No activities planned yet. Tap the Plan CTA above to set up your routine.
            </Text>
          ) : (
            todayRoutine.slice(0, 6).map(item => {
              // Heuristic: did the user log enough time to count this as "done"?
              const isWorkout = ['exercise'].includes(item.category);
              const isSoul    = ['japa','meditate','sandhya'].includes(item.category);
              const minDone   = isWorkout ? todayBodyMin : isSoul ? Math.round(sadhanaSeconds / 60) : 0;
              const done = minDone >= item.durationMin;
              return (
                <View key={item.id} style={styles.tpaRow}>
                  <Text style={styles.tpaStar}>{done ? '⭐' : '☆'}</Text>
                  <Text style={styles.tpaTime}>{item.time || '—'}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tpaName}>{item.name}</Text>
                    <Text style={styles.tpaMeta}>
                      {item.durationMin} min
                      {item.notificationIds && ' · 🔔 reminder on'}
                    </Text>
                  </View>
                  {item.notificationIds && (
                    <Text style={styles.tpaBell}>🔔</Text>
                  )}
                </View>
              );
            })
          )}
        </View>

        {/* SoulsyncScoreCard removed — its Body Health + Soul Depth bars
            are now in the hero (top), and the new Commitment Score box
            above already covers the same "score / 100 + 2 bars" shape
            with Workout Time / Sadhana Time labels per UX feedback. */}

        {/* My Deities section moved to Japa tab in v37 (tap Japa tab below) */}

        {/* SaadhanaScoreCard moved up — it is now "Your Vitals Baseline"
            sitting right after the Note. AIInsightsCard removed — the
            page ends cleanly at Today's Sadhana Times + Festivals. */}

        {/* #8 — Today's Sadhana Times */}
        <TodayPrayersCard
          slots={feedItems
            .filter(i => i.icon === '⏰')
            .map(i => {
              const deityFromName = deities.find(d => i.label.includes(d.name)) || deities[0];
              return {
                deity: deityFromName,
                when: i.when,
                timeLabel: deityFromName?.prayerAlarm || '',
              };
            })
            .filter(s => s.deity)
          }
          onSelect={d => { setSelectedDeity(d); navigation?.navigate('Japa'); }}
        />

        {/* #9 — Today's festival banner */}
        {todayFest && (
          <View style={styles.todayFestCard}>
            <Text style={{ fontSize: 36 }}>{todayFest.deityIcon}</Text>
            <Text style={styles.todayFestName}>{todayFest.name}</Text>
            <Text style={styles.todayFestWish}>{todayFest.wish}</Text>
          </View>
        )}

        {/* #10 — Other reminders (festivals & non-prayer items) — bottom */}
        {feedItems.filter(i => i.icon !== '⏰').length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Other Reminders</Text>
            {feedItems.filter(i => i.icon !== '⏰').slice(0, 6).map((item, i) => (
              <View key={i} style={styles.feedRow}>
                <Text style={[styles.feedIcon, { color: item.color }]}>{item.icon}</Text>
                <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                  <Text style={styles.feedLabel}>{item.label}</Text>
                  <Text style={styles.feedDetail}>{item.detail}</Text>
                </View>
                <Text style={[styles.feedWhen, { color: item.color }]}>
                  {formatTimeUntil(item.when)}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Next Festival info */}
        {upcoming && (
          <View style={styles.upcomingFest}>
            <View style={styles.upcomingTopRow}>
              <Text style={{ fontSize: 32 }}>{upcoming.deityIcon}</Text>
              <View style={{ flex: 1, marginLeft: SPACING.sm }}>
                <Text style={styles.upcomingLabel}>NEXT FESTIVAL</Text>
                <Text style={styles.upcomingName}>{upcoming.name}</Text>
                <Text style={styles.upcomingDays}>
                  {(() => {
                    const dl = getDaysUntil(upcoming.date);
                    if (dl === 0) return '🎊 Today!';
                    if (dl === 1) return '⏰ Tomorrow';
                    if (dl <= 7) return `⚡ In ${dl} days`;
                    return `📅 In ${dl} days · ${formatShortDate(upcoming.date)}`;
                  })()}
                </Text>
              </View>
            </View>
            <Text style={styles.upcomingDeity}>{upcoming.deity}</Text>
            {upcoming.checklist.length > 0 && (
              <View style={styles.checklistPreview}>
                {upcoming.checklist.slice(0, 3).map(it => (
                  <View key={it.id} style={styles.checklistItem}>
                    <Text style={styles.checklistTag}>{it.tag}</Text>
                    <Text style={styles.checklistText}>{it.text}</Text>
                  </View>
                ))}
                {upcoming.checklist.length > 3 && (
                  <Text style={styles.checklistMore}>
                    +{upcoming.checklist.length - 3} more in Festivals tab
                  </Text>
                )}
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.deep },
  scroll: { paddingBottom: 80 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: 'center',
  },
  greeting: { fontSize: 26, color: COLORS.cream, fontWeight: '600', marginBottom: 4 },
  tagline: { fontSize: 13, color: COLORS.muted, marginBottom: 6 },
  // Caretaker line — personal, body+soul-sync promise, rotates with time-of-day
  personalLine: {
    fontSize: 13,
    color: '#d6e040',                 // citron — matches the Soulsync theme
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },
  date: { fontSize: 12, color: COLORS.gold, fontWeight: '500' },

  alarmBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.15)',
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alarmTitle: { fontSize: 14, color: COLORS.cream, fontWeight: '600' },
  alarmDetail: { fontSize: 12, color: COLORS.saffron, marginTop: 2 },
  alarmDismiss: { paddingHorizontal: SPACING.sm },

  todayFestCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  todayFestName: { fontSize: 18, color: COLORS.cream, fontWeight: '700', marginTop: 4 },
  todayFestWish: { fontSize: 13, color: COLORS.gold, marginTop: 4, textAlign: 'center', fontStyle: 'italic' },

  nextJapaCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: COLORS.gold,
  },
  nextJapaLabel: {
    fontSize: 10,
    color: COLORS.gold,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  nextJapaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  nextJapaName: { fontSize: 16, color: COLORS.cream, fontWeight: '600', flex: 1 },
  nextJapaWhen: { fontSize: 13, color: COLORS.saffron, fontWeight: '600' },
  nextJapaDetail: { fontSize: 11, color: COLORS.muted, marginTop: 2 },

  // ── Big hero card for total prayer time (priority #1 for elderly users) ──
  sadhanaHero: {
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.lg,
    backgroundColor: COLORS.cardBg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: COLORS.gold,
    alignItems: 'center',
  },
  sadhanaHeroLabel: {
    fontSize: 13,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  sadhanaHeroValue: {
    fontSize: 38,
    color: COLORS.gold,
    fontWeight: '700',
    lineHeight: 42,
  },
  sadhanaHeroSource: {
    fontSize: 11,
    color: COLORS.muted,
    fontStyle: 'italic',
    marginTop: 4,
  },
  sadhanaHeroDivider: {
    width: 60,
    height: 1,
    backgroundColor: 'rgba(212, 160, 23, 0.4)',
    marginVertical: SPACING.sm,
  },
  sadhanaHeroToday: {
    fontSize: 13,
    color: COLORS.cream,
    textAlign: 'center',
    marginTop: SPACING.sm,
  },

  heroOutOf: { fontSize: 16, color: COLORS.muted, fontWeight: '500' },

  // Hero horizontal bars — Body Health Score + Soul Depth Score
  heroBarsBlock: {
    alignSelf: 'stretch',
    marginTop: SPACING.md, marginBottom: 2,
  },
  heroBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  heroBarIcon: { fontSize: 14 },
  heroBarLabel: { flex: 1, fontSize: 12, color: COLORS.cream, fontWeight: '600' },
  heroBarScore: { fontSize: 14, fontWeight: '800' },
  heroBarTrack: {
    height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  heroBarFill: { height: '100%', borderRadius: 4 },

  // Hero score-strip — small pills under the big number (legacy unused)
  heroScoreStrip: {
    flexDirection: 'row', gap: 8,
    marginTop: SPACING.md, marginBottom: 2,
    alignSelf: 'stretch',
  },
  heroScorePill: {
    flex: 1, alignItems: 'center', justifyContent: 'center',
    paddingVertical: 8, paddingHorizontal: 4,
    borderRadius: 10, backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 1, borderColor: 'rgba(212,160,23,0.30)',
  },
  heroScorePillValue: { color: COLORS.gold, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  heroScorePillLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },

  // 4-box health grid (Stress / Sleep / Heart / Lung)
  h4Grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  h4Box: {
    flexBasis: '48%', flexGrow: 1,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    backgroundColor: COLORS.cardBg, borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  h4Icon: { fontSize: 24, marginBottom: 4 },
  h4Value: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  h4Out: { fontSize: 12, color: COLORS.muted, fontWeight: '500' },
  h4Label: { color: COLORS.cream, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },

  // Plan CTA — calm, restful card with gentle glow
  planCta: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderRadius: 14,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 1, borderColor: COLORS.gold,
  },
  // Soft gold halo behind the card (subtle)
  planCtaGlow: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 18,
    backgroundColor: COLORS.gold,
    shadowColor: COLORS.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  planCtaIcon: { fontSize: 26, marginRight: 2 },
  planCtaTitle: {
    color: COLORS.cream, fontSize: 14, fontWeight: '700',
    letterSpacing: 0.2,
  },
  planCtaSub: {
    color: COLORS.muted, fontSize: 11, marginTop: 2, fontWeight: '500',
  },
  planCtaArrow: {
    color: COLORS.gold, fontSize: 22, paddingHorizontal: 6, fontWeight: '700',
  },

  // ── Commitment Score box (visuals copied from SoulsyncScoreCard) ──
  cscBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.lg, borderRadius: 16,
    backgroundColor: COLORS.cardBg,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  cscTitle: {
    fontSize: 13, color: COLORS.muted, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
    textAlign: 'center', marginBottom: 4,
  },
  cscBigRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 6, marginBottom: SPACING.md },
  cscBigNumber: { fontSize: 56, fontWeight: '700', lineHeight: 60 },
  cscBigOutOf: { fontSize: 16, color: COLORS.muted, marginLeft: 6, fontWeight: '500' },

  cscBarRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  cscBarCol: { flex: 1, minWidth: 0 },        // minWidth:0 lets text shrink instead of overflow
  cscBarHeader: {
    flexDirection: 'row', alignItems: 'center',
    marginBottom: 6,
  },
  cscBarIconNew: { fontSize: 15, marginRight: 5 },
  cscBarLabelNew: {
    flex: 1,
    fontSize: 13,
    color: COLORS.cream,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  cscBarScore: {
    fontSize: 16, fontWeight: '800', letterSpacing: 0.5,
    minWidth: 28, textAlign: 'right',          // right-justify so 50/85 align
  },
  cscBarTrackNew: {
    height: 8, borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.08)',
    overflow: 'hidden',
  },
  cscBarFillNew: { height: '100%', borderRadius: 4 },
  cscBarSubtle: {
    color: COLORS.cream, opacity: 0.55,
    fontSize: 11, marginTop: 6, fontWeight: '500',
  },

  // Vitals Baseline Trend (placeholder showing the sadhana effect)
  vbtBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: 'rgba(78,168,222,0.08)',
    borderWidth: 1, borderColor: 'rgba(78,168,222,0.30)',
  },
  vbtTitle: { color: '#4ea8de', fontSize: 13, fontWeight: '800', marginBottom: 4 },
  vbtHint:  { color: COLORS.muted, fontSize: 11, fontStyle: 'italic', marginBottom: SPACING.sm },
  vbtRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  vbtIcon:  { fontSize: 16, width: 24 },
  vbtLabel: { flex: 1, color: COLORS.cream, fontSize: 12, fontWeight: '600' },
  vbtBefore:{ color: COLORS.muted, fontSize: 13, width: 44, textAlign: 'right' },
  vbtArrow: { color: COLORS.muted, fontSize: 12, paddingHorizontal: 4 },
  vbtAfter: { color: COLORS.cream, fontSize: 13, fontWeight: '700', width: 44, textAlign: 'right' },
  vbtDelta: { fontSize: 11, fontWeight: '700', width: 70, textAlign: 'right' },
  vbtFooter:{ color: COLORS.cream, fontSize: 11, fontStyle: 'italic', marginTop: SPACING.sm },

  // Today's Planned Activities
  tpaBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: COLORS.cardBg, borderWidth: 1, borderColor: COLORS.border,
  },
  tpaTitle: { color: COLORS.cream, fontSize: 13, fontWeight: '800', marginBottom: SPACING.sm },
  tpaSummary: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 10, marginBottom: SPACING.sm },
  tpaSummaryCol: { flex: 1, alignItems: 'center' },
  tpaSummaryValue: { color: COLORS.gold, fontSize: 18, fontWeight: '800' },
  tpaSummaryLabel: { color: COLORS.muted, fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  tpaEmpty: { color: COLORS.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: SPACING.sm },
  tpaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tpaStar: { fontSize: 16, width: 26 },
  tpaTime: { color: COLORS.gold, fontSize: 12, fontWeight: '700', width: 54 },
  tpaName: { color: COLORS.cream, fontSize: 13, fontWeight: '600' },
  tpaMeta: { color: COLORS.muted, fontSize: 11, marginTop: 1 },
  tpaBell: { fontSize: 12, color: COLORS.gold, paddingHorizontal: 4 },

  // Commitment box (legacy — kept for compatibility but unused)
  commitmentBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 16,
    backgroundColor: COLORS.cardBg, borderWidth: 2, borderColor: COLORS.gold,
  },
  commitmentLabel: { color: COLORS.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  commitmentBig: { color: COLORS.gold, fontSize: 38, fontWeight: '800', lineHeight: 40 },
  commitmentOut: { color: COLORS.muted, fontSize: 14, fontWeight: '500' },
  commitmentTotalTime: { color: COLORS.cream, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  commitmentSplit: {
    flexDirection: 'row', marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  commitmentSplitDivider: { width: 1, backgroundColor: 'rgba(212,160,23,0.20)' },
  commitmentSubLabel: { color: COLORS.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  commitmentSubValue: { color: COLORS.cream, fontSize: 22, fontWeight: '800', lineHeight: 24 },
  commitmentSubOut: { color: COLORS.muted, fontSize: 11, fontWeight: '500' },
  commitmentSubTime: { color: COLORS.gold, fontSize: 10, fontWeight: '700', marginTop: 2 },

  // Sadhana motivational note
  sadhanaNote: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderLeftWidth: 4, borderLeftColor: COLORS.gold,
  },
  sadhanaNoteTitle: { color: COLORS.gold, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  sadhanaNoteBody:  { color: COLORS.cream, fontSize: 13, lineHeight: 19 },
  sadhanaNoteBold:  { color: COLORS.gold, fontWeight: '800' },

  kpiCard: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 14,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  kpiCol: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
  kpiValue: { fontSize: 26, color: COLORS.gold, fontWeight: '700' },
  kpiLabel: {
    fontSize: 11,
    color: COLORS.cream,
    marginTop: 6,
    textAlign: 'center',
    lineHeight: 14,
  },
  kpiDivider: { width: 1, backgroundColor: 'rgba(212, 160, 23, 0.2)', marginVertical: 6 },

  todayStrip: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.08)',
    borderRadius: 8,
    paddingHorizontal: SPACING.md,
    paddingVertical: 8,
    marginBottom: SPACING.md,
  },
  todayStripText: { fontSize: 12, color: COLORS.saffron, fontWeight: '500', textAlign: 'center' },

  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 11,
    color: COLORS.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },

  deityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.sm,
    marginBottom: 6,
  },
  deityRowIcon: { fontSize: 26 },
  deityRowIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 1, borderColor: 'rgba(212, 160, 23, 0.3)',
    justifyContent: 'center', alignItems: 'center',
  },
  deityRowHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  deityRowName: { flex: 1, fontSize: 13, color: COLORS.cream, fontWeight: '600' },
  deityRowMalas: { fontSize: 12, color: COLORS.gold, fontWeight: '600' },
  deityBarTrack: {
    height: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  deityBarFill: { height: '100%', borderRadius: 3 },
  deityRowTime: { fontSize: 10, color: COLORS.muted, marginTop: 4 },
  deityRowChevron: { fontSize: 22, color: COLORS.gold, marginLeft: SPACING.sm, opacity: 0.7 },

  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  feedIcon: { fontSize: 18 },
  feedLabel: { fontSize: 13, color: COLORS.cream, fontWeight: '500' },
  feedDetail: { fontSize: 11, color: COLORS.muted, marginTop: 2 },
  feedWhen: { fontSize: 11, fontWeight: '600', marginLeft: SPACING.sm },

  quickStartGrid: { flexDirection: 'row', gap: SPACING.sm },
  deityCard: {
    flex: 1,
    backgroundColor: COLORS.cardBg,
    borderRadius: 10,
    padding: SPACING.sm,
    alignItems: 'center',
  },
  deityCardIcon: { fontSize: 26, marginBottom: 4 },
  deityCardIconWrap: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderWidth: 1, borderColor: 'rgba(212, 160, 23, 0.3)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 6,
  },
  deityCardName: { fontSize: 12, color: COLORS.cream, fontWeight: '500' },
  deityCardMalas: { fontSize: 10, color: COLORS.muted, marginTop: 2 },

  upcomingFest: {
    marginHorizontal: SPACING.md,
    backgroundColor: COLORS.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  upcomingTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  upcomingLabel: { fontSize: 10, color: COLORS.muted, letterSpacing: 1.5, fontWeight: '600' },
  upcomingName: { fontSize: 16, color: COLORS.cream, fontWeight: '700', marginTop: 2 },
  upcomingDays: { fontSize: 12, color: COLORS.gold, marginTop: 2 },
  upcomingDeity: { fontSize: 12, color: COLORS.saffron, fontStyle: 'italic', marginBottom: SPACING.sm },
  checklistPreview: { gap: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center' },
  checklistTag: { fontSize: 14, marginRight: SPACING.sm },
  checklistText: { fontSize: 12, color: COLORS.cream },
  checklistMore: { fontSize: 11, color: COLORS.muted, marginTop: 4, fontStyle: 'italic' },
});
