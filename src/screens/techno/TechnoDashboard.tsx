/**
 * TechnoDashboard — the Home tab under the Techno template.
 *
 * WHAT THIS IS FOR
 *
 * The default Home speaks devotionally: a greeting, a composite score, a
 * gentle nudge. Techno shows the same day as a readout — but a readout a
 * person can actually read.
 *
 * WHAT WENT WRONG THE FIRST TIME
 *
 * The first version was monospace text on black, every value a bare number
 * with a jargon label, no shape or colour to look at. It was honest and
 * unpleasant, which is a poor trade: an interface nobody enjoys opening does
 * not get opened, and then its honesty is worth nothing. Austerity is not the
 * same thing as clarity.
 *
 * SO THE RULES HERE ARE
 *
 *   1. Something to look at. A glowing arc carries the headline, cards have
 *      depth, each vital owns an accent colour that stays the same everywhere.
 *   2. Plain words under every number. "Heart" and "how hard your heart is
 *      working at rest", not "CARDIAC" alone. A reader should never need to
 *      know what RMSSD is.
 *   3. Nothing invented. A metric with no reading says so in words, and says
 *      what to do about it. The headline is an average of what was actually
 *      measured, and states how many of the four that was — a number built on
 *      one reading must not look like one built on four.
 *
 * Every figure comes from the same modules the other templates use —
 * HealthScoreModel, JapaTime — so a different template never means different
 * arithmetic.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';
import { useTheme } from '../../ThemeContext';
import { SPACING, type Palette } from '../../theme';
import { useSadhana } from '../../context';
import { todayStr } from '../../utils';
import { computeHealthDetail, type HealthBoxDetail } from '../../soulsync/analytics/HealthScores';
import { japaMinutesOnDate } from '../../soulsync/analytics/JapaTime';
import { routineRepo, type RoutineItem } from '../../services/routineRepo';

/** One accent per vital, reused wherever that vital appears. */
const ACCENT = {
  heart: '#FF4D7D',
  lung: '#38E1FF',
  stress: '#9B8CFF',
  sleep: '#3DF0C0',
  practice: '#FFC24B',
};

interface Card {
  key: keyof typeof ACCENT;
  title: string;
  plain: string;
  value: number | null;
  word: string;
  missing: string;
}

