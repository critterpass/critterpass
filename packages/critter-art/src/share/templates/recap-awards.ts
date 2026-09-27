import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout } from '../model';
import {
  POST_HEIGHT,
  POST_WIDTH,
  STORY_HEIGHT,
  STORY_WIDTH,
  SUBTITLE_STYLE,
  TITLE_STYLE,
  baseCard,
  tierAccentBar,
} from './shared';

/** Recap crew awards card (3m-5): the trip's MVP, gold-edged per the design's "MVP" treatment. */
export const recapAwardsPropsSchema = z.object({
  tripName: z.string(),
  mvpName: z.string(),
  mvpKind: z.string(),
  mvpSeed: z.number().int(),
  awardLabel: z.string(),
});

export type RecapAwardsProps = z.infer<typeof recapAwardsPropsSchema>;

function nodes(props: RecapAwardsProps, width: number, height: number, stickerSize: number) {
  const stickerY = height * 0.28;
  return [
    tierAccentBar(width, 'legendary'),
    text(90, 100, width - 180, props.tripName, SUBTITLE_STYLE, { align: 'center' }),
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.mvpKind,
      seed: props.mvpSeed,
      form: {
        rarity: 'legendary',
        palette: { f: '#ffd84a', dk: '#c99a2a', bl: '#fff6cc' },
        edge: 'legendary',
      },
    }),
    text(90, stickerY + stickerSize + 40, width - 180, props.awardLabel, TITLE_STYLE, {
      align: 'center',
      maxLines: 2,
    }),
    text(90, stickerY + stickerSize + 150, width - 180, props.mvpName, SUBTITLE_STYLE, {
      align: 'center',
    }),
  ];
}

export function buildRecapAwards(props: RecapAwardsProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, nodes(props, POST_WIDTH, POST_HEIGHT, 320));
}

export function buildRecapAwardsStory(props: RecapAwardsProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, nodes(props, STORY_WIDTH, STORY_HEIGHT, 360));
}

export function recapAwardsAltText(props: RecapAwardsProps): string {
  return `${props.awardLabel}: ${props.mvpName}`;
}
