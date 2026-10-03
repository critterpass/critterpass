import { ajoTheme } from './themes/ajo';
import { chavaTheme } from './themes/chava';
import { lundiTheme } from './themes/lundi';
import { pacoTheme } from './themes/paco';
import { ponTheme } from './themes/pon';
import { sardiTheme } from './themes/sardi';
import { tokekTheme } from './themes/tokek';
import type { ThemeSpec } from './render-theme';

export const GUIDE_IDS = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco', 'chava'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

/** Every guide theme: 3 named (tokek, pon, lundi) + 4 proposals pending founder approval. */
export const THEMES: Readonly<Record<GuideId, ThemeSpec>> = {
  tokek: tokekTheme,
  pon: ponTheme,
  lundi: lundiTheme,
  ajo: ajoTheme,
  sardi: sardiTheme,
  paco: pacoTheme,
  chava: chavaTheme,
};

export function buildThemeRegistry(): ThemeSpec[] {
  return GUIDE_IDS.map((id) => THEMES[id]);
}
