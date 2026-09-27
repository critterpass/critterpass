import { z } from 'zod';

import { sticker, text } from '../layout';
import type { CardLayout, LayoutNode } from '../model';
import {
  POST_HEIGHT,
  POST_WIDTH,
  SCRIPT_STYLE,
  STORY_HEIGHT,
  STORY_WIDTH,
  SUBTITLE_STYLE,
  TITLE_STYLE,
  baseCard,
} from './shared';

/** Recap stamp card (3m-8): the trip's passport-style stamp plus crew signatures. */
export const recapStampPropsSchema = z.object({
  tripName: z.string(),
  kind: z.string(),
  seed: z.number().int(),
  crewSignatures: z.array(z.string()).min(1).max(6),
});

export type RecapStampProps = z.infer<typeof recapStampPropsSchema>;

function signatureNodes(names: readonly string[], width: number, y: number): LayoutNode[] {
  const spacing = width / (names.length + 1);
  return names.map((name, index) =>
    text((index + 1) * spacing - 100, y, 200, name, SCRIPT_STYLE, { align: 'center' }),
  );
}

function nodes(props: RecapStampProps, width: number, height: number, stickerSize: number) {
  const stickerY = height * 0.25;
  return [
    sticker((width - stickerSize) / 2, stickerY, stickerSize, {
      kind: props.kind,
      seed: props.seed,
      variant: 'stamp',
    }),
    text(90, stickerY + stickerSize + 40, width - 180, props.tripName, TITLE_STYLE, {
      align: 'center',
      maxLines: 2,
    }),
    text(90, stickerY + stickerSize + 150, width - 180, 'Signed by the crew', SUBTITLE_STYLE, {
      align: 'center',
    }),
    ...signatureNodes(props.crewSignatures, width, stickerY + stickerSize + 220),
  ];
}

export function buildRecapStamp(props: RecapStampProps): CardLayout {
  return baseCard(POST_WIDTH, POST_HEIGHT, nodes(props, POST_WIDTH, POST_HEIGHT, 320));
}

export function buildRecapStampStory(props: RecapStampProps): CardLayout {
  return baseCard(STORY_WIDTH, STORY_HEIGHT, nodes(props, STORY_WIDTH, STORY_HEIGHT, 360));
}

export function recapStampAltText(props: RecapStampProps): string {
  return `${props.tripName} stamp, signed by ${props.crewSignatures.join(', ')}`;
}
