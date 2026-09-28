/* eslint-disable lingui/no-unlocalized-strings -- CSS values for the card layout, not UI copy. */
/**
 * Invite card (`/og/invite/{code}.png`): the yellow ticket with who is inviting you where, the
 * crew's size and dates as chips, the code in paper tiles and the trip's guide. Only what the
 * public preview carries: first names, never photos.
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

export interface InviteCard {
  readonly eyebrow: string;
  readonly headline: string;
  readonly chips: readonly string[];
  readonly code: string;
  /** `src` of the guide sticker in the render's images. */
  readonly guide: string;
}

export function inviteTemplate(card: InviteCard): Node {
  const headlineSize = card.headline.length > 28 ? OG_TYPE.headlineLong : OG_TYPE.headline;
  return box(
    { width: OG_WIDTH, height: OG_HEIGHT, backgroundColor: PALETTE.ink, position: 'relative' },
    [
      box(
        {
          position: 'absolute',
          left: 40,
          top: 36,
          width: 760,
          height: 480,
          padding: '44px 48px',
          borderRadius: 40,
          backgroundColor: PALETTE.yellow,
          flexDirection: 'column',
          transform: 'rotate(-1.5deg)',
        },
        [
          eyebrow(card.eyebrow, PALETTE.ink),
          box({ marginTop: 18, flexGrow: 1 }, [display(card.headline, headlineSize, PALETTE.ink)]),
          box(
            { flexWrap: 'wrap' },
            card.chips.map((text) => chip(text, PALETTE.ink, PALETTE.yellow)),
          ),
        ],
      ),
      box(
        {
          position: 'absolute',
          right: 40,
          top: 60,
          width: 340,
          flexDirection: 'column',
          alignItems: 'center',
        },
        [
          sticker(card.guide, 230, 8),
          box(
            { marginTop: 28 },
            card.code.split('').map((glyph) =>
              box(
                {
                  width: 50,
                  height: 64,
                  marginRight: 6,
                  borderRadius: 10,
                  backgroundColor: PALETTE.paper,
                  alignItems: 'center',
                  justifyContent: 'center',
                },
                [
                  line(glyph, {
                    fontFamily: FONT.display,
                    fontWeight: 900,
                    fontSize: OG_TYPE.tile,
                    color: PALETTE.ink,
                  }),
                ],
              ),
            ),
          ),
        ],
      ),
      brandStrip(PALETTE.inkRaised, PALETTE.yellow),
    ],
  );
}
