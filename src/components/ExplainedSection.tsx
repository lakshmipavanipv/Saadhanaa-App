/**
 * ExplainedSection — a titled, collapsible wrapper that says in plain words
 * what the card inside is showing, before showing it.
 *
 * WHY
 *
 * The reports screen stacks nine analytics cards — Score Trends, Calm
 * Divergence, Multi-Metric Trend, Steps × Sadhana, Emotional Summary — whose
 * titles name the calculation rather than the question it answers. A reader
 * who does not already know what RMSSD is learns nothing from a chart labelled
 * RMSSD, and there is no way to tell from the screen whether a rising line is
 * good news.
 *
 * So each section states, in one sentence and no jargon, what it is for. The
 * sentence sits under the heading, not behind a tap: an explanation nobody
 * opens is the same as no explanation.
 *
 * Collapsing is the other half. Nine expanded cards is a wall, and a reader
 * looking for one thing has to scroll past eight. Sections can start closed
 * and the screen becomes a contents page that expands on demand.
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '../theme';

interface Props {
  title: string;
  /** One sentence, plain English, no metric names. What question this answers. */
  plain: string;
  /** Optional emoji, purely to make the list scannable. */
  icon?: string;
  /** Start expanded. Use for the one or two sections that matter most. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export const ExplainedSection: React.FC<Props> = ({
  title, plain, icon, defaultOpen = false, children,
}) => {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <View style={styles.wrap}>
      <TouchableOpacity
        style={styles.head}
        onPress={() => setOpen((o) => !o)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${title}. ${plain}`}
      >
        <View style={styles.headText}>
          <Text style={styles.title}>
            {icon ? `${icon}  ` : ''}{title}
          </Text>
          <Text style={styles.plain}>{plain}</Text>
        </View>
        <Text style={styles.chev}>{open ? '▴' : '▾'}</Text>
      </TouchableOpacity>

      {open && <View style={styles.body}>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
    backgroundColor: COLORS.cardBg,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  head: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: SPACING.md, paddingVertical: SPACING.md, gap: SPACING.sm,
  },
  headText: { flex: 1 },
  title: { color: COLORS.cream, fontSize: FONT_SIZES.base, fontWeight: '700' },
  plain: {
    color: COLORS.muted, fontSize: FONT_SIZES.xs,
    marginTop: 3, lineHeight: 16,
  },
  chev: { color: COLORS.gold, fontSize: FONT_SIZES.base, fontWeight: '700' },
  // The cards inside bring their own horizontal margins, so the body adds no
  // padding of its own — doubling it is what pushed charts past the border.
  body: { paddingBottom: SPACING.sm },
});
