import { createContext, useContext, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Appearance as RNAppearance, StatusBar, useColorScheme } from 'react-native';

import type { PremiumScheme } from '@cp/design-tokens';

import { createMakeStyles } from '@/lib/theme';

import { resolveScheme, useAppearance } from './appearance';
import { PREMIUM_THEMES } from './theme';
import type { PremiumTheme } from './theme';

const PremiumThemeContext = createContext<PremiumTheme | null>(null);

export interface PremiumThemeProviderProps {
  readonly children: ReactNode;
  /**
   * Pins the scheme for this subtree (the kit gallery's side-by-side panes, boarding passes that
   * stay light). Without it the root provider resolves the appearance setting against the phone.
   */
  readonly scheme?: PremiumScheme;
}

/**
 * Supplies the premium theme. The outermost provider (no `scheme`, no parent) owns the app's
 * appearance: it tells the OS which interface style to use, so native glass, alerts, the keyboard
 * and the tab bar follow the in-app setting, and it sets the status bar to match.
 */
export function PremiumThemeProvider({ children, scheme }: PremiumThemeProviderProps) {
  const parent = useContext(PremiumThemeContext);
  const isRoot = parent === null && scheme === undefined;
  const [appearance] = useAppearance();
  const system = useColorScheme();

  useEffect(() => {
    if (!isRoot) return;
    RNAppearance.setColorScheme(appearance === 'system' ? 'auto' : appearance);
  }, [isRoot, appearance]);

  const resolved = scheme ?? parent?.scheme ?? resolveScheme(appearance, system);
  const theme = PREMIUM_THEMES[resolved];

  return (
    <PremiumThemeContext.Provider value={theme}>
      {isRoot ? (
        <StatusBar barStyle={resolved === 'dark' ? 'light-content' : 'dark-content'} animated />
      ) : null}
      {children}
    </PremiumThemeContext.Provider>
  );
}

/** The nearest premium theme; light outside any provider. */
export function usePremiumTheme(): PremiumTheme {
  return useContext(PremiumThemeContext) ?? PREMIUM_THEMES.light;
}

/** `makePremiumStyles((t) => ({...}))`: a style sheet built once per scheme. */
export const makePremiumStyles = createMakeStyles(usePremiumTheme);
