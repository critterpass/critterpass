import { z } from 'zod';

import type { CardLayout } from '../model';
import { STORY_HEIGHT, STORY_WIDTH } from './shared';

/**
 * Instagram Stories' own two-layer sharing contract (background image + a separate movable
 * "sticker" image over it) — not a card of its own, but how any other 9:16 template's rendered
 * image is split for `share-actions.ts` to hand to the Stories SDK. The background is the full
 * rendered story card; the overlay sticker re-shows just the app's own critter sticker on top so a
 * user can drag/resize it (Stories' one interactive element), matching the platform's contract.
 */
export const storyFrameLayersPropsSchema = z.object({
  backgroundPngBytes: z.instanceof(Uint8Array),
  stickerPngBytes: z.instanceof(Uint8Array),
  stickerX: z.number(),
  stickerY: z.number(),
  stickerWidth: z.number(),
  stickerHeight: z.number(),
});

export type StoryFrameLayersProps = z.infer<typeof storyFrameLayersPropsSchema>;

export interface StoryFrameLayers {
  readonly backgroundImage: Uint8Array;
  readonly stickerImage: Uint8Array;
  readonly stickerX: number;
  readonly stickerY: number;
  readonly stickerWidth: number;
  readonly stickerHeight: number;
}

/** Packages an already-rendered 9:16 story `CardLayout`'s PNG plus a separately-rendered sticker PNG into Instagram's two-layer share payload. */
export function buildStoryFrameLayers(props: StoryFrameLayersProps): StoryFrameLayers {
  return {
    backgroundImage: props.backgroundPngBytes,
    stickerImage: props.stickerPngBytes,
    stickerX: props.stickerX,
    stickerY: props.stickerY,
    stickerWidth: props.stickerWidth,
    stickerHeight: props.stickerHeight,
  };
}

export function assertStorySize(layout: CardLayout): void {
  if (layout.width !== STORY_WIDTH || layout.height !== STORY_HEIGHT) {
    throw new Error(
      `assertStorySize: expected a ${STORY_WIDTH}x${STORY_HEIGHT} story layout, got ${layout.width}x${layout.height}`,
    );
  }
}
