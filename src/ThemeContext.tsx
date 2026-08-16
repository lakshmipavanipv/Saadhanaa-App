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
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'dark',
  palette: paletteFor('dark'),
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
      setMode,
      toggle: () => setMode(mode === 'dark' ? 'light' : 'dark'),
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
