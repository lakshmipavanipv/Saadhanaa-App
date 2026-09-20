/**
 * eldersKit — the sizes, spacings and building blocks the Elders screens share.
 *
 * WHY A KIT RATHER THAN PER-SCREEN STYLES
 *
 * "Make it bigger" applied screen by screen produces four different ideas of
 * big. The point of this template is that nothing is ever too small to read,
 * and that guarantee only holds if one place decides what the sizes are.
 *
 * WHERE THE NUMBERS COME FROM
 *
 * Body text is 20pt. The usual mobile default is 14-16, which is below what
 * is comfortable for a reader in their seventies; large-print books sit around
 * 16-18pt on paper held closer than a phone. 20 is the smallest size here and
 * most text is larger.
 *
 * Touch targets are 56pt, above the 44-48 that iOS and Android recommend for
 * the general population. Aim gets less steady with age and tremor is common;
 * a target that is merely adequate for a steady hand is a target that gets
 * missed, and a missed tap on a screen you cannot read is where people give up.
 *
 * Line height is 1.5. Tight leading is the first thing to fail when acuity
 * drops, because the eye loses its place returning to the next line.
 *
 * Everything here is deliberately plain: no thin weights, no all-caps labels
 * (which lose the word-shape cues that make reading fast), no grey-on-grey.
 */

import { StyleSheet } from 'react-native';

export const E = {
  /** Smallest text anywhere in this template. Nothing goes below it. */
  body: 20,
  /** Secondary text — still larger than most apps' primary. */
  small: 17,
  /** Section headings. */
  heading: 26,
  /** The one number a screen is about. */
  hero: 56,
  /** A supporting number. */
  figure: 34,

  /** Minimum tappable height. Above the 44-48 platform guidance, on purpose. */
  tap: 56,

  gap: 16,
  pad: 20,
  radius: 18,

  /** 1.5x leading, as a multiplier applied to whichever size is in use. */
  leading: 1.5,
} as const;

/** Line height for a given font size, at this template's leading. */
export const lh = (size: number): number => Math.round(size * E.leading);

/**
 * Shared shapes. Colour is left to each screen, because the palette arrives
 * through the theme and these are only geometry and weight.
 */
export const eldersShapes = StyleSheet.create({
  screen: { flex: 1 },
  // Clears the ⋮ menu, which floats over every screen at the top right in
  // every template. Without this a long greeting runs under the button.
  body: {
    padding: E.pad, paddingTop: E.pad + 28, paddingRight: E.pad + 32,
    paddingBottom: 110,
  },

  card: {
    borderRadius: E.radius,
    borderWidth: 2,              // a visible edge, not a hairline
    padding: E.pad,
    marginBottom: E.gap,
  },

  /** Big, obviously-pressable button. */
  button: {
    minHeight: E.tap,
    borderRadius: E.radius,
    paddingHorizontal: E.pad,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },

  row: { flexDirection: 'row', alignItems: 'center', gap: E.gap },
});
