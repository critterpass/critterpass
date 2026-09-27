import { ajoTheme } from './themes/ajo';
import { lundiTheme } from './themes/lundi';
import { pacoTheme } from './themes/paco';
import { ponTheme } from './themes/pon';
import { sardiTheme } from './themes/sardi';
import { tokekTheme } from './themes/tokek';
import type { ThemeSpec } from './render-theme';

export const GUIDE_IDS = ['tokek', 'pon', 'lundi', 'ajo', 'sardi', 'paco'] as const;
export type GuideId = (typeof GUIDE_IDS)[number];

/** All 6 guide themes: 3 named (tokek, pon, lundi) + 3 proposals pending founder approval. */
export const THEMES: Readonly<Record<GuideId, ThemeSpec>> = {
  tokek: tokekTheme,
  pon: ponTheme,
  lundi: lundiTheme,
  ajo: ajoTheme,
  sardi: sardiTheme,
  paco: pacoTheme,
};

export function buildThemeRegistry(): ThemeSpec[] {
  return GUIDE_IDS.map((id) => THEMES[id]);
}
