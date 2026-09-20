/**
 * EldersJapa — the Japa tab under the "Easy to read" template.
 *
 * The default Japa screen carries a stats box, a depth score, a sadhana
 * selector, a path picker, a soulsync toggle, hint banners and the counter.
 * That is a lot to hold in mind, and none of it is the thing the user came to
 * do, which is count.
 *
 * SO THIS SCREEN IS THE COUNT, AND VERY LITTLE ELSE
 *
 *   • The tap target is the screen. Not a bead, not a button in a corner — a
 *     large area that is hard to miss with an unsteady hand, which is the
 *     single most important decision on this screen.
 *   • The count is enormous, and the mala progress is stated in words as well
 *     as a bar: "34 of 108 beads". A bar alone asks the reader to estimate.
 *   • Undo is offered plainly. A miscount with no way back is the thing that
 *     makes people abandon a counter, and a small "×" in a corner is not an
 *     escape route for someone who has just tapped by accident.
 *   • Nothing is abbreviated. "Malas finished today", not "Malas: 3".
 *
 * The counting rules are the app's own — 108 beads to a mala — and completed
 * malas are saved through the same saveSession path the default screen uses,
 * so switching template never changes what is recorded.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Vibration, ScrollView } from 'react-native';
import { useTheme } from '../../ThemeContext';
import { type Palette } from '../../theme';
import { useSadhana } from '../../context';
import { todayStr } from '../../utils';
import { recordJapaTap } from '../../soulsync/db/japaTimeRepo';
import { E, lh, eldersShapes } from './eldersKit';

const BEADS = 108;

export const EldersJapa: React.FC<{ navigation?: any }> = () => {
  const { palette } = useTheme();
  const s = useMemo(() => makeStyles(palette), [palette]);
  const { selectedDeity, history, saveSession, showToast } = useSadhana();

  const [count, setCount] = useState(0);
  const [malas, setMalas] = useState(0);

  const doneToday = useMemo(
    () => history.filter((h) => h.date === todayStr()).reduce((a, h) => a + h.malas, 0),
    [history],
  );

  const onBead = useCallback(() => {
    // Felt, not just seen: a short buzz confirms the tap for a reader who may
    // not be looking at the screen while chanting.
    Vibration.vibrate(25);
    // Timed the same way as the default screen: the bead's instant is what
    // japa time is measured from, so a reader on this template gets the same
    // duration a reader on the other one would.
    recordJapaTap('app');
    setCount((c) => {
      const next = c + 1;
      if (next < BEADS) return next;

      // Mala complete — save it the same way the default screen does.
      setMalas((m) => m + 1);
      Vibration.vibrate([0, 120, 80, 120]);
      if (selectedDeity) {
        saveSession({
          deity: selectedDeity.name,
          deityId: selectedDeity.id,
          malas: 1,
          japas: BEADS,
          date: todayStr(),
        });
      }
      showToast?.('One mala complete');
      return 0;
    });
  }, [selectedDeity, saveSession, showToast]);

  const undo = useCallback(() => {
    setCount((c) => (c > 0 ? c - 1 : 0));
  }, []);

  const pct = Math.round((count / BEADS) * 100);

  return (
    <ScrollView style={s.screen} contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
      <Text style={s.title}>
        {selectedDeity ? selectedDeity.name : 'Japa'}
      </Text>
      <Text style={s.instruction}>
        Tap the large circle below once for each bead.
      </Text>

      {/* The counter. Deliberately the largest thing on the screen. */}
      <TouchableOpacity
        style={s.tapArea}
        onPress={onBead}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={`Count a bead. ${count} of ${BEADS} counted.`}
      >
        <Text style={s.count}>{count}</Text>
        <Text style={s.countOf}>of {BEADS} beads</Text>
        <Text style={s.tapHint}>Tap here</Text>
      </TouchableOpacity>

      {/* Progress stated in words as well as drawn. */}
      <View style={s.progressTrack}>
        <View style={[s.progressFill, { width: `${pct}%` }]} />
      </View>
      <Text style={s.progressText}>
        {count === 0
          ? 'You have not started this mala yet.'
          : `${count} of ${BEADS} beads counted. ${BEADS - count} to go.`}
      </Text>

      <TouchableOpacity style={s.undo} onPress={undo} accessibilityRole="button">
        <Text style={s.undoText}>Undo one bead</Text>
      </TouchableOpacity>

      <View style={s.card}>
        <Text style={s.cardTitle}>Malas finished today</Text>
        <Text style={s.figure}>{doneToday + malas}</Text>
        <Text style={s.meaning}>
          One mala is {BEADS} beads. This counts the malas you have completed
          since midnight, including any you finished earlier today.
        </Text>
      </View>

      <Text style={s.footnote}>
        Your count is saved as soon as a mala is finished. You can close the app
        between malas and the total will still be here.
      </Text>
    </ScrollView>
  );
};

const makeStyles = (C: Palette) => StyleSheet.create({
  ...eldersShapes,
  screen: { ...eldersShapes.screen, backgroundColor: C.deep },

  title: { color: C.cream, fontSize: E.heading, fontWeight: '700', lineHeight: lh(E.heading) },
  instruction: {
    color: C.muted, fontSize: E.body, lineHeight: lh(E.body),
    marginTop: 6, marginBottom: E.gap,
  },

  tapArea: {
    minHeight: 280,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: C.gold,
    backgroundColor: C.cardBg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: E.pad,
    marginBottom: E.gap,
  },
  count: { color: C.cream, fontSize: 96, fontWeight: '700', lineHeight: 104 },
  countOf: { color: C.muted, fontSize: E.body, lineHeight: lh(E.body) },
  tapHint: { color: C.gold, fontSize: E.body, fontWeight: '700', marginTop: 10 },

  progressTrack: {
    height: 18, borderRadius: 9, overflow: 'hidden',
    backgroundColor: C.border, marginBottom: 10,
  },
  progressFill: { height: '100%', backgroundColor: C.gold },
  progressText: { color: C.cream, fontSize: E.small, lineHeight: lh(E.small), marginBottom: E.gap },

  undo: {
    ...eldersShapes.button,
    borderColor: C.border,
    backgroundColor: C.cardBg,
    marginBottom: E.gap,
  },
  undoText: { color: C.cream, fontSize: E.body, fontWeight: '700' },

  card: { ...eldersShapes.card, backgroundColor: C.cardBg, borderColor: C.border },
  cardTitle: { color: C.gold, fontSize: E.body, fontWeight: '700', lineHeight: lh(E.body) },
  figure: { color: C.cream, fontSize: E.hero, fontWeight: '700', marginTop: 4 },
  meaning: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small), marginTop: 10 },

  footnote: { color: C.muted, fontSize: E.small, lineHeight: lh(E.small) },
});
