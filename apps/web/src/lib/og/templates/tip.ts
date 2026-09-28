/* eslint-disable lingui/no-unlocalized-strings -- CSS values for the card layout, not UI copy. */
/** Tip card (`/og/tip/{slug}.png`): the category colour, the title, its byline and the guide. */
import type { Node } from '@takumi-rs/helpers';

import {
  box,
  brandStrip,
  display,
  eyebrow,
  line,
  FONT,
  OG_HEIGHT,
  OG_TYPE,
  OG_WIDTH,
  PALETTE,
  sticker,
} from './shared';

export interface TipCard {
  readonly eyebrow: string;
  readonly title: string;
  readonly byline: string;
  /** Card background (the tip's category colour). */
  readonly background: string;
  readonly guide: string;
}

export function tipTemplate(card: TipCard): Node {
  const titleSize = card.title.length > 48 ? OG_TYPE.titleLong : OG_TYPE.title;
  return box(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: card.background,
      position: 'relative',
      padding: '56px 56px 0',
      flexDirection: 'column',
    },
    [
      box(
        {
          padding: '8px 16px',
          borderRadius: 12,
          backgroundColor: PALETTE.ink,
          alignSelf: 'flex-start',
        },
        [eyebrow(card.eyebrow, card.background)],
      ),
      box({ marginTop: 26, width: 800 }, [display(card.title, titleSize, PALETTE.ink)]),
      box({ marginTop: 26 }, [
        line(card.byline, {
          fontFamily: FONT.body,
          fontWeight: 600,
          fontSize: OG_TYPE.body,
          color: PALETTE.ink,
        }),
      ]),
      box({ position: 'absolute', right: 70, top: 110 }, [sticker(card.guide, 270, 6)]),
      brandStrip(PALETTE.ink, PALETTE.yellow),
    ],
  );
}
