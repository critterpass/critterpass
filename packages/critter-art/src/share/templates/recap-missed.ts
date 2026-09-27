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
} from './shared';

/** Recap "one that got away" card (3m-7): a critter glimpsed but never caught, shown as its locked silhouette. */
export const recapMissedPropsSchema = z.object({
  kind: z.string(),
  seed: z.number().int(),
  city: z.string(),
});

export type RecapMissedProps = z.infer<typeof recapMissedPropsSchema>;

function nodes(props: RecapMissedProps, width: number, height: number, stickerSize: number) {
  const stickerY = height * 0.3;
  return [
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.kind,
      seed: props.seed,
      variant: 'mask',
      maskColor: '#3a3466',
    }),
    text(90, stickerY + stickerSize + 50, width - 180, 'The one that got away', TITLE_STYLE, {
      align: 'center',
      maxLines: 2,
    }),
    text(
      90,
      stickerY + stickerSize + 160,
      width - 180,
      `Somewhere in ${props.city}`,
      SUBTITLE_STYLE,
      { align: 'center' },
    ),
  ];
}

export function buildRecapMissed(props: RecapMissedProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, nodes(props, POST_WIDTH, POST_HEIGHT, 320));
}

export function buildRecapMissedStory(props: RecapMissedProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, nodes(props, STORY_WIDTH, STORY_HEIGHT, 360));
}

export function recapMissedAltText(props: RecapMissedProps): string {
  return `Undiscovered local, glimpsed in ${props.city}`;
}
