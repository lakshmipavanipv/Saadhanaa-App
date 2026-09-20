/**
 * EldersDashboard — the Home tab under the "Easy to read" template.
 *
 * The other templates assume a reader who will decode a dense screen. This one
 * assumes nothing: every number is named in ordinary words, told what it means
 * for the person reading it, and given room to breathe.
 *
 * WHAT IS DELIBERATELY DIFFERENT
 *
 *   • One idea per card, four cards, nothing else. The default Home carries a
 *     composite score, a body/soul split, a streak, planned activities and a
 *     nudge. Density is a cost paid by the reader, and it is paid hardest by
 *     the reader this template is for.
 *   • Every number is followed by a sentence saying what it means. "Heart 78"
 *     tells you nothing unless you already know the scale.
 *   • No jargon at all. Not HRV, not SpO2, not "autonomic". "How settled your
 *     body is" and "oxygen in your blood" say the same things.
 *   • Status is never colour alone. Each card states its verdict in a word, so
 *     it survives colour blindness and a dim screen.
 *   • Nothing is a number when it is not measured. It says, in a full
 *     sentence, what to do to get one.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../../ThemeContext';
import { type Palette } from '../../theme';
import { useSadhana } from '../../context';
import { todayStr } from '../../utils';
import { computeHealthDetail, type HealthBoxDetail } from '../../soulsync/analytics/HealthScores';
import { japaMinutesOnDate } from '../../soulsync/analytics/JapaTime';
import { E, lh, eldersShapes } from './eldersKit';

interface Item {
  title: string;
  value: number | null;
  verdict: string;
  meaning: string;
  whenMissing: string;
}

/** Plain words for a 0-100 score. Never "fair" or "moderate" — both are vague. */
const verdictFor = (v: number | null): string =>
  v == null ? '' : v >= 80 ? 'Very good' : v >= 60 ? 'Good' : v >= 40 ? 'A little low' : 'Low';

