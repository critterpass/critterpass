import type { GuideId } from '@/lib/navigation/active-guide';

import { guideSticker } from '../stickers/guides';

/** An accent of its own: the colour of a guide (`#rrggbb`), dark text on top. */
export type AccentTone = `#${string}`;

/**
 * The fill a view model asks for (a booking kind, an inbox card, a guide's tip): a named accent,
 * dark raised or sunken, paper, or a guide's own colour. Each screen maps it to its palette.
 */
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
