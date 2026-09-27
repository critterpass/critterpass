import { MAX_FONT_SCALE, useThemeSettings } from '@/lib/theme';

/** Font scale from which compact labels (tab bar, chips) switch to the large content viewer. */
export const LARGE_TEXT_SCALE = 1.5;

export interface FontScaleInfo {
  /** OS (or gallery-pinned) font scale, clamped to AX3 / Android 200%. */
  readonly scale: number;
  /** Large accessibility sizes: compact labels hide behind the large content viewer. */
  readonly isLarge: boolean;
  /** At the AX3 ceiling: rows stack vertically instead of side by side. */
  readonly isMax: boolean;
}

export function fontScaleInfo(scale: number): FontScaleInfo {
  return { scale, isLarge: scale >= LARGE_TEXT_SCALE, isMax: scale >= MAX_FONT_SCALE };
}

/** The current Dynamic Type / Android font scale from the nearest `ThemeProvider`. */
export function useFontScale(): FontScaleInfo {
  return fontScaleInfo(useThemeSettings().fontScale);
}