export const TechnoDashboard: React.FC<{ navigation?: any }> = () => {
  const { palette } = useTheme();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const { userProfile, history } = useSadhana();

  const [detail, setDetail] = useState<HealthBoxDetail | null>(null);
  const [practiceMin, setPracticeMin] = useState<number | null>(null);
  /**
   * Today's committed practices, with the times they are set for.
   *
   * The Techno home showed what the body HAD done and nothing about what the
   * day still asks for, so the one screen opened first in the morning had
   * nothing to say about the morning. `routineRepo.today()` already filters to
   * the current weekday, so a Tuesday-only sadhana is not listed on a
   * Wednesday.
   */
  const [reminders, setReminders] = useState<RoutineItem[]>([]);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await computeHealthDetail({ dob: userProfile?.dob, gender: userProfile?.gender });
        if (alive) setDetail(d);
      } catch { /* cards show their own empty state */ }
      try {
        const t = await japaMinutesOnDate(todayStr());
        if (alive) setPracticeMin(t.minutes);
      } catch { /* same */ }
      try {
        const r = await routineRepo.today();
        if (alive) setReminders(r);
      } catch { /* the block hides itself */ }
    };
    void tick();
    const id = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [userProfile?.dob, userProfile?.gender, history]);

  const cards: Card[] = useMemo(() => {
    if (!detail) return [];
    return [
      {
        key: 'heart', title: 'Heart',
        plain: 'How hard your heart is working at rest',
        value: detail.heart.value, word: detail.words.heart,
        missing: 'Wear the ring for a few minutes to get a reading',
      },
      {
        key: 'lung', title: 'Oxygen',
        plain: 'How much oxygen your blood is carrying',
        value: detail.lung.value, word: detail.words.lung,
        missing: 'No oxygen reading yet today',
      },
      {
        key: 'stress', title: 'Calm',
        plain: 'How settled your body is, against your own normal',
        value: detail.stress.value, word: detail.words.stress,
        missing: 'Needs a heart-rate reading first',
      },
      {
        key: 'sleep', title: 'Sleep',
        plain: 'How well you slept last night',
        value: detail.sleep.value, word: detail.words.sleep,
        missing: 'No sleep recorded last night',
      },
    ];
  }, [detail]);

  const measured = cards.filter((c) => c.value != null);
  // Averaged over what was actually measured — never padded with zeros for the
  // channels that said nothing, which would read as "you are unwell" when it
  // means "the ring was in a drawer".
  const overall = measured.length
    ? Math.round(measured.reduce((a, c) => a + (c.value as number), 0) / measured.length)
    : null;

  const headline = overall == null ? 'No readings yet'
    : overall >= 80 ? 'Strong day'
      : overall >= 60 ? 'Steady day'
        : overall >= 40 ? 'Running low'
          : 'Worth resting';

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.kicker}>TODAY AT A GLANCE</Text>

      {/* ── Headline arc ─────────────────────────────────────────── */}
      <View style={s.hero}>
        <Arc value={overall} palette={palette} />
        <View style={s.heroText}>
          <Text style={s.heroWord}>{headline}</Text>
          <Text style={s.heroSub}>
            {overall == null
              ? 'Nothing measured yet today. Put the ring on and this fills in.'
              : `Average of the ${measured.length} reading${measured.length === 1 ? '' : 's'} taken today${
                  measured.length < 4 ? `, out of ${cards.length}` : ''
                }.`}
          </Text>
        </View>
      </View>

      {/* ── Vitals ───────────────────────────────────────────────── */}
      <View style={s.grid}>
        {cards.map((c) => {
          const accent = ACCENT[c.key];
          const has = c.value != null;
          return (
            <View key={c.key} style={[s.card, has && { borderColor: accent + '55' }]}>
              <View style={[s.cardGlow, { backgroundColor: accent, opacity: has ? 0.16 : 0.05 }]} />
              <Text style={[s.cardTitle, { color: has ? accent : palette.muted }]}>{c.title}</Text>
              {has ? (
                <>
                  <View style={s.valueRow}>
                    <Text style={[s.value, { color: palette.cream }]}>{c.value}</Text>
                    <Text style={s.valueOf}>/100</Text>
                  </View>
                  <Text style={[s.word, { color: accent }]}>{c.word}</Text>
                </>
              ) : (
                <Text style={s.empty}>{c.missing}</Text>
              )}
              <Text style={s.plain}>{c.plain}</Text>
            </View>
          );
        })}
      </View>

      {/* ── Practice ─────────────────────────────────────────────── */}
      <View style={[s.wide, { borderColor: ACCENT.practice + '55' }]}>
        <View style={[s.cardGlow, { backgroundColor: ACCENT.practice, opacity: practiceMin != null ? 0.16 : 0.05 }]} />
        <Text style={[s.cardTitle, { color: ACCENT.practice }]}>Practice</Text>
        {practiceMin != null ? (
          <View style={s.valueRow}>
            <Text style={[s.value, { color: palette.cream }]}>{practiceMin}</Text>
            <Text style={s.valueOf}>minutes today</Text>
          </View>
        ) : (
          <Text style={s.empty}>Nothing timed today</Text>
        )}
        <Text style={s.plain}>
          {practiceMin != null
            ? 'Measured from the gaps between your beads. Pauses over two minutes are breaks and are not counted.'
            : 'Count beads on the ring or on screen and this fills in. The time comes from the beads, so there is no timer to start.'}
        </Text>
      </View>

      {/* ── Today's commitments ── */}
      {reminders.length > 0 && (
        <View style={[s.wide, { borderColor: ACCENT.practice + '3a', marginTop: 10 }]}>
          <View style={[s.cardGlow, { backgroundColor: ACCENT.practice, opacity: 0.12 }]} />
          <Text style={[s.cardTitle, { color: ACCENT.practice }]}>TODAY&apos;S PLAN</Text>
          {reminders.slice(0, 6).map((r) => (
            <View key={r.id} style={s.remRow}>
              <Text style={s.remTime}>{r.time ?? '—'}</Text>
              <Text style={s.remName} numberOfLines={1}>{r.name}</Text>
              <Text style={s.remGoal}>
                {r.goalUnit && r.goalUnit !== 'min' && r.goalValue
                  ? `${r.goalValue} ${r.goalUnit}`
                  : `${r.durationMin} min`}
              </Text>
            </View>
          ))}
          {reminders.length > 6 && (
            <Text style={s.plain}>and {reminders.length - 6} more in your plan</Text>
          )}
        </View>
      )}

      <Text style={s.footnote}>
        Every figure here is measured. Where the ring took no reading you see a
        note rather than a number, so a quiet day never looks like a bad one.
      </Text>
    </ScrollView>
  );
};

