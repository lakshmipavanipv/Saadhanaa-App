/**
 * PracticeHeader — the top of the Japa, Yoga, Meditation and Exercise tabs.
 *
 * WHY IT IS SHARED
 *
 * The 🎯 Plan Your Wellbeing button landed in a different place on each tab.
 * Exercise and Japa put it immediately after the title, aligned to the top.
 * Yoga and Meditation put "+ Log past" in between and centred the row, which
 * pushed the button left and down. Four hand-written headers meant four
 * positions for one control, and moving between tabs meant hunting for it.
 *
 * The rule here: the title takes the space it needs, the Plan button is at the
 * top right, and any per-tab action sits on its own row beneath — which is the
 * arrangement Exercise established and the only one with room for both.
 *
 * WHICH PLAN IT OPENS
 *
 * `preset` is passed straight through to the planner, which opens its wizard
 * on that category. It must be a RoutineCategory, so the type is that union
 * rather than `string` — the Meditation tab had been passing 'meditation',
 * which is not one ('meditate' is), so the wizard opened with nothing chosen.
 * A plain string type is what let that through.
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../ThemeContext';
import { SPACING, type Palette } from '../theme';
import { PlanWellbeingButton } from './PlanWellbeingButton';
import { syncAllRingVitals } from '../soulsync/ring';
import type { RoutineCategory } from '../services/routineRepo';

/** Space the hamburger drawer handle needs on the left. */
const DRAWER_CLEARANCE = 56;

interface Props {
  title: string;
  subtitle?: string;
  /** Which planner category the 🎯 button opens. */
  preset: RoutineCategory;
  navigation?: { navigate?: (route: string, params?: object) => void };
  /** Per-tab actions — "+ Log past" and the like. Placed on their own row. */
  actions?: React.ReactNode;
  /**
   * True when the screen's own ScrollView already pads horizontally.
   *
   * Japa does; Exercise, Yoga and Meditation do not. Without this the header
   * added its 16 on top of the screen's 16, so the 🎯 button stopped 32 from
   * the edge while everything below it — and the card in particular — reached
   * further right. It looked pushed out of the corner because it was.
   */
  screenPadsHorizontally?: boolean;
  /**
   * Called after a ring sync finishes, so the screen can re-read.
   *
   * The ⟳ itself is always present — it was on the Health tab only, which
   * meant the one action that makes the ring hand over its records could be
   * reached from exactly one of five places the records are displayed.
   */
  onSynced?: () => void;
}

export const PracticeHeader: React.FC<Props> = ({
  title, subtitle, preset, navigation, actions, screenPadsHorizontally, onSynced,
}) => {
  const { palette } = useTheme();
  const s = React.useMemo(() => makeStyles(palette), [palette]);
  const [syncing, setSyncing] = useState(false);

  const sync = () => {
    if (syncing) return;
    setSyncing(true);
    void syncAllRingVitals()
      .catch(() => { /* the ring is out of reach; the screen keeps what it has */ })
      .finally(() => { setSyncing(false); onSynced?.(); });
  };

  return (
    <View style={[s.header, screenPadsHorizontally && s.headerNoPad]}>
      <View style={s.row}>
        <View style={{ flex: 1 }}>
          {/* Three controls now share the right of this row, so the title
              shrinks to fit rather than wrapping under them. */}
          <Text style={s.title} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
            {title}
          </Text>
          {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
        </View>
        {/* Left of Plan, and both left of the ⋮ menu — three controls in one
            corner, in a fixed order on every tab. */}
        <TouchableOpacity
          style={s.syncBtn}
          onPress={sync}
          disabled={syncing}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel="Sync ring"
        >
          <Text style={s.syncGlyph}>{syncing ? '…' : '⟳'}</Text>
        </TouchableOpacity>
        <PlanWellbeingButton navigation={navigation} preset={preset} />
      </View>
      {actions ? <View style={s.actions}>{actions}</View> : null}
    </View>
  );
};

const makeStyles = (C: Palette) => StyleSheet.create({
  /*
    The clearance is on the RIGHT now, because that is where the ⋮ menu moved.
    The 🎯 button gives up its place in the corner to it — two controls cannot
    share one corner, and the menu is the one that has to be in the same spot
    on every screen in the app.
  */
  header: {
    paddingLeft: SPACING.md,
    paddingRight: DRAWER_CLEARANCE,
    marginBottom: SPACING.md,
    paddingTop: 4,
  },
  // The screen already pads: drop this header's own, so the button reaches the
  // same right edge as everything else. The left still clears the drawer
  // handle, less what the screen has already given.
  // The screen already gives SPACING.md on each side; this adds only the
  // remainder needed to clear the menu button.
  headerNoPad: { paddingLeft: 0, paddingRight: DRAWER_CLEARANCE - SPACING.md },
  // flex-start, not center: the button is two lines tall and centring it
  // against a one-line title drags it down out of the corner.
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  syncBtn: {
    width: 34, height: 34, borderRadius: 17,
    borderColor: C.gold, borderWidth: 1,
    alignItems: 'center', justifyContent: 'center',
    marginLeft: SPACING.sm,
  },
  syncGlyph: { color: C.gold, fontSize: 16, fontWeight: '700' },
  title: { fontSize: 24, color: C.cream, fontWeight: '600' },
  subtitle: { fontSize: 12, color: C.muted, marginTop: 4 },
  actions: {
    flexDirection: 'row', justifyContent: 'flex-end',
    gap: SPACING.sm, marginTop: SPACING.sm,
  },
});
