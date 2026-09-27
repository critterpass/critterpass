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

/** The critter detail screen's own "share ↗" card (3l-3): one critter, its name and where it was found. */
export const critterCardPropsSchema = z.object({
  name: z.string(),
  formName: z.string(),
  city: z.string(),
  kind: z.string(),
  seed: z.number().int(),
  photoUri: z.string().optional(),
});

export type CritterCardProps = z.infer<typeof critterCardPropsSchema>;

function nodes(props: CritterCardProps, width: number, stickerY: number, stickerSize: number) {
  return [
    ...(props.photoUri
      ? [
          image(
            0,
            0,
            width,
            stickerY + stickerSize,
            { uri: props.photoUri },
            { fit: 'cover' as const },
          ),
        ]
      : []),
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.kind,
      seed: props.seed,
    }),
    text(90, stickerY + stickerSize + 40, width - 180, props.name, TITLE_STYLE, {
      align: 'center',
    }),
    text(
      90,
      stickerY + stickerSize + 130,
      width - 180,
      `${props.formName} · found in ${props.city}`,
      SUBTITLE_STYLE,
      {
        align: 'center',
      },
    ),
  ];
}

export function buildCritterCard(props: CritterCardProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, nodes(props, POST_WIDTH, 360, 400));
}

export function buildCritterCardStory(props: CritterCardProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, nodes(props, STORY_WIDTH, 560, 440));
}

export function critterCardAltText(props: CritterCardProps): string {
  return `${props.name}, ${props.formName} form, found in ${props.city}`;
}
