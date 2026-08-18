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
import { useTheme } from '../ThemeContext';
import { AIInsightsCard } from '../soulsync/components/AIInsightsCard';
import { SolutionMatrixCard } from '../soulsync/components/SolutionMatrixCard';
import { MicroSadhanaCard } from '../soulsync/components/MicroSadhanaCard';
import { BodySoulLogo } from '../soulsync/components/BodySoulLogo';
import { SoulsyncScoreCard, computeScores } from '../soulsync/components/SoulsyncScoreCard';
import { computeHealthDashboard } from '../soulsync/analytics/HealthDashboard';
import { computeSleepScore } from '../soulsync/analytics/SleepScore';
import { routineRepo } from '../services/routineRepo';
import { showNum, barPct, NO_DATA_COLOR } from '../services/vitalsDisplay';
import { computeHealthBoxes } from '../soulsync/analytics/HealthScores';
import { SaadhanaScoreCard } from '../soulsync/components/SaadhanaScoreCard';
import { useEmotionalState } from '../soulsync/hooks/useEmotionalState';
import { DeityIcon } from '../components/DeityIcon';
// TodayPrayersCard removed in v49 — its "in 4h" semantics now live
// inline on each Today's Planned Activities row at the top of Home.
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

// v49: "in 4h" style label for a planned-activity time (HH:MM) — same
// format as the old TodayPrayersCard. Used on each Today's Plan row so
// the user can see "Walk · in 2h" at a glance.
const timeUntilLabel = (hhmm?: string | null): string => {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(s => parseInt(s, 10) || 0);
  const target = new Date();
  target.setHours(h, m, 0, 0);
  const ms = target.getTime() - Date.now();
  if (ms < -60_000) return 'past';
  if (Math.abs(ms) < 60_000) return 'now';
  const mins = Math.round(ms / 60_000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  return `in ${hrs}h`;
};

export const DashboardScreen = ({ navigation }: any) => {
  const { palette } = useTheme();
  // Build styles from the active palette so light/dark toggles actually recolor
  // every card, KPI tile, chip, and text on this screen.
  const styles = React.useMemo(() => makeStyles(palette), [palette]);
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
  // v62: ALL routine items (not just today's) — used to compute the
  // next-occurrence-per-item entries for the new Upcoming Reminders feed.
  const [allRoutine, setAllRoutine] = useState<any[]>([]);
  // Demo-mode flag — true while no real ring data has landed yet.
  // v49: vitals start COLLAPSED behind a "Know more about your body vitals?"
  // toggle so the Home tab opens with a clean, calm Today's Plan view.
  const [showVitals, setShowVitals] = useState(false);
  useEffect(() => {
    exerciseRepo.todayMinutes().then(setTodayBodyMin);
    (async () => {
      try {
        setHealthBoxes(await computeHealthBoxes());
        const c = await computeScores();
        setCommitmentScore(c.overall);
        setScorePack({
          bodyHealth: c.dayBaseline,
          soulDepth: c.hasJapaToday ? c.japaEffect : null,
        });
      } catch { /* DB not ready */ }
      // Today's planned activities (read from Plan tab's routine store)
      try {
        const items = await routineRepo.list();
        setAllRoutine(items);
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

  // ── v62: Upcoming Reminders feed ─────────────────────────────────
  // Aggregates the *next* occurrence of each routine item (walk / jog /
  // sadhana / japa / sandhya) plus the next ekadashi, next festival,
  // and any shopping reminders the user enabled.  Sorted by time-to-event.
  interface HomeReminder {
    id: string;
    kind: 'routine' | 'ekadashi' | 'festival' | 'shopping';
    icon: string;
    title: string;
    subtitle: string;
    when: Date;
    countdown: string;
    tab?: string;
    accent: string;
  }
  const nextReminders: HomeReminder[] = useMemo(() => {
    const out: HomeReminder[] = [];
    const now = Date.now();

    // Compute next occurrence of an HH:MM time + frequency rule
    const nextOcc = (hhmm?: string | null, freq?: 'daily' | number[]): Date | null => {
      if (!hhmm) return null;
      const [h, m] = hhmm.split(':').map(s => parseInt(s, 10) || 0);
      const days: number[] | null = Array.isArray(freq) ? freq : null;
      for (let i = 0; i < 14; i++) {
        const d = new Date(); d.setDate(d.getDate() + i); d.setHours(h, m, 0, 0);
        if (d.getTime() < now) continue;
        if (!days || days.length === 0 || days.includes(d.getDay())) return d;
      }
      return null;
    };
    const fmtCountdown = (when: Date): string => {
      const ms = when.getTime() - now;
      const mins = Math.round(ms / 60_000);
      if (mins < 1) return 'now';
      if (mins < 60) return `in ${mins}m`;
      const hrs = Math.floor(mins / 60); const rem = mins % 60;
      if (hrs < 24) return rem ? `in ${hrs}h ${rem}m` : `in ${hrs}h`;
      const days = Math.round(hrs / 24);
      return days === 1 ? 'tomorrow' : `in ${days}d`;
    };
    const parseLocalDate = (s: string): Date => {
      const [y, mo, d] = s.split('-').map(Number);
      return new Date(y, (mo || 1) - 1, d || 1, 9, 0, 0);
    };

    // Routine items (walk / jog / sadhana / japa / sandhya / meditate)
    const catMeta: Record<string, { icon: string; tab: string; accent: string }> = {
      exercise: { icon: '🏃',  tab: 'Exercise', accent: '#4ea8de' },
      yoga:     { icon: '🧘‍♀️', tab: 'Yoga',     accent: '#FFB800' },
      japa:     { icon: '📿',  tab: 'Japa',     accent: '#FF8C42' },
      sandhya:  { icon: '🌅',  tab: 'Japa',     accent: '#FFD9A8' },
      meditate: { icon: '🪷',  tab: 'Yoga',     accent: '#c084fc' },
    };
    for (const it of allRoutine) {
      const when = nextOcc(it.time, it.frequency);
      if (!when) continue;
      // Prefer walking/jog-specific icons when the name is explicit
      const lower = (it.name || '').toLowerCase();
      let icon = catMeta[it.category]?.icon ?? '📌';
      if (lower.includes('jog')) icon = '🏃‍♂️';
      else if (lower.includes('walk')) icon = '🚶';
      const meta = catMeta[it.category] || { tab: 'Plan', accent: COLORS.gold };
      out.push({
        id: 'r-' + it.id,
        kind: 'routine',
        icon,
        title: it.name,
        subtitle: `${it.durationMin} min · ⏰ ${it.time}`,
        when,
        countdown: fmtCountdown(when),
        tab: meta.tab,
        accent: meta.accent,
      });
    }

    // Next ekadashi + next non-ekadashi festival
    try {
      const fests = getUpcomingFestivals(20);
      const ekadashi = fests.find(f => /ekadashi/i.test(f.name));
      if (ekadashi) {
        const when = parseLocalDate(ekadashi.date);
        out.push({
          id: 'e-' + ekadashi.id, kind: 'ekadashi', icon: '🪷',
          title: ekadashi.name, subtitle: `Ekadashi · ${formatShortDate(ekadashi.date)}`,
          when, countdown: fmtCountdown(when), tab: 'Panchang', accent: COLORS.saffron,
        });
      }
      const fest = fests.find(f => !/ekadashi/i.test(f.name));
      if (fest) {
        const when = parseLocalDate(fest.date);
        out.push({
          id: 'f-' + fest.id, kind: 'festival', icon: fest.deityIcon || '🛕',
          title: fest.name, subtitle: `Festival · ${formatShortDate(fest.date)}`,
          when, countdown: fmtCountdown(when), tab: 'Panchang', accent: COLORS.gold,
        });
      }
    } catch { /* festivals lib not ready */ }

    // Shopping reminders
    try {
      const PANCHANG = require('../festivalsData').PANCHANG_FESTIVALS as any[];
      for (const [festId, r] of Object.entries(festReminders)) {
        if (!r.shopping?.enabled || !r.shopping.date) continue;
        const fest = PANCHANG.find(f => f.id === festId);
        if (!fest) continue;
        const [y, mo, d] = r.shopping.date.split('-').map(Number);
        const [h, mi] = (r.shopping.time || '10:00').split(':').map(Number);
        const when = new Date(y, (mo || 1) - 1, d || 1, h || 0, mi || 0);
        if (when.getTime() < now) continue;
        out.push({
          id: 's-' + festId, kind: 'shopping', icon: '🛒',
          title: `Shopping for ${fest.name}`,
          subtitle: `${r.shopping.date} at ${r.shopping.time}`,
          when, countdown: fmtCountdown(when), tab: 'Panchang', accent: COLORS.leaf,
        });
      }
    } catch { /* */ }

    out.sort((a, b) => a.when.getTime() - b.when.getTime());
    return out.slice(0, 10);
  }, [allRoutine, festReminders, _tick]);

  // ── Render ───────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: palette.deep }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        {/* Header — restored animated BODY & SOUL infinity-ribbon logo
            (BodySoulLogo). The ribbon draws itself in with a blue → purple
            → gold gradient and the 5-petal lotus blossoms from the top
            crossing — this is the canonical brand mark. */}
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
              {showNum(commitmentScore)}
            </Text>
            <Text style={styles.heroOutOf}> / 100</Text>
          </View>

          {/* Breakdown — Body Health + Soul Depth SIDE-BY-SIDE,
              same exact layout as the Commitment Score box's
              Workout Time / Sadhana Time pair. */}
          {(() => {
            const bodyHealth = scorePack.bodyHealth;
            const soulDepth  = scorePack.soulDepth;
            // A score the ring hasn't earned yet renders muted at zero width
            // rather than borrowing a plausible-looking number.
            const colorFor = (s: number | null) =>
              s == null ? NO_DATA_COLOR :
              s >= 80 ? '#3ddc84' : s >= 60 ? '#FFB800' : s >= 40 ? '#FFD54F' : '#FF8C42';
            return (
              <View style={[styles.cscBarRow, { alignSelf: 'stretch' }]}>
                {/* Body Health */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>❤️</Text>
                    <Text style={styles.cscBarLabelNew} numberOfLines={1}>Body Health</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(bodyHealth) }]}>{showNum(bodyHealth)}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${barPct(bodyHealth)}%`, backgroundColor: colorFor(bodyHealth) }]} />
                  </View>
                </View>

                {/* Soul Depth */}
                <View style={styles.cscBarCol}>
                  <View style={styles.cscBarHeader}>
                    <Text style={styles.cscBarIconNew}>🪷</Text>
                    <Text style={styles.cscBarLabelNew} numberOfLines={1}>Soul Depth</Text>
                    <Text style={[styles.cscBarScore, { color: colorFor(soulDepth) }]}>{showNum(soulDepth)}</Text>
                  </View>
                  <View style={styles.cscBarTrackNew}>
                    <View style={[styles.cscBarFillNew, { width: `${barPct(soulDepth)}%`, backgroundColor: colorFor(soulDepth) }]} />
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
              ? (todayRoutine.length === 0
                  // v68: brand-new user with no plan yet — welcome them, don't
                  // guilt-trip about "no workout" before they've planned anything.
                  ? '🌱 Welcome — set up your daily practice in the Plan tab to begin.'
                  : '🌅 No exercise or soul work done yet today — gentle start awaits 🙏')
              : `🌅 Today: ${todayCount > 0 ? `${todayCount} mala${todayCount !== 1 ? 's' : ''}` : 'no japa yet'}${todayBodyMin > 0 ? ` · ${todayBodyMin} min movement` : ''}`}
          </Text>

          {/* v48: storytelling line — small narrative that turns numbers
              into encouragement. Drives the "achievable + measurable"
              part of the SMART model that the UX assessment flagged. */}
          {(() => {
            const score = commitmentScore ?? 0;
            const story = (todayCount === 0 && todayBodyMin === 0)
              ? (todayRoutine.length === 0
                  ? '💛 Plan your well-being to begin your journey.'
                  : '💛 Tap the Plan tab to set today\'s small goal.')
              : score >= 80
                ? '✨ You are landing on a beautiful streak — keep the gentle rhythm.'
                : score >= 60
                  ? '🪷 One more session today will take you into the green band.'
                  : '🌱 A 10-min walk + 1 mala japa lifts this score noticeably.';
            return <Text style={styles.sadhanaHeroStory}>{story}</Text>;
          })()}
        </View>

        {/* ── 2. 4 BEAUTIFUL HEALTH BOXES (with realistic fallback) ── */}
        <View style={styles.h4Grid}>
          {[
            { label: 'Stress', icon: '🧠', value: healthBoxes.stress, color: '#c084fc' },
            { label: 'Sleep',  icon: '😴', value: healthBoxes.sleep,  color: '#4ea8de' },
            { label: 'Heart',  icon: '❤️', value: healthBoxes.heart,  color: '#FF8C42' },
            { label: 'Lung',   icon: '🫁', value: healthBoxes.lung,   color: '#3ddc84' },
          ].map(b => (
            <View key={b.label} style={[styles.h4Box, { borderColor: b.color + '55' }]}>
              <Text style={styles.h4Icon}>{b.icon}</Text>
              <Text style={[styles.h4Value, { color: b.value == null ? NO_DATA_COLOR : b.color }]}>
                {showNum(b.value)}<Text style={styles.h4Out}>/100</Text>
              </Text>
              <Text style={styles.h4Label}>{b.label}</Text>
            </View>
          ))}
        </View>

        {/* ── 3a. "Know more about your body vitals?" — moved BEFORE
              Plan CTA in v51 per user feedback. Toggle wraps only the
              7-day SaadhanaScoreCard table; upstream KPI scores stay
              visible in their original positions. */}
        <TouchableOpacity
          style={styles.vitalsToggle}
          onPress={() => setShowVitals(v => !v)}
          activeOpacity={0.7}
        >
          <Text style={styles.vitalsToggleIcon}>🫀</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.vitalsToggleTitle}>
              {showVitals ? 'Hide your vitals baseline' : 'Know more about your body vitals?'}
            </Text>
            <Text style={styles.vitalsToggleSub}>
              {showVitals
                ? 'Tap to collapse the 7-day baseline table'
                : 'Resting BPM · HRV · SpO₂ · 7-day baseline vs today'}
            </Text>
          </View>
          <Text style={styles.vitalsToggleChev}>{showVitals ? '▴' : '▾'}</Text>
        </TouchableOpacity>

        {showVitals && <SaadhanaScoreCard />}

        {/* ── 3b. "Plan your routine" CTA · animated to grab attention ── */}
        <AnimatedPlanCta onPress={() => navigation?.navigate?.('Plan')} />

        {/* ── 3c. SHORT Body & Soul message — sits right below the Plan
              CTA per v51. The longer multi-paragraph note from v50 was
              replaced with a single warm line. */}
        <View style={styles.shortNote}>
          <Text style={styles.shortNoteText}>
            🌱  <Text style={styles.shortNoteBold}>Show up daily</Text> — the body learns the calm.  🙏
          </Text>
        </View>

        {/* ── 4. COMMITMENT SCORE — bars styled like the SoulsyncScoreCard ── */}
        {(() => {
          const bodyGoal = userProfile?.goals?.bodyMinutesPerDay ?? 30;
          const soulGoal = userProfile?.goals?.soulMinutesPerDay ?? 20;
          const realSoulMin = Math.round(sadhanaSeconds / 60);
          const workoutMin = todayBodyMin;
          const soulMin    = realSoulMin;
          const workoutPct = Math.min(100, Math.round((workoutMin / Math.max(1, bodyGoal)) * 100));
          const soulPct    = Math.min(100, Math.round((soulMin    / Math.max(1, soulGoal)) * 100));
          // Same gradient as colorFor() in SoulsyncScoreCard
          const colorFor = (s: number) =>
            s >= 80 ? '#3ddc84' : s >= 60 ? '#FFB800' : s >= 40 ? '#FFD54F' : '#FF8C42';
          const finalCommitment = commitmentScore;
          const overallColor = finalCommitment == null ? NO_DATA_COLOR : colorFor(finalCommitment);
          return (
            <View style={styles.cscBox}>
              <Text style={styles.cscTitle}>Commitment Score</Text>

              {/* Big number — matches SoulsyncScoreCard's bigRow */}
              <View style={styles.cscBigRow}>
                <Text style={[styles.cscBigNumber, { color: overallColor }]}>
                  {showNum(finalCommitment)}
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

        {/* v51: the lengthy "🌱 Body & Soul · A Note for You" paragraph
            block was condensed into a single line and moved up below
            the Plan CTA.  The vitals toggle + SaadhanaScoreCard pair
            moved up too — they now sit BEFORE the Plan CTA. */}

        {/* ── 7. Today's Planned Activities (restored to original position) ── */}
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
              No activities planned yet. Tap "Plan your well-being" above to set up your routine.
            </Text>
          ) : (
            todayRoutine.slice(0, 6).map(item => {
              const isWorkout = ['exercise'].includes(item.category);
              const isSoul    = ['japa','meditate','sandhya'].includes(item.category);
              const minDone   = isWorkout ? todayBodyMin : isSoul ? Math.round(sadhanaSeconds / 60) : 0;
              const done = minDone >= item.durationMin;
              const categoryMeta: Record<string, { tab: string; icon: string }> = {
                exercise: { tab: 'Exercise', icon: '🏃' },
                yoga:     { tab: 'Yoga',     icon: '🧘‍♀️' },
                meditate: { tab: 'Yoga',     icon: '🪷' },
                japa:     { tab: 'Japa',     icon: '📿' },
                sandhya:  { tab: 'Japa',     icon: '🌅' },
                shraadha: { tab: 'Panchang', icon: '🕯️' },
                tithi:    { tab: 'Panchang', icon: '🌗' },
                festival: { tab: 'Panchang', icon: '🛕' },
              };
              const meta = categoryMeta[item.category] ?? { tab: 'Dashboard', icon: '📌' };
              const until = timeUntilLabel(item.time);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.tpaCard}
                  onPress={() => navigation?.navigate?.(meta.tab)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.tpaCardIcon}>{meta.icon}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.tpaCardName} numberOfLines={1}>
                      {item.name}
                      {done && <Text style={styles.tpaCardDone}>  ⭐</Text>}
                    </Text>
                    <Text style={styles.tpaCardMeta}>
                      {item.durationMin} min
                      {item.notificationIds && '  ·  🔔 on'}
                      {item.time ? `  ·  ⏰ ${item.time}` : ''}
                    </Text>
                  </View>
                  {/* "in 4h" countdown pill — same UI as the removed
                       TodayPrayersCard so users see how far away each
                       reminder is at a glance. */}
                  {until && (
                    <View style={styles.tpaCardUntilPill}>
                      <Text style={styles.tpaCardUntil}>{until}</Text>
                    </View>
                  )}
                  <Text style={styles.tpaCardChevron}>›</Text>
                </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* TodayPrayersCard removed per the earlier ask — its "in 4h"
            countdown semantics now live inline on each TPA row above. */}

        {/* ── v62: Upcoming Reminders feed ─────────────────────────────
             Unified, time-sorted list of next walk / jog / sadhana /
             japa / ekadashi / sandhya / festival / shopping.  Sits
             right below Today's Planned Activities. */}
        <View style={styles.remBox}>
          <Text style={styles.remTitle}>🔔  Upcoming Reminders</Text>
          {nextReminders.length === 0 ? (
            <Text style={styles.remEmpty}>
              Nothing scheduled yet. Add a routine in the Plan tab or set a festival reminder
              under Panchang to see it here.
            </Text>
          ) : (
            nextReminders.map(r => (
              <TouchableOpacity
                key={r.id}
                style={styles.remCard}
                onPress={() => r.tab && navigation?.navigate?.(r.tab)}
                activeOpacity={0.7}
              >
                <View style={[styles.remIconBubble, { backgroundColor: `${r.accent}22`, borderColor: `${r.accent}55` }]}>
                  <Text style={styles.remIcon}>{r.icon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.remTitleText} numberOfLines={1}>{r.title}</Text>
                  <Text style={styles.remSub} numberOfLines={1}>{r.subtitle}</Text>
                </View>
                <View style={[styles.remPill, { borderColor: `${r.accent}66`, backgroundColor: `${r.accent}1A` }]}>
                  <Text style={[styles.remPillText, { color: r.accent }]}>{r.countdown}</Text>
                </View>
                <Text style={styles.remChevron}>›</Text>
              </TouchableOpacity>
            ))
          )}
        </View>

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

// Module-level dark `styles` object — kept so helper components outside
// DashboardScreen (rendered before we have palette in scope) still resolve.
// DashboardScreen itself SHADOWS this with a palette-aware set via useMemo,
// so its cards flip properly when the user toggles the theme.
const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  container: { flex: 1, backgroundColor: C.deep },
  scroll: { paddingBottom: 80 },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
    alignItems: 'center',
  },
  greeting: { fontSize: 26, color: C.cream, fontWeight: '600', marginBottom: 4 },
  tagline: { fontSize: 13, color: C.muted, marginBottom: 6 },

  // v49: small text brand replaces the animated logo on the Home tab.
  smallBrand: {
    fontSize: 22, color: C.cream, fontWeight: '800',
    letterSpacing: 3, marginBottom: 2,
    textShadowColor: '#FFB800', textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8,
  },
  smallTagline: {
    fontSize: 11, color: C.gold, fontStyle: 'italic',
    letterSpacing: 1, marginBottom: SPACING.sm,
  },
  // Caretaker line — personal, body+soul-sync promise, rotates with time-of-day
  personalLine: {
    fontSize: 13,
    color: C.gold,                    // palette-aware; darkens on light bg
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: 8,
    paddingHorizontal: SPACING.md,
    lineHeight: 18,
  },
  date: { fontSize: 12, color: C.gold, fontWeight: '500' },

  alarmBanner: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    backgroundColor: 'rgba(255, 140, 66, 0.15)',
    borderRadius: 12,
    padding: SPACING.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  alarmTitle: { fontSize: 14, color: C.cream, fontWeight: '600' },
  alarmDetail: { fontSize: 12, color: C.saffron, marginTop: 2 },
  alarmDismiss: { paddingHorizontal: SPACING.sm },

  todayFestCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(74, 222, 128, 0.1)',
    borderRadius: 12,
    padding: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  todayFestName: { fontSize: 18, color: C.cream, fontWeight: '700', marginTop: 4 },
  todayFestWish: { fontSize: 13, color: C.gold, marginTop: 4, textAlign: 'center', fontStyle: 'italic' },

  nextJapaCard: {
    marginHorizontal: SPACING.md,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    borderLeftWidth: 3,
    borderLeftColor: C.gold,
  },
  nextJapaLabel: {
    fontSize: 10,
    color: C.gold,
    letterSpacing: 2,
    fontWeight: '700',
    marginBottom: 4,
  },
  nextJapaRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  nextJapaName: { fontSize: 16, color: C.cream, fontWeight: '600', flex: 1 },
  nextJapaWhen: { fontSize: 13, color: C.saffron, fontWeight: '600' },
  nextJapaDetail: { fontSize: 11, color: C.muted, marginTop: 2 },

  // ── Big hero card for total prayer time (priority #1 for elderly users) ──
  sadhanaHero: {
    // v52: top/bottom margins normalised to match every other section
    // so the gaps on Home read as a single rhythm.
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.lg,
    backgroundColor: C.cardBg,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: C.gold,
    alignItems: 'center',
  },
  sadhanaHeroLabel: {
    fontSize: 14,           // v48: bumped from 13 for elderly readability
    color: C.muted,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  sadhanaHeroValue: {
    fontSize: 56,           // v48: bumped from 38 — hero number should be unmissable
    color: C.gold,
    fontWeight: '800',
    lineHeight: 60,
  },
  sadhanaHeroSource: {
    fontSize: 12,           // v48: bumped from 11
    color: C.muted,
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
    fontSize: 15,           // v48: bumped from 13
    color: C.cream,
    textAlign: 'center',
    marginTop: SPACING.sm,
    lineHeight: 20,
    fontWeight: '500',
  },
  // v48: storytelling line — short, warm narrative shown under the hero
  sadhanaHeroStory: {
    fontSize: 13,
    color: C.gold,
    textAlign: 'center',
    marginTop: 6,
    fontStyle: 'italic',
    fontWeight: '600',
  },

  heroOutOf: { fontSize: 20, color: C.muted, fontWeight: '600' },     // v48: 16 → 20

  // Hero horizontal bars — Body Health Score + Soul Depth Score
  heroBarsBlock: {
    alignSelf: 'stretch',
    marginTop: SPACING.md, marginBottom: 2,
  },
  heroBarRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  heroBarIcon: { fontSize: 14 },
  heroBarLabel: { flex: 1, fontSize: 12, color: C.cream, fontWeight: '600' },
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
  heroScorePillValue: { color: C.gold, fontSize: 20, fontWeight: '800', lineHeight: 22 },
  heroScorePillLabel: { color: C.muted, fontSize: 9, fontWeight: '700', letterSpacing: 0.6, marginTop: 2 },

  // 4-box health grid (Stress / Sleep / Heart / Lung)
  h4Grid: {
    flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm,
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
  },
  h4Box: {
    flexBasis: '48%', flexGrow: 1,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.sm,
    backgroundColor: C.cardBg, borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  h4Icon: { fontSize: 24, marginBottom: 4 },
  h4Value: { fontSize: 26, fontWeight: '800', lineHeight: 28 },
  h4Out: { fontSize: 12, color: C.muted, fontWeight: '500' },
  h4Label: { color: C.cream, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 2 },

  // Plan CTA — calm, restful card with gentle glow
  planCta: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    borderRadius: 14,
    backgroundColor: 'rgba(212,160,23,0.10)',
    borderWidth: 1, borderColor: C.gold,
  },
  // Soft gold halo behind the card (subtle)
  planCtaGlow: {
    position: 'absolute', top: -6, left: -6, right: -6, bottom: -6,
    borderRadius: 18,
    backgroundColor: C.gold,
    shadowColor: C.gold,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
  },
  planCtaIcon: { fontSize: 26, marginRight: 2 },
  planCtaTitle: {
    color: C.cream, fontSize: 14, fontWeight: '700',
    letterSpacing: 0.2,
  },
  planCtaSub: {
    color: C.muted, fontSize: 11, marginTop: 2, fontWeight: '500',
  },
  planCtaArrow: {
    color: C.gold, fontSize: 22, paddingHorizontal: 6, fontWeight: '700',
  },

  // ── Commitment Score box (visuals copied from SoulsyncScoreCard) ──
  cscBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.lg, borderRadius: 16,
    backgroundColor: C.cardBg,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.25)',
  },
  cscTitle: {
    fontSize: 13, color: C.muted, fontWeight: '700',
    letterSpacing: 1.5, textTransform: 'uppercase',
    textAlign: 'center', marginBottom: 4,
  },
  cscBigRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', marginTop: 6, marginBottom: SPACING.md },
  cscBigNumber: { fontSize: 56, fontWeight: '700', lineHeight: 60 },
  cscBigOutOf: { fontSize: 16, color: C.muted, marginLeft: 6, fontWeight: '500' },

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
    color: C.cream,
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
    color: C.cream, opacity: 0.55,
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
  vbtHint:  { color: C.muted, fontSize: 11, fontStyle: 'italic', marginBottom: SPACING.sm },
  vbtRow:   { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  vbtIcon:  { fontSize: 16, width: 24 },
  vbtLabel: { flex: 1, color: C.cream, fontSize: 12, fontWeight: '600' },
  vbtBefore:{ color: C.muted, fontSize: 13, width: 44, textAlign: 'right' },
  vbtArrow: { color: C.muted, fontSize: 12, paddingHorizontal: 4 },
  vbtAfter: { color: C.cream, fontSize: 13, fontWeight: '700', width: 44, textAlign: 'right' },
  vbtDelta: { fontSize: 11, fontWeight: '700', width: 70, textAlign: 'right' },
  vbtFooter:{ color: C.cream, fontSize: 11, fontStyle: 'italic', marginTop: SPACING.sm },

  // Today's Planned Activities
  tpaBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: C.cardBg, borderWidth: 1, borderColor: C.border,
  },
  tpaTitle: { color: C.cream, fontSize: 13, fontWeight: '800', marginBottom: SPACING.sm },
  tpaSummary: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10, paddingVertical: 10, marginBottom: SPACING.sm },
  tpaSummaryCol: { flex: 1, alignItems: 'center' },
  tpaSummaryValue: { color: C.gold, fontSize: 18, fontWeight: '800' },
  tpaSummaryLabel: { color: C.muted, fontSize: 9, fontWeight: '600', textAlign: 'center', marginTop: 2 },
  tpaEmpty: { color: C.muted, fontSize: 12, fontStyle: 'italic', textAlign: 'center', padding: SPACING.sm },
  tpaRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.04)' },
  tpaStar: { fontSize: 16, width: 26 },
  tpaTime: { color: C.gold, fontSize: 12, fontWeight: '700', width: 54 },
  tpaName: { color: C.cream, fontSize: 13, fontWeight: '600' },
  tpaMeta: { color: C.muted, fontSize: 11, marginTop: 1 },
  tpaBell: { fontSize: 12, color: C.gold, paddingHorizontal: 4 },

  // ── v47: redesigned tappable card per planned activity ──
  tpaCard: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 10, paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,184,0,0.18)',
    marginTop: 8,
    minHeight: 60,
  },
  tpaCardIcon:    { fontSize: 26, marginRight: 12, width: 32 },
  tpaCardName:    { color: C.cream, fontSize: 15, fontWeight: '700' },
  tpaCardDone:    { color: '#FFB800', fontSize: 14 },
  tpaCardMeta:    { color: C.muted, fontSize: 12, marginTop: 2 },
  tpaCardTimePill: {
    backgroundColor: 'rgba(255,184,0,0.15)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    marginLeft: 8,
  },
  tpaCardTime:    { color: C.gold, fontSize: 13, fontWeight: '800' },
  tpaCardChevron: { color: C.gold, fontSize: 22, marginLeft: 8, fontWeight: '700' },

  // v62: Upcoming Reminders feed (Home tab, below Today's Planned Activities)
  remBox: {
    marginHorizontal: SPACING.md, marginTop: SPACING.md, padding: SPACING.md,
    borderRadius: 16, backgroundColor: C.cardBg,
    borderWidth: 1, borderColor: 'rgba(127,232,200,0.25)',
  },
  remTitle: {
    color: C.cream, fontSize: 14, fontWeight: '800',
    letterSpacing: 0.5, marginBottom: SPACING.sm,
  },
  remEmpty: {
    color: C.muted, fontSize: 12, fontStyle: 'italic',
    textAlign: 'center', padding: SPACING.sm, lineHeight: 18,
  },
  remCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  remIconBubble: {
    width: 40, height: 40, borderRadius: 20,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
  },
  remIcon: { fontSize: 20 },
  remTitleText: { color: C.cream, fontSize: 15, fontWeight: '700' },
  remSub: { color: C.muted, fontSize: 12, marginTop: 2 },
  remPill: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    borderWidth: 1,
  },
  remPillText: { fontSize: 12, fontWeight: '800' },
  remChevron: { color: C.muted, fontSize: 22, marginLeft: 4, fontWeight: '700' },

  // v49: "in 4h" countdown pill on each Today's Plan row (replaces TodayPrayersCard)
  tpaCardUntilPill: {
    backgroundColor: 'rgba(127, 232, 200, 0.18)',
    borderRadius: 12, paddingHorizontal: 10, paddingVertical: 4,
    marginLeft: 6,
  },
  tpaCardUntil: { color: '#7FE8C8', fontSize: 12, fontWeight: '800' },

  // v49: "Know more about your body Vitals?" collapsible toggle
  vitalsToggle: {
    flexDirection: 'row', alignItems: 'center',
    // v52: marginBottom bumped from SPACING.sm → SPACING.md to match
    // the gap every other Home-tab section uses (h4Grid, cscBox, tpaBox).
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    paddingVertical: SPACING.md, paddingHorizontal: SPACING.md,
    backgroundColor: C.cardBg, borderRadius: 14,
    borderWidth: 1, borderColor: 'rgba(255, 184, 0, 0.35)',
    minHeight: 64,
  },
  vitalsToggleIcon: { fontSize: 26, marginRight: 12, width: 32 },
  vitalsToggleTitle: { fontSize: 15, color: C.cream, fontWeight: '700' },
  vitalsToggleSub:   { fontSize: 11, color: C.muted, marginTop: 2 },
  vitalsToggleChev:  { fontSize: 18, color: C.gold, fontWeight: '800', paddingHorizontal: 4 },

  // Commitment box (legacy — kept for compatibility but unused)
  commitmentBox: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 16,
    backgroundColor: C.cardBg, borderWidth: 2, borderColor: C.gold,
  },
  commitmentLabel: { color: C.muted, fontSize: 11, fontWeight: '800', letterSpacing: 1.5, marginBottom: 6 },
  commitmentBig: { color: C.gold, fontSize: 38, fontWeight: '800', lineHeight: 40 },
  commitmentOut: { color: C.muted, fontSize: 14, fontWeight: '500' },
  commitmentTotalTime: { color: C.cream, fontSize: 12, marginTop: 2, fontStyle: 'italic' },
  commitmentSplit: {
    flexDirection: 'row', marginTop: SPACING.md,
    backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: 10,
    paddingVertical: 10, paddingHorizontal: 8,
  },
  commitmentSplitDivider: { width: 1, backgroundColor: 'rgba(212,160,23,0.20)' },
  commitmentSubLabel: { color: C.muted, fontSize: 10, fontWeight: '700', letterSpacing: 0.8, marginBottom: 2 },
  commitmentSubValue: { color: C.cream, fontSize: 22, fontWeight: '800', lineHeight: 24 },
  commitmentSubOut: { color: C.muted, fontSize: 11, fontWeight: '500' },
  commitmentSubTime: { color: C.gold, fontSize: 10, fontWeight: '700', marginTop: 2 },

  // Sadhana motivational note
  sadhanaNote: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    padding: SPACING.md, borderRadius: 14,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderLeftWidth: 4, borderLeftColor: C.gold,
  },
  sadhanaNoteTitle: { color: C.gold, fontSize: 13, fontWeight: '800', marginBottom: 6 },
  sadhanaNoteBody:  { color: C.cream, fontSize: 13, lineHeight: 19 },
  sadhanaNoteBold:  { color: C.gold, fontWeight: '800' },

  // v51: short single-line "Body & Soul" message under the Plan CTA
  // v52: marginBottom normalised to SPACING.md for consistent gaps.
  shortNote: {
    marginHorizontal: SPACING.md, marginBottom: SPACING.md,
    paddingHorizontal: SPACING.md, paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(212,160,23,0.06)',
    borderLeftWidth: 3, borderLeftColor: C.gold,
  },
  shortNoteText: {
    color: C.cream, fontSize: 13, lineHeight: 18,
    fontStyle: 'italic',
  },
  shortNoteBold: { color: C.gold, fontWeight: '800', fontStyle: 'normal' },

  kpiCard: {
    flexDirection: 'row',
    marginHorizontal: SPACING.md,
    backgroundColor: C.cardBg,
    borderRadius: 14,
    paddingVertical: SPACING.md,
    marginBottom: SPACING.sm,
    borderWidth: 1,
    borderColor: 'rgba(212, 160, 23, 0.2)',
  },
  kpiCol: { flex: 1, alignItems: 'center', paddingHorizontal: SPACING.sm },
  kpiValue: { fontSize: 26, color: C.gold, fontWeight: '700' },
  kpiLabel: {
    fontSize: 11,
    color: C.cream,
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
  todayStripText: { fontSize: 12, color: C.saffron, fontWeight: '500', textAlign: 'center' },

  section: {
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    fontSize: 11,
    color: C.muted,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: SPACING.sm,
    textTransform: 'uppercase',
  },

  deityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.cardBg,
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
  deityRowName: { flex: 1, fontSize: 13, color: C.cream, fontWeight: '600' },
  deityRowMalas: { fontSize: 12, color: C.gold, fontWeight: '600' },
  deityBarTrack: {
    height: 6,
    backgroundColor: 'rgba(212, 160, 23, 0.12)',
    borderRadius: 3,
    overflow: 'hidden',
    marginTop: 4,
  },
  deityBarFill: { height: '100%', borderRadius: 3 },
  deityRowTime: { fontSize: 10, color: C.muted, marginTop: 4 },
  deityRowChevron: { fontSize: 22, color: C.gold, marginLeft: SPACING.sm, opacity: 0.7 },

  feedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  feedIcon: { fontSize: 18 },
  feedLabel: { fontSize: 13, color: C.cream, fontWeight: '500' },
  feedDetail: { fontSize: 11, color: C.muted, marginTop: 2 },
  feedWhen: { fontSize: 11, fontWeight: '600', marginLeft: SPACING.sm },

  quickStartGrid: { flexDirection: 'row', gap: SPACING.sm },
  deityCard: {
    flex: 1,
    backgroundColor: C.cardBg,
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
  deityCardName: { fontSize: 12, color: C.cream, fontWeight: '500' },
  deityCardMalas: { fontSize: 10, color: C.muted, marginTop: 2 },

  upcomingFest: {
    marginHorizontal: SPACING.md,
    backgroundColor: C.cardBg,
    borderRadius: 12,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  upcomingTopRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  upcomingLabel: { fontSize: 10, color: C.muted, letterSpacing: 1.5, fontWeight: '600' },
  upcomingName: { fontSize: 16, color: C.cream, fontWeight: '700', marginTop: 2 },
  upcomingDays: { fontSize: 12, color: C.gold, marginTop: 2 },
  upcomingDeity: { fontSize: 12, color: C.saffron, fontStyle: 'italic', marginBottom: SPACING.sm },
  checklistPreview: { gap: 4 },
  checklistItem: { flexDirection: 'row', alignItems: 'center' },
  checklistTag: { fontSize: 14, marginRight: SPACING.sm },
  checklistText: { fontSize: 12, color: C.cream },
  checklistMore: { fontSize: 11, color: C.muted, marginTop: 4, fontStyle: 'italic' },
});

// Static dark styles for helper components outside DashboardScreen — they
// render before we have palette in scope so keep them on the dark palette.
const styles = makeStyles(COLORS);
