/**
 * ThemeContext — runtime light/dark toggle persisted via AsyncStorage.
 *
 * Usage in new screens:
 *   const { mode, palette, setMode } = useTheme();
 *   <View style={{ backgroundColor: palette.deep }} />
 *
 * Legacy screens that import `COLORS` directly from `./theme` continue to
 * render in dark mode. They can be migrated incrementally.
 */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { Storage } from './storage';
import { paletteFor, applyMode, type ThemeMode, type Palette } from './theme';

interface ThemeContextValue {
  mode: ThemeMode;
  palette: Palette;
  setMode: (m: ThemeMode) => void;
  /**
   * True when the techno template is active.
   *
   * Screens branch on this to render a different layout, not merely different
   * colours. Dark and light are the same screens at different brightness;
   * techno is the same data told as instrumentation, so it needs its own
   * composition. Kept as a boolean rather than having callers compare
   * `mode === 'techno'` everywhere, so the check reads as a question about
   * layout instead of a question about colour.
   */
  isTechno: boolean;
  /**
   * True when the Elders template is active.
   *
   * Like isTechno, this selects a different layout rather than different
   * colours: larger type, fewer things per screen, bigger targets and an
   * explanation beside every number. Those are structural, so the screens
   * differ rather than the palette alone.
   */
  isElders: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  palette: paletteFor('dark'),
  isTechno: false,
  isElders: false,
  setMode: () => {},
  toggle: () => {},
});

const STORAGE_KEY = 'app.theme.mode';

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [mode, setModeState] = useState<ThemeMode>('dark');

  useEffect(() => {
    Storage.get<ThemeMode>(STORAGE_KEY, 'dark').then((saved) => {
      if (saved === 'light' || saved === 'dark') {
        applyMode(saved);
        setModeState(saved);
      }
    });
  }, []);

  const setMode = (m: ThemeMode) => {
    // Mutate the shared COLORS palette so every subsequent StyleSheet.create
    // call reads the new values. Existing StyleSheets are already baked with
    // the old values — we force a full remount below via `key={mode}` in the
    // consumer wrapper so those get rebuilt too.
    applyMode(m);
    setModeState(m);
    Storage.set(STORAGE_KEY, m).catch(() => {});
  };

  return (
    <ThemeContext.Provider value={{
      mode,
      palette: paletteFor(mode),
      isTechno: mode === 'techno',
      isElders: mode === 'elders',
      setMode,
      // The toggle stays a two-way dark/light switch. Techno is chosen
      // deliberately from the picker, not stumbled into by tapping a toggle:
      // it rearranges screens, which is not something to do by accident.
      toggle: () => setMode(mode === 'light' ? 'dark' : 'light'),
    }}>
      {/* key={mode} — when the theme toggles, this Fragment (and everything
          under it) remounts. That forces every child's StyleSheet.create to
          re-run with the freshly mutated COLORS palette, so cards, chips,
          KPI tiles, chart configs — everything — flips to the new mode.
          The Fragment itself doesn't affect layout. */}
      <React.Fragment key={mode}>{children}</React.Fragment>
    </ThemeContext.Provider>
  );
};

export const useTheme = (): ThemeContextValue => useContext(ThemeContext);