/** Headline arc. A three-quarter ring that fills with the score. */
const Arc: React.FC<{ value: number | null; palette: Palette }> = ({ value, palette }) => {
  const SIZE = 132;
  const R = 56;
  const C = 2 * Math.PI * R;
  const SWEEP = 0.75;                       // three-quarters of the circle
  const pct = (value ?? 0) / 100;
  const dash = C * SWEEP * pct;

  return (
    <Svg width={SIZE} height={SIZE}>
      <Defs>
        <LinearGradient id="arcFill" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0%" stopColor="#3DF0C0" />
          <Stop offset="60%" stopColor="#38E1FF" />
          <Stop offset="100%" stopColor="#9B8CFF" />
        </LinearGradient>
      </Defs>
      {/* Track */}
      <Circle
        cx={SIZE / 2} cy={SIZE / 2} r={R}
        stroke={palette.border} strokeWidth={10} fill="none"
        strokeDasharray={`${C * SWEEP} ${C}`}
        strokeLinecap="round"
        transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}
      />
      {/* Fill */}
      {value != null && (
        <Circle
          cx={SIZE / 2} cy={SIZE / 2} r={R}
          stroke="url(#arcFill)" strokeWidth={10} fill="none"
          strokeDasharray={`${dash} ${C}`}
          strokeLinecap="round"
          transform={`rotate(135 ${SIZE / 2} ${SIZE / 2})`}
        />
      )}
    </Svg>
  );
};

const makeStyles = (C: Palette) => StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.deep },
  // paddingRight clears the ⋮ menu, which floats over every screen at the top
  // right in every template — the templates change how a screen looks, never
  // where the app's own controls live.
  body: {
    padding: SPACING.md, paddingRight: SPACING.xl + SPACING.md,
    paddingTop: SPACING.xl + SPACING.lg, paddingBottom: 90,
  },

  kicker: {
    color: C.muted, fontSize: 10.5, fontWeight: '800',
    letterSpacing: 2.4, marginBottom: SPACING.md,
  },

  hero: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md, marginBottom: SPACING.lg },
  heroText: { flex: 1 },
  heroWord: { color: C.cream, fontSize: 26, fontWeight: '700', letterSpacing: -0.4 },
  heroSub: { color: C.muted, fontSize: 12.5, lineHeight: 18, marginTop: 6 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48.5%', minHeight: 132, overflow: 'hidden',
    backgroundColor: C.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    padding: SPACING.md,
  },
  wide: {
    width: '100%', overflow: 'hidden', marginTop: 10,
    backgroundColor: C.cardBg, borderRadius: 18,
    borderWidth: 1, borderColor: C.border,
    padding: SPACING.md,
  },
  // A soft bloom behind the top-left of each card, which is what stops these
  // reading as plain boxes without resorting to a heavy gradient.
  cardGlow: {
    position: 'absolute', top: -46, left: -30,
    width: 120, height: 120, borderRadius: 60,
  },

  cardTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 1.4 },
  valueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 8 },
  value: { fontSize: 34, fontWeight: '700', letterSpacing: -1 },
  valueOf: { color: C.muted, fontSize: 11.5, fontWeight: '600' },
  word: { fontSize: 12, fontWeight: '700', marginTop: 2, textTransform: 'capitalize' },
  empty: { color: C.muted, fontSize: 12, lineHeight: 17, marginTop: 10 },
  plain: { color: C.muted, fontSize: 10.5, lineHeight: 15, marginTop: 'auto', paddingTop: 10 },

  remRow: {
    flexDirection: 'row', alignItems: 'center', gap: SPACING.sm,
    paddingVertical: 7, borderTopWidth: 1, borderColor: C.border,
  },
  remTime: { color: C.gold, fontSize: 12, fontWeight: '800', width: 52 },
  remName: { color: C.cream, fontSize: 12.5, flex: 1 },
  remGoal: { color: C.muted, fontSize: 11, fontWeight: '600' },

  footnote: { color: C.muted, fontSize: 10.5, lineHeight: 16, marginTop: SPACING.lg },
});
