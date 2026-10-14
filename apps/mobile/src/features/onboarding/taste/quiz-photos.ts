/**
 * The photos behind the this-or-that cards (2.07). The mornings pair is the designed one (a
 * sunrise on Batur over "Sunrise summit", a quiet beach under "Sleep till ten"), bundled so the
 * quiz shows them on a first launch with no signal. A pair with no photo keeps its colour field.
 */
import type { ImageSourcePropType } from 'react-native';

import BATUR from '../../../../assets/splash-photos/batur-sunrise.jpg';
import PENIDA from '../../../../assets/splash-photos/kelingking.jpg';

export interface QuizPhoto {
  readonly source: ImageSourcePropType;
  /** The photo's own width over height. */
  readonly aspect: number;
  /**
   * Where the photo's subject sits, as a fraction of its height (0 top, 1 bottom): the portrait
   * photos are cropped to a wide card, and a centre crop of the sunrise is only sky.
   */
  readonly focusY: number;
}

const PHOTOS: Readonly<Record<string, Readonly<Record<'left' | 'right', QuizPhoto>>>> = {
  mornings: {
    // The sun's band and the clouds over the caldera, not the empty sky above them.
    left: { source: BATUR, aspect: 350 / 431, focusY: 0.62 },
    right: { source: PENIDA, aspect: 384 / 480, focusY: 0.5 },
  },
};

export function quizPhoto(questionId: string, side: 'left' | 'right'): QuizPhoto | null {
  return PHOTOS[questionId]?.[side] ?? null;
}

/**
 * The photo's top offset in a frame of `frame` width and height so its focus line sits at the
 * frame's middle, kept inside the photo (a cover crop with a focal point).
 */
export function photoTop(photo: QuizPhoto, frame: { width: number; height: number }): number {
  const height = frame.width / photo.aspect;
  if (height <= frame.height) return 0;
  const top = frame.height / 2 - photo.focusY * height;
  return Math.min(0, Math.max(frame.height - height, top));
}
