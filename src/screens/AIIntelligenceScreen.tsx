/**
 * AIIntelligenceScreen — what your numbers mean, in plain words.
 *
 * The drawer's "AI Intelligence" entry used to drop the user on the History
 * tab next to an insights card. This is the real destination.
 *
 * Two halves, deliberately:
 *
 *   1. Generated insight (AIInsightsCard) — the narrative pass over the whole
 *      snapshot, which needs the model and falls back to a local summary.
 *   2. Metric explainers — written here from the stored numbers, with no
 *      model involved. A layman asking "what is HRV and what do I do about
 *      mine?" should get an answer even offline, and an explanation that only
 *      appears when a server responds is not an explanation you can rely on.
 *
 * Every explainer states what the metric is, why it matters, and one concrete
 * action. Where a reading is missing it says so rather than filling the gap —
 * an invented number in a health app is worse than an empty one.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl } from 'react-native';
import { COLORS, SPACING, FONT_SIZES } from '../theme';
import { useTheme } from '../ThemeContext';
import { useSadhana } from '../context';
import { AIInsightsCard } from '../soulsync/components/AIInsightsCard';
import { vitalsRepo } from '../soulsync/db/vitalsRepo';

const DAY_MS = 86_400_000;

interface Explainer {
  icon: string;
  name: string;
  reading: string;
  /** Plain-language reading of where this number sits. */
  verdict: string;
  what: string;
  why: string;
  action: string;
  tone: 'good' | 'watch' | 'none';
}

/** Mean of a metric over the last `days`, or null when nothing is stored. */
async function meanOf(metric: 'hr' | 'hrv' | 'spo2' | 'stress', days: number): Promise<number | null> {
  try {
    const now = Date.now();
    const rows = await vitalsRepo.range(metric, now - days * DAY_MS, now);
    if (!rows.length) return null;
    return rows.reduce((s, r) => s + r.value, 0) / rows.length;
  } catch {
    return null;
  }
}

function hrExplainer(v: number | null): Explainer {
  const tone: Explainer['tone'] = v == null ? 'none' : v <= 75 ? 'good' : v <= 90 ? 'watch' : 'watch';
  return {
    icon: '❤️',
    name: 'Resting heart rate',
    reading: v == null ? 'No readings yet' : `${Math.round(v)} bpm average`,
    verdict:
      v == null ? 'Wear the ring for a few hours and this fills in.'
        : v <= 60 ? 'Low — typical of a well-rested or well-trained body.'
          : v <= 75 ? 'Comfortably in the usual range.'
            : v <= 90 ? 'A little high for rest. Often stress, poor sleep, or caffeine.'
              : 'Higher than usual for rest, worth paying attention to.',
    what: 'How many times your heart beats per minute when you are still.',
    why: 'It is the cheapest signal your body gives. It rises before you feel run down — from poor sleep, illness coming on, dehydration or stress — often a day before you notice anything.',
    action:
      v == null ? 'Wear the ring through a quiet hour so it can catch you at rest.'
        : v > 80 ? 'Check tonight against a night you slept well. If it stays high across several rested days, that is worth a doctor mentioning.'
          : 'Nothing to change. Watch the trend rather than any single reading.',
    tone,
  };
}

function hrvExplainer(v: number | null): Explainer {
  const tone: Explainer['tone'] = v == null ? 'none' : v >= 40 ? 'good' : 'watch';
  return {
    icon: '〰️',
    name: 'HRV',
    reading: v == null ? 'No readings yet' : `${Math.round(v)} ms average`,
    verdict:
      v == null ? 'The ring records this on its own schedule — give it a day.'
        : v >= 60 ? 'Strong. Your nervous system is recovering well.'
          : v >= 40 ? 'Reasonable for most adults.'
            : v >= 25 ? 'On the low side — often stress or short sleep.'
              : 'Low. Usually means your body has not recovered.',
    what: 'The tiny variation in the gap between heartbeats. Counter-intuitively, more variation is better.',
    why: 'A relaxed body varies its rhythm freely; a stressed one beats like a metronome. It responds to sleep, alcohol, illness and stress faster than almost anything else you can measure.',
    action:
      v == null ? 'No action — it needs a day or two of wear.'
        : v < 40 ? 'Slow breathing moves this more than anything: six breaths a minute for five minutes. Your japa practice does the same thing if the pace is unhurried.'
          : 'Keep the sleep and practice pattern you already have — it is working.',
    tone,
  };
}

function spo2Explainer(v: number | null): Explainer {
  const tone: Explainer['tone'] = v == null ? 'none' : v >= 95 ? 'good' : 'watch';
  return {
    icon: '🫁',
    name: 'Blood oxygen',
    reading: v == null ? 'No readings yet' : `${v.toFixed(0)}%`,
    verdict:
      v == null ? 'Fills in once the ring takes a reading.'
        : v >= 95 ? 'Normal.'
          : v >= 92 ? 'Slightly low. Often a loose ring or a cold finger rather than your lungs.'
            : 'Low. Re-check with the ring snug before drawing any conclusion.',
    what: 'The percentage of your red blood cells carrying oxygen.',
    why: 'It should sit close to 100% and barely move. Sustained dips can point to breathing problems during sleep.',
    action:
      v == null ? 'Wear the ring snugly — a loose fit is the usual reason this stays blank.'
        : v < 92 ? 'Take a second reading with the ring firmly on. If it stays below 92% at rest, mention it to a clinician.'
          : 'Nothing needed.',
    tone,
  };
}

