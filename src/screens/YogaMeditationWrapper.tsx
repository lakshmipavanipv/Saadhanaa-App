/**
 * YogaMeditationWrapper — one tab, one header, two cards.
 *
 * WHAT THIS REPLACES
 *
 * A segmented bar at the top flipping between two entire screens. That made
 * Yoga and Meditation two separate places sharing a tab button, when they are
 * two practices of one kind — exactly as Walk and Run are on Exercise, where
 * they are two cards on one screen and nothing has to be switched to see both.
 *
 * It also meant half the tab was always hidden: to know whether you had
 * meditated you had to leave the yoga view, and neither figure could be read
 * against the other.
 *
 * So the segmented bar is gone. The header says "Yoga & Meditation", both
 * cards are on the screen, and they are the Exercise tab's card component with
 * the Exercise tab's layout around them.
 *
 * WHERE THE CATALOGUES WENT
 *
 * The pose and technique libraries, the timers and the detail sheets still
 * live in YogaScreen and MeditationScreen, reached from each card's Details.
 * They are screens' worth of content and do not belong on a summary tab; what
 * belongs here is what Exercise shows — how much, against what target, over
 * what window.
 */

import React, { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../ThemeContext';
import { SPACING } from '../theme';
import { PracticeHeader } from '../components/PracticeHeader';
import { SoulPracticeBox } from '../components/SoulPracticeBox';
import { SessionDepthReport } from '../soulsync/components/SessionDepthReport';
import { RangeBar } from './health/RangeBar';
import { useSoulsyncSession } from '../soulsync/hooks/useSoulsyncSession';
import { exerciseRepo } from '../services/exerciseRepo';
import { soulActivityRepo } from '../services/soulActivityRepo';
import { todayStr } from '../utils';

interface Totals { today: number; todayCount: number; ever: number; everCount: number }
const ZERO: Totals = { today: 0, todayCount: 0, ever: 0, everCount: 0 };

export const YogaMeditationWrapper: React.FC<any> = ({ navigation }) => {
  const { palette } = useTheme();

  /*
   * One session hook for the tab, shared by both cards.
   *
   * Each card's Soul Sync bar drives it, and whichever card starts it stamps
   * the sitting with its own practice — which is why the bar sits inside the
   * cards rather than once above them as it does on Exercise. Everything on
   * Exercise is exercise; here a sitting is either yoga or meditation, and a
   * bar floating above both would have to guess.
   */
  const soulsync = useSoulsyncSession();

  const [yoga, setYoga] = useState<Totals>(ZERO);
  const [med, setMed] = useState<Totals>(ZERO);
  const [epoch, setEpoch] = useState(0);

  const load = useCallback(() => {
    let alive = true;
    void (async () => {
      const today = todayStr();
      const [ex, soul] = await Promise.all([
        exerciseRepo.list().catch(() => []),
        soulActivityRepo.list().catch(() => []),
      ]);
      if (!alive) return;

      const roll = (rows: { date: string; durationMin: number }[]): Totals => {
        const todays = rows.filter((r) => r.date === today);
        return {
          today: todays.reduce((a, r) => a + r.durationMin, 0),
          todayCount: todays.length,
          ever: rows.reduce((a, r) => a + r.durationMin, 0),
          everCount: rows.length,
        };
      };

      setYoga(roll(ex.filter((e) => e.activity === 'yoga')));
      setMed(roll(soul.filter((e) => e.activity === 'meditation')));
    })();
    return () => { alive = false; };
  }, []);

  useFocusEffect(load);

  const refresh = useCallback(() => { setEpoch((n) => n + 1); load(); }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: palette.deep }]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <PracticeHeader
          title="🧘 Yoga & Meditation"
          subtitle="Asana · pranayama · seated practice"
          preset="yoga"
          navigation={navigation}
          onSynced={refresh}
        />

        <RangeBar />

        <SoulPracticeBox
          practice="yoga"
          icon="🧘‍♀️"
          name="Yoga"
          minutesToday={yoga.today}
          sessionsToday={yoga.todayCount}
          minutesEver={yoga.ever}
          sessionsEver={yoga.everCount}
          session={soulsync}
          onSessionEnd={refresh}
          refreshKey={epoch}
          onDetails={() => navigation?.navigate?.('YogaLibrary')}
          onOpenPlan={() => navigation?.navigate?.('Plan', { preset: 'yoga' })}
        />

        <SoulPracticeBox
          practice="meditation"
          icon="🪷"
          name="Meditation"
          minutesToday={med.today}
          sessionsToday={med.todayCount}
          minutesEver={med.ever}
          sessionsEver={med.everCount}
          session={soulsync}
          onSessionEnd={refresh}
          refreshKey={epoch}
          onDetails={() => navigation?.navigate?.('Meditation')}
          onOpenPlan={() => navigation?.navigate?.('Plan', { preset: 'meditate' })}
        />

        {/* The last scored sitting of each. Both are shown rather than one,
            because the tab covers both and a report that appeared only for
            whichever was practised last would look like the other's was lost. */}
        <SessionDepthReport practice="yoga" refreshKey={epoch} />
        <SessionDepthReport practice="meditation" refreshKey={epoch} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: SPACING.lg, paddingBottom: 80 },
});
