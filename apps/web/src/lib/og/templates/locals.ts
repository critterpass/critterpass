/* eslint-disable lingui/no-unlocalized-strings -- CSS values for the card layout, not UI copy. */
/**
 * Locals card (`/og/locals/{slug}.png`): a yellow ticket with the place, how many critters there
 * are to find and how many of each tier. No critter is drawn or named; the sticker is the site's
 * own guide.
 */
import type { Node } from '@takumi-rs/helpers';

import {
  box,
  brandStrip,
  chip,
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

export interface LocalsCard {
  readonly eyebrow: string;
  readonly headline: string;
  readonly count: string;
  readonly chips: readonly string[];
  /** `src` of the sticker in the render's images. */
  readonly guide: string;
}

export function localsTemplate(card: LocalsCard): Node {
  const headlineSize = card.headline.length > 14 ? OG_TYPE.headlineLong : OG_TYPE.headline;
  return box(
    { width: OG_WIDTH, height: OG_HEIGHT, backgroundColor: PALETTE.ink, position: 'relative' },
    [
      box(
        {
          position: 'absolute',
          left: 40,
          top: 36,
          width: 800,
          height: 480,
          padding: '44px 48px',
          borderRadius: 40,
          backgroundColor: PALETTE.yellow,
          flexDirection: 'column',
          transform: 'rotate(-1.5deg)',
        },
        [
          eyebrow(card.eyebrow, PALETTE.ink),
          box({ marginTop: 18, flexGrow: 1, flexDirection: 'column' }, [
            display(card.headline, headlineSize, PALETTE.ink),
            line(card.count, {
              marginTop: 22,
              fontFamily: FONT.body,
              fontWeight: 600,
              fontSize: OG_TYPE.body,
              color: PALETTE.ink,
            }),
          ]),
          box(
            { flexWrap: 'wrap' },
            card.chips.map((text) => chip(text, PALETTE.ink, PALETTE.yellow)),
          ),
        ],
      ),
      box({ position: 'absolute', right: 56, top: 130 }, [sticker(card.guide, 260, 8)]),
      brandStrip(PALETTE.inkRaised, PALETTE.yellow),
    ],
  );
}
