/* eslint-disable lingui/no-unlocalized-strings -- CSS values for the card layout, not UI copy. */
/** Pricing card (`/og/page/pricing.png`): a yellow ticket naming the three ways to travel. */
import type { Node } from '@takumi-rs/helpers';

import {
  box,
  brandStrip,
  chip,
  display,
  eyebrow,
  OG_HEIGHT,
  OG_TYPE,
  OG_WIDTH,
  PALETTE,
  sticker,
} from './shared';

export interface PricingCard {
  readonly eyebrow: string;
  readonly headline: string;
  /** One chip per plan. */
  readonly chips: readonly string[];
  /** `src` of the sticker in the render's images. */
  readonly guide: string;
}

export function pricingTemplate(card: PricingCard): Node {
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
          box({ marginTop: 18, flexGrow: 1 }, [
            display(card.headline, OG_TYPE.headline, PALETTE.ink),
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
