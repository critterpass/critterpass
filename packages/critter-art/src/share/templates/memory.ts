import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout } from '../model';
import { STORY_HEIGHT, STORY_WIDTH, SUBTITLE_STYLE, TITLE_STYLE, baseCard } from './shared';

/** Memory / anniversary card (3m-10): "a year later", surfaced only as a 9:16 story. */
export const memoryPropsSchema = z.object({
  kind: z.string(),
  seed: z.number().int(),
  critterName: z.string(),
  city: z.string(),
  yearsAgo: z.number().int().min(1),
});

export type MemoryProps = z.infer<typeof memoryPropsSchema>;

export function buildMemoryStory(props: MemoryProps): CardLayout {
  const width = STORY_WIDTH;
  const height = STORY_HEIGHT;
  const stickerSize = 400;
  const stickerY = height * 0.32;
  const yearsLabel =
    props.yearsAgo === 1 ? 'a year ago today' : `${props.yearsAgo} years ago today`;
  return baseCard(width, height, [
    text(90, stickerY - 100, width - 180, yearsLabel, SUBTITLE_STYLE, { align: 'center' }),
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.kind,
      seed: props.seed,
    }),
    text(90, stickerY + stickerSize + 50, width - 180, props.critterName, TITLE_STYLE, {
      align: 'center',
      maxLines: 2,
    }),
    text(90, stickerY + stickerSize + 160, width - 180, `Found in ${props.city}`, SUBTITLE_STYLE, {
      align: 'center',
    }),
  ]);
}

export function memoryAltText(props: MemoryProps): string {
  const yearsLabel = props.yearsAgo === 1 ? 'a year ago' : `${props.yearsAgo} years ago`;
  return `${props.critterName}, found in ${props.city} ${yearsLabel}`;
}
