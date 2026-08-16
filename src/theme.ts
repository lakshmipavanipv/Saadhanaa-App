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
export const applyMode = (mode: ThemeMode): void => {
  Object.assign(COLORS, mode === 'light' ? COLORS_LIGHT : COLORS_DARK);
};

export type ThemeMode = 'light' | 'dark';
export type Palette = typeof COLORS_DARK;

export const paletteFor = (mode: ThemeMode): Palette =>
  mode === 'light' ? COLORS_LIGHT : COLORS_DARK;

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
