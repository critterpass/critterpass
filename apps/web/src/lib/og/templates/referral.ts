/* eslint-disable lingui/no-unlocalized-strings -- CSS values for the card layout, not UI copy. */
/** Referral card (`/og/referral/{code}.png`): pink, who sent it, the programme's line, a sticker. */
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

export interface ReferralCard {
  readonly eyebrow: string;
  readonly headline: string;
  readonly body: string;
  readonly guide: string;
}

export function referralTemplate(card: ReferralCard): Node {
  return box(
    {
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: PALETTE.pink,
      position: 'relative',
      padding: '56px 56px 0',
      flexDirection: 'column',
    },
    [
      eyebrow(card.eyebrow, PALETTE.ink),
      box({ marginTop: 18, width: 820 }, [display(card.headline, OG_TYPE.hero, PALETTE.ink)]),
      box({ marginTop: 22, width: 720 }, [
        line(card.body, {
          fontFamily: FONT.body,
          fontSize: OG_TYPE.body,
          lineHeight: 1.35,
          color: PALETTE.ink,
        }),
      ]),
      box({ position: 'absolute', right: 70, top: 120 }, [sticker(card.guide, 260, -8)]),
      brandStrip(PALETTE.ink, PALETTE.yellow),
    ],
  );
}