function stressExplainer(v: number | null): Explainer {
  const tone: Explainer['tone'] = v == null ? 'none' : v <= 40 ? 'good' : 'watch';
  return {
    icon: '🧠',
    name: 'Stress',
    reading: v == null ? 'No readings yet' : `${Math.round(v)} / 100`,
    verdict:
      v == null ? 'The ring reports this once it has measured you.'
        : v <= 25 ? 'Calm.'
          : v <= 40 ? 'Settled, with normal daily ups and downs.'
            : v <= 60 ? 'Activated more often than not.'
              : 'High. Your body is spending a lot of the day on alert.',
    what: 'The ring reads this from your heartbeat rhythm. Lower means rest-and-digest; higher means alert.',
    why: 'A number that stays high day after day costs you sleep quality and recovery, even when you do not feel especially stressed.',
    action:
      v == null ? 'No action yet.'
        : v > 50 ? 'This is the metric japa moves fastest. Ten unhurried minutes usually shows up as a visible drop within the hour — worth watching once to see it happen.'
          : 'Your current routine is holding this where it should be.',
    tone,
  };
}

export const AIIntelligenceScreen: React.FC<{ navigation?: any }> = ({ navigation }) => {
  const { palette } = useTheme();
  const { userProfile } = useSadhana();
  const styles = useMemo(() => makeStyles(palette), [palette]);

  const [explainers, setExplainers] = useState<Explainer[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [hr, hrv, spo2, stress] = await Promise.all([
      meanOf('hr', 7), meanOf('hrv', 7), meanOf('spo2', 7), meanOf('stress', 7),
    ]);
    setExplainers([
      hrExplainer(hr),
      hrvExplainer(hrv),
      spo2Explainer(spo2),
      stressExplainer(stress),
    ]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const measured = explainers.filter((e) => e.tone !== 'none').length;

  return (
    <View style={[styles.screen, { backgroundColor: palette.deep }]}>
      <View style={styles.header}>
        <Text style={styles.title}>🤖  AI Intelligence</Text>
        <Text style={styles.subtitle}>What your numbers mean, and what to do about them</Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.gold} />
        }
      >
        {/* Narrative pass over the full snapshot. */}
        <AIInsightsCard userName={userProfile?.name} mode="today" />

        <Text style={styles.sectionTitle}>Your metrics explained</Text>
        <Text style={styles.sectionNote}>
          {measured === 0
            ? 'Nothing measured in the last seven days yet. Wear the ring and these fill in on their own.'
            : `Based on your last 7 days — ${measured} of ${explainers.length} metrics have readings.`}
        </Text>

        {explainers.map((e) => (
          <View key={e.name} style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardIcon}>{e.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{e.name}</Text>
                <Text
                  style={[
                    styles.cardReading,
                    {
                      color: e.tone === 'good' ? '#3ddc84'
                        : e.tone === 'watch' ? '#F0D08A'
                          : palette.muted,
                    },
                  ]}
                >
                  {e.reading}
                </Text>
              </View>
            </View>

            <Text style={styles.verdict}>{e.verdict}</Text>

            <Text style={styles.label}>What it is</Text>
            <Text style={styles.para}>{e.what}</Text>

            <Text style={styles.label}>Why it matters</Text>
            <Text style={styles.para}>{e.why}</Text>

            <Text style={styles.label}>What you can do</Text>
            <Text style={[styles.para, styles.action]}>{e.action}</Text>
          </View>
        ))}

        <Text style={styles.disclaimer}>
          These are wellbeing observations from a consumer ring, not medical advice.
          If something here worries you, or a reading stays unusual for days, speak to a clinician.
        </Text>
      </ScrollView>
    </View>
  );
};

const makeStyles = (C: typeof COLORS) => StyleSheet.create({
  screen: { flex: 1 },
  header: { paddingHorizontal: SPACING.md, paddingTop: SPACING.lg, paddingBottom: SPACING.sm },
  title: { color: C.cream, fontSize: FONT_SIZES.xl, fontWeight: '800' },
  subtitle: { color: C.muted, fontSize: 12, marginTop: 4 },
  body: { paddingHorizontal: SPACING.md, paddingBottom: 100 },
  sectionTitle: {
    color: C.cream, fontSize: 15, fontWeight: '800',
    marginTop: SPACING.lg, marginBottom: 4,
  },
  sectionNote: { color: C.muted, fontSize: 12, marginBottom: SPACING.md, lineHeight: 17 },
  card: {
    backgroundColor: C.cardBg, borderRadius: 16,
    borderWidth: 1, borderColor: C.border,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  cardHead: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  cardIcon: { fontSize: 24, marginRight: 10 },
  cardName: { color: C.cream, fontSize: 15, fontWeight: '700' },
  cardReading: { fontSize: 13, fontWeight: '700', marginTop: 2 },
  verdict: {
    color: C.cream, fontSize: 13, lineHeight: 19,
    marginBottom: 12, fontStyle: 'italic',
  },
  label: {
    color: C.muted, fontSize: 10, fontWeight: '700',
    letterSpacing: 1, textTransform: 'uppercase', marginTop: 8, marginBottom: 3,
  },
  para: { color: C.cream, fontSize: 13, lineHeight: 19, opacity: 0.92 },
  action: { color: C.gold, opacity: 1 },
  disclaimer: {
    color: C.muted, fontSize: 11, lineHeight: 17,
    marginTop: SPACING.sm, textAlign: 'center', paddingHorizontal: SPACING.sm,
  },
});
