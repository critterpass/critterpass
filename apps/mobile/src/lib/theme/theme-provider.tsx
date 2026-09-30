import { createContext, useContext, useMemo } from 'react';
import type { ReactNode } from 'react';
import { useWindowDimensions } from 'react-native';
import { useMMKVBoolean } from 'react-native-mmkv';

import type { Contrast } from './use-contrast';
import { useSystemContrast } from './use-contrast';

/** MMKV key for the "Plain text for guide" setting (docs/design-system.md §5); the You screens write it. */
export const PLAIN_GUIDE_TEXT_KEY = 'cp.a11y.plainGuideText';

/** AX3 / Android 200%: the largest font scale body text follows (docs/design-system.md §5). */
export const MAX_FONT_SCALE = 2;

export interface ThemeSettings {
  readonly contrast: Contrast;
  /** OS font scale clamped to `MAX_FONT_SCALE`; text components apply per-variant damping. */
  readonly fontScale: number;
  /** Swap the Borel guide voice for Geist italic. */
  readonly plainGuideText: boolean;
}

const ThemeSettingsContext = createContext<ThemeSettings | null>(null);

export interface ThemeProviderProps {
  readonly children: ReactNode;
  /** Pins contrast instead of following the OS (gallery switcher, tests). */
  readonly contrast?: Contrast;
  /** Pins the font scale instead of following the OS (gallery switcher, tests). */
  readonly fontScale?: number;
  readonly plainGuideText?: boolean;
}

function clampFontScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) return 1;
  return Math.min(MAX_FONT_SCALE, scale);
}

/**
 * Root theme settings. Nested providers inherit from the nearest parent and override only what they
 * pin, so the dev gallery can preview one fixture at AX3 + increase contrast inside the running app.
 */
export function ThemeProvider({
  children,
  contrast,
  fontScale,
  plainGuideText,
}: ThemeProviderProps) {
  const parent = useContext(ThemeSettingsContext);
  const systemContrast = useSystemContrast();
  const { fontScale: systemFontScale } = useWindowDimensions();
  const [storedPlainGuideText] = useMMKVBoolean(PLAIN_GUIDE_TEXT_KEY);

  const resolvedContrast = contrast ?? parent?.contrast ?? systemContrast;
  const resolvedFontScale = clampFontScale(fontScale ?? parent?.fontScale ?? systemFontScale);
  const resolvedPlain = plainGuideText ?? parent?.plainGuideText ?? storedPlainGuideText ?? false;

  const value = useMemo<ThemeSettings>(
    () => ({
      contrast: resolvedContrast,
      fontScale: resolvedFontScale,
      plainGuideText: resolvedPlain,
    }),
    [resolvedContrast, resolvedFontScale, resolvedPlain],
  );

  return <ThemeSettingsContext.Provider value={value}>{children}</ThemeSettingsContext.Provider>;
}

const DEFAULT_SETTINGS: ThemeSettings = {
  contrast: 'standard',
  fontScale: 1,
  plainGuideText: false,
};

/** Settings from the nearest `ThemeProvider`; standard defaults when rendered outside one. */
export function useThemeSettings(): ThemeSettings {
  return useContext(ThemeSettingsContext) ?? DEFAULT_SETTINGS;
}
