/**
 * theme.ts — legacy dark COLORS palette + new dual-mode theme system.
 *
 * The `COLORS`/`SPACING`/`FONT_SIZES`/`FONT_WEIGHTS`/`BORDER_RADIUS` exports
 * are the app's original static palette (dark only). Everything already
 * built off them keeps working unchanged.
 *
 * New/rebuilt screens should import `useTheme()` from `./ThemeContext`
 * instead — that hook returns the same shape but responds to the runtime
 * light/dark toggle wired via the Color Theme setting.
 */

/** Original dark palette — captured at module init and re-applied when the
 *  user toggles back to dark. Do NOT mutate this — mutate `COLORS` instead. */
export const COLORS_DARK = {
  deep: '#0a0e27',
  darkBg: '#0f1229',
  cardBg: '#1a1f3a',
  cream: '#f5e6d3',
  gold: '#d4a017',
  saffron: '#ff8c42',
  muted: '#a0a0a0',
  leaf: '#4ade80',
  success: '#10b981',
  warning: '#f59e0b',
  error: '#ef4444',
  border: 'rgba(255, 255, 255, 0.1)',
};

/** Light palette — mirrors COLORS_DARK but tuned for a light background.
 *  Text colors are dark & high-contrast, backgrounds light, borders subtle
 *  black. Accent hues (gold/saffron/leaf/error) darkened for readable AA
 *  contrast on white — e.g. `gold` was #b8860b (contrast ~2.9:1 on white,
 *  fails) → #8a6410 (~5.1:1, passes AA large). */
export const COLORS_LIGHT = {
  deep: '#f5f5f7',
  darkBg: '#ffffff',
  cardBg: '#ffffff',
  // Body / label / heading text — near-black navy for max contrast.
  cream: '#0f172a',
  // Accent gold — darker so it reads clearly on white.
  gold: '#8a6410',
  // Warm accent — deeper terracotta on light.
  saffron: '#c2410c',
  // Muted secondary text — mid-grey with enough contrast for hints.
  muted: '#374151',
  // Green accent (kept punchy so success states pop).
  leaf: '#047857',
  success: '#047857',
  warning: '#b45309',
  error: '#b91c1c',
  border: 'rgba(0, 0, 0, 0.12)',
};

/**
 * The palette every screen imports as `COLORS`. It's a mutable object whose
 * *properties* get swapped when the theme toggles — so screens that already
 * captured the reference (via `StyleSheet.create` or direct import) still see
 * the current mode's values on the NEXT render.
 *
 * StyleSheet.create bakes values into its returned object at creation time,
 * so on a light-theme toggle we also remount the tree via key={mode} in the
 * ThemeProvider to force every StyleSheet.create to re-run with the fresh
 * COLORS values. See `ThemeContext.tsx`.
 */
export const COLORS = { ...COLORS_DARK };

/** Called by the ThemeProvider on mode change — mutates in place. */
/**
 * Techno — a third template, not a third colour scheme.
 *
 * Dark and light answer "how bright should this be". Techno answers a
 * different question: the same practice data read as instrumentation rather
 * than as a diary. Near-black ground, phosphor cyan, magenta for anything
 * derived rather than measured, and amber for a caution. Screens branch on it
 * (see ThemeContext.isTechno) — a recolour alone would be a wallpaper, not a
 * template.
 */
export const COLORS_TECHNO = {
  deep: '#05070A',
  darkBg: '#080B10',
  cardBg: '#0C1118',
  cream: '#D7F7F2',
  gold: '#00E5C7',          // primary accent — phosphor cyan
  saffron: '#FF3DA5',       // derived / secondary readouts
  muted: '#5E7A80',
  leaf: '#00E5C7',
  success: '#00E5C7',
  warning: '#FFB020',
  error: '#FF3D6E',
  border: 'rgba(0, 229, 199, 0.18)',
};

/**
 * Elders — a template built around legibility, not a lighter coat of paint.
 *
 * Designed against the things that actually make an interface hard to use
 * later in life: reduced contrast sensitivity, yellowing of the lens which
 * mutes blues, smaller pupils admitting less light, and less steady aim.
 *
 *   • Near-black ink on warm off-white. Pure white glares under cataracts;
 *     a warm ground scatters less.
 *   • No grey-on-grey anywhere. The muted tone here is #4A4A4A — still about
 *     7:1 on this ground, where the other templates' muted greys fall to 3:1
 *     and vanish for exactly the readers who need them most.
 *   • Accents are dark and saturated rather than pastel. A pale blue label on
 *     cream is invisible to a yellowed lens; ink blue survives it.
 *   • Red and green never carry meaning alone — roughly one man in twelve
 *     cannot separate them — so the screens pair colour with a word.
 *
 * Type scale, spacing and touch targets are set in the Elders screens, since
 * they are layout rather than colour.
 */
export const COLORS_ELDERS = {
  deep: '#FBF7F0',          // warm off-white, not glaring white
  darkBg: '#FFFDF9',
  cardBg: '#FFFFFF',
  cream: '#1A1A1A',         // ink — this is text colour, despite the name
  gold: '#1C4E80',          // ink blue: survives a yellowed lens
  saffron: '#A33B00',       // deep amber, readable on cream
  muted: '#4A4A4A',         // ~7:1 contrast, never a pale grey
  leaf: '#1E6B3A',
  success: '#1E6B3A',
  warning: '#8A5300',
  error: '#A3122B',
  border: 'rgba(26, 26, 26, 0.22)',
};

export const applyMode = (mode: ThemeMode): void => {
  Object.assign(
    COLORS,
    mode === 'light' ? COLORS_LIGHT
      : mode === 'techno' ? COLORS_TECHNO
        : mode === 'elders' ? COLORS_ELDERS
          : COLORS_DARK
  );
};

export type ThemeMode = 'light' | 'dark' | 'techno' | 'elders';
export type Palette = typeof COLORS_DARK;

export const paletteFor = (mode: ThemeMode): Palette =>
  mode === 'light' ? COLORS_LIGHT
    : mode === 'techno' ? COLORS_TECHNO
      : mode === 'elders' ? COLORS_ELDERS
        : COLORS_DARK;

/**
 * Left inset a screen header needs so the floating ☰ drawer button does not
 * sit on top of its title.
 *
 * The button is absolutely positioned at left: 12 and is 36 wide (App.tsx,
 * `burgerBtn`), so it occupies x 12-48; 56 clears it with a small gap. It was
 * previously hardcoded as a bare `56` on some screens, applied to the title
 * and subtitle separately on another, and missing entirely on the rest — so
 * the header overlapped the button on exactly the screens nobody had checked.
 */
export const DRAWER_CLEARANCE = 56;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
};

export const FONT_SIZES = {
  xs: 10,
  sm: 12,
  base: 14,
  lg: 16,
  xl: 18,
  '2xl': 20,
  '3xl': 24,
  '4xl': 32,
};

export const FONT_WEIGHTS = {
  normal: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
};

export const BORDER_RADIUS = {
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  full: 9999,
};
