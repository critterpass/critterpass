/**
 * How a timeline block's words fit its height. The title always shows whole, at the top: the face
 * keeps its full padding when the words fit with it, tightens when that is what it takes, and the
 * meta line is left out (never drawn in half) when it would still be cut. The words are clipped
 * at the face's padding edge on Android, so they must fit inside the padding on both sides.
 */

/** The frame's and the face's vertical padding (theme space 2 and 8; 4 when tightened). */
export const FRAME_PAD = 2;
export const FACE_PAD = 8;
export const FACE_PAD_TIGHT = 4;
/** Blocks shorter than this show the title only. */
export const META_MIN_HEIGHT = 40;

export interface BlockFitInput {
  /** The block's frame height. */
  readonly height: number;
  /** Measured line heights; 0 until the first layout. */
  readonly titleHeight: number;
  readonly metaHeight: number;
  readonly hasMeta: boolean;
}

export interface BlockFit {
  readonly padding: number;
  readonly showMeta: boolean;
}

export function blockFit({ height, titleHeight, metaHeight, hasMeta }: BlockFitInput): BlockFit {
  const face = height - FRAME_PAD * 2;
  const fits = (padding: number, words: number) => padding * 2 + words <= face + 0.5;
  if (hasMeta && height >= META_MIN_HEIGHT) {
    const words = titleHeight + metaHeight;
    if (fits(FACE_PAD, words)) return { padding: FACE_PAD, showMeta: true };
    if (fits(FACE_PAD_TIGHT, words)) return { padding: FACE_PAD_TIGHT, showMeta: true };
  }
  return { padding: fits(FACE_PAD, titleHeight) ? FACE_PAD : FACE_PAD_TIGHT, showMeta: false };
}
