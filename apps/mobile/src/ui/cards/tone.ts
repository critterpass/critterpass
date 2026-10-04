import type { GuideId } from '@/lib/navigation/active-guide';

import { guideSticker } from '../avatar/guides';
import type { SurfaceTone } from '../surface/Scaffold';
import type { Theme } from '../theme';

/** An accent of its own: the colour of a guide (`#rrggbb`), dark text on top. */
export type AccentTone = `#${string}`;

/** Surface fills a card can take: dark raised/sunken, paper, a named accent, or a guide's own. */
export type CardTone =
  | 'raised'
  | 'sunken'
  | 'paper'
  | 'yellow'
  | 'orange'
  | 'pink'
  | 'blue'
  | 'green'
  | 'cream'
  | 'red'
  | AccentTone;

/** The card tone of a guide: its accent. */
export function guideCardTone(guide: GuideId): CardTone {
  return guideSticker(guide).accent as AccentTone;
}

export function cardBackground(theme: Theme, tone: CardTone): string {
  switch (tone) {
    case 'raised':
      return theme.semantic.bg.raised;
    case 'sunken':
      return theme.semantic.bg.sunken;
    case 'paper':
      return theme.color.paper.base;
    case 'yellow':
      return theme.color.yellow;
    case 'orange':
      return theme.color.orange;
    case 'pink':
      return theme.color.pink;
    case 'blue':
      return theme.color.blue;
    case 'green':
      return theme.color.green.base;
    case 'cream':
      return theme.color.paper.warm;
    case 'red':
      return theme.color.red;
    default:
      return tone;
  }
}

export function surfaceToneOf(tone: CardTone): SurfaceTone {
  if (tone === 'raised' || tone === 'sunken') return 'dark';
  if (tone === 'paper') return 'paper';
  return 'accent';
}
