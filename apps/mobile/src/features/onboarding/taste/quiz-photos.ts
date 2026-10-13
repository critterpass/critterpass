/**
 * The photos behind the this-or-that cards (2.07). The mornings pair is the designed one (a
 * sunrise on Batur over "Sunrise summit", a quiet beach under "Sleep till ten"), bundled so the
 * quiz shows them on a first launch with no signal. A pair with no photo keeps its colour field.
 */
import type { ImageSourcePropType } from 'react-native';

import BATUR from '../../../../assets/splash-photos/batur-sunrise.jpg';
import PENIDA from '../../../../assets/splash-photos/kelingking.jpg';

const PHOTOS: Readonly<Record<string, Readonly<Record<'left' | 'right', ImageSourcePropType>>>> = {
  mornings: { left: BATUR, right: PENIDA },
};

export function quizPhoto(questionId: string, side: 'left' | 'right'): ImageSourcePropType | null {
  return PHOTOS[questionId]?.[side] ?? null;
}
