import { z } from 'zod';

import { image, sticker, text } from '../layout';
import type { CardLayout } from '../model';
import {
  POST_HEIGHT,
  POST_WIDTH,
  STORY_HEIGHT,
  STORY_WIDTH,
  SUBTITLE_STYLE,
  TITLE_STYLE,
  baseCard,
} from './shared';

/** Recap cover card (3m-3): the trip's title, date range and hero critter. */
export const recapCoverPropsSchema = z.object({
  tripName: z.string(),
  dateRange: z.string(),
  heroKind: z.string(),
  heroSeed: z.number().int(),
  photoUri: z.string().optional(),
});

export type RecapCoverProps = z.infer<typeof recapCoverPropsSchema>;

function nodes(props: RecapCoverProps, width: number, height: number, stickerSize: number) {
  const stickerY = height * 0.3;
  return [
    ...(props.photoUri
      ? [image(0, 0, width, height, { uri: props.photoUri }, { fit: 'cover' })]
      : []),
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.heroKind,
      seed: props.heroSeed,
    }),
    text(90, stickerY + stickerSize + 50, width - 180, props.tripName, TITLE_STYLE, {
      align: 'center',
      maxLines: 2,
    }),
    text(90, stickerY + stickerSize + 170, width - 180, props.dateRange, SUBTITLE_STYLE, {
      align: 'center',
    }),
  ];
}

export function buildRecapCover(props: RecapCoverProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, nodes(props, POST_WIDTH, POST_HEIGHT, 340));
}

export function buildRecapCoverStory(props: RecapCoverProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, nodes(props, STORY_WIDTH, STORY_HEIGHT, 380));
}

export function recapCoverAltText(props: RecapCoverProps): string {
  return `${props.tripName}, ${props.dateRange}`;
}
