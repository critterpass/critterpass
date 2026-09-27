import { Platform } from 'react-native';

import type { Tokens } from '@cp/design-tokens';
import { tokens } from '@cp/design-tokens';

import type { Contrast } from '@/lib/theme';
import { createMakeStyles, useThemeSettings } from '@/lib/theme';

/** The token tree with increase-contrast variants applied, plus the active contrast mode. */
export type Theme = Tokens & { readonly contrast: Contrast };

function buildTheme(contrast: Contrast): Theme {
  if (contrast === 'standard') return { ...tokens, contrast };
  const { increaseContrast } = tokens.semantic;
  return {
    ...tokens,
    contrast,
    semantic: {
      ...tokens.semantic,
      border: { ...tokens.semantic.border, control: increaseContrast.borderControl },
      text: { ...tokens.semantic.text, tertiary: increaseContrast.textTertiary },
    },
  };
}

const THEMES: Readonly<Record<Contrast, Theme>> = {
  standard: buildTheme('standard'),
  high: buildTheme('high'),
};

/** The active theme (increase-contrast aware). Stable object per contrast mode. */
export function useTheme(): Theme {
  return THEMES[useThemeSettings().contrast];
}

/** `const useStyles = makeStyles((t) => ({ root: { backgroundColor: t.semantic.bg.base } }))`. */
export const makeStyles = createMakeStyles(useTheme);

/** Reads one entry of a size group (`size.fab.size`), failing loudly if the token is missing. */
export function sizeToken(group: Readonly<Record<string, number>>, key: string): number {
  const value = group[key];
  if (value === undefined) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
    throw new Error(`design-tokens: size group has no "${key}"`);
  }
  return value;
}

/** 44 pt on iOS, 48 dp on Android (docs/design-system.md §1.4). */
export const MIN_TOUCH_TARGET =
  Platform.OS === 'android'
    ? sizeToken(tokens.size.minTouchTarget, 'androidHeight')
    : sizeToken(tokens.size.minTouchTarget, 'height');