export const EldersDashboard: React.FC<{ navigation?: any }> = () => {
  const { palette } = useTheme();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const { userProfile, history } = useSadhana();

  const [detail, setDetail] = useState<HealthBoxDetail | null>(null);
  const [practiceMin, setPracticeMin] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const tick = async () => {
      try {
        const d = await computeHealthDetail({ dob: userProfile?.dob, gender: userProfile?.gender });
        if (alive) setDetail(d);
      } catch { /* cards show their own message */ }
      try {
        const t = await japaMinutesOnDate(todayStr());
        if (alive) setPracticeMin(t.minutes);
      } catch { /* same */ }
    };
    void tick();
    const id = setInterval(tick, 60_000);
    return () => { alive = false; clearInterval(id); };
  }, [userProfile?.dob, userProfile?.gender, history]);

  const items: Item[] = useMemo(() => {
    if (!detail) return [];
    return [
      {
        title: 'Your heart',
        value: detail.heart.value,
        verdict: verdictFor(detail.heart.value),
        meaning: 'This is how hard your heart is working while you rest. A higher number means it is working calmly.',
        whenMissing: 'Wear the ring for about ten minutes and this will fill in on its own.',
      },
      {
        title: 'Oxygen in your blood',
        value: detail.lung.value,
        verdict: verdictFor(detail.lung.value),
        meaning: 'This is how much oxygen your blood is carrying. A higher number is better.',
        whenMissing: 'The ring has not taken this reading today. Wearing it a little longer usually does it.',
      },
      {
        title: 'How settled you are',
        value: detail.stress.value,
        verdict: verdictFor(detail.stress.value),
        meaning: 'This compares today with your own usual self. A higher number means calmer than usual, not calmer than other people.',
        whenMissing: 'This needs a heart reading first, so it will appear once the one above does.',
      },
      {
        title: 'Last night’s sleep',
        value: detail.sleep.value,
        verdict: verdictFor(detail.sleep.value),
        meaning: 'This counts how long you slept and how settled the sleep was.',
        whenMissing: 'No sleep was recorded last night. The ring needs to be worn while you sleep.',
      },
    ];
  }, [detail]);

  const greeting = (() => {
    const h = new Date().getHours();
    const name = userProfile?.name ? `, ${userProfile.name.split(' ')[0]}` : '';
    if (h < 12) return `Good morning${name}`;
    if (h < 17) return `Good afternoon${name}`;
    return `Good evening${name}`;
  })();

  const measured = items.filter((i) => i.value != null).length;

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.greeting}>{greeting}</Text>
      <Text style={s.date}>
        {new Date().toLocaleDateString(undefined, {
          weekday: 'long', day: 'numeric', month: 'long',
        })}
      </Text>

      {/* One honest sentence about the whole screen, before the numbers. */}
      <View style={s.summaryCard}>
        <Text style={s.summaryText}>
          {measured === 0
            ? 'Your ring has not sent any readings today yet. Put it on and they will appear here by themselves.'
            : measured < items.length
              ? `Your ring has sent ${measured} of ${items.length} readings so far today. The rest will fill in while you wear it.`
              : 'Your ring has sent all of today’s readings. Everything below is from today.'}
        </Text>
      </View>

      {/* Practice first: it is the thing the reader chose to do, rather than
          something measured about them. */}
      <View style={s.card}>
        <Text style={s.cardTitle}>Your practice today</Text>
        {practiceMin != null ? (
          <>
            <Text style={s.hero}>{practiceMin}</Text>
            <Text style={s.heroUnit}>minutes</Text>
          </>
        ) : (
          <Text style={s.missing}>
            No practice has been timed today. Open the Japa tab and start counting
            beads — the time is measured for you, and there is nothing to start or
            stop.
          </Text>
        )}
        {practiceMin != null && (
          <Text style={s.meaning}>
            This is measured from your beads: the clock runs while you are
            counting and stops when you put the mala down.
          </Text>
        )}
      </View>

      {items.map((i) => (
        <View key={i.title} style={s.card}>
          <Text style={s.cardTitle}>{i.title}</Text>
          {i.value != null ? (
            <>
              <View style={s.figureRow}>
                <Text style={s.figure}>{i.value}</Text>
                <Text style={s.outOf}>out of 100</Text>
              </View>
              {/* The verdict is a word, not a colour, so it still works for a
                  reader who cannot separate red from green. */}
              <Text style={s.verdict}>{i.verdict}</Text>
              <Text style={s.meaning}>{i.meaning}</Text>
            </>
          ) : (
            <Text style={s.missing}>{i.whenMissing}</Text>
          )}
        </View>
      ))}

      <Text style={s.footnote}>
        Nothing on this page is guessed. If the ring has not measured something,
        it says so instead of showing a number.
      </Text>
    </ScrollView>
  );
};

const makeStyles = (C: Palette) => StyleSheet.create({
  ...eldersShapes,
  screen: { ...eldersShapes.screen, backgroundColor: C.deep },

  greeting: { color: C.cream, fontSize: E.heading, fontWeight: '700', lineHeight: lh(E.heading) },
  date: { color: C.muted, fontSize: E.body, marginTop: 4, marginBottom: E.gap, lineHeight: lh(E.body) },

  summaryCard: {
    ...eldersShapes.card,
    backgroundColor: C.cardBg,
    borderColor: C.gold,
  },
  summaryText: { color: C.cream, fontSize: E.body, lineHeight: lh(E.body) },

  card: { ...eldersShapes.card, backgroundColor: C.cardBg, borderColor: C.border },
  cardTitle: { color: C.gold, fontSize: E.body, fontWeight: '700', lineHeight: lh(E.body) },

  hero: { color: C.cream, fontSize: E.hero, fontWeight: '700', marginTop: 6 },
  heroUnit: { color: C.muted, fontSize: E.body, lineHeight: lh(E.body) },

  figureRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginTop: 8 },
  figure: { color: C.cream, fontSize: E.figure, fontWeight: '700' },
  outOf: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small) },

  verdict: { color: C.cream, fontSize: E.body, fontWeight: '700', marginTop: 6, lineHeight: lh(E.body) },
  meaning: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small), marginTop: 10 },
  missing: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small), marginTop: 10 },

  footnote: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small), marginTop: 8 },
});
