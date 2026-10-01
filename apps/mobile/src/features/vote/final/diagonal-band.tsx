/**
 * The Home final card's first-place band (3b-6): the place colour turned on the diagonal, with the
 * place's photo inside it kept level (the card's box, turned back by the same angle).
 */
import type { MediaAsset } from '@cp/domain';
import { View } from 'react-native';

import { MediaLayer } from '@/ui/media/MediaLayer';

import { CARD_HEIGHT, diagonalDegrees, diagonalStyle } from './diagonal';

export function DiagonalBand({
  width,
  colour,
  photo,
}: {
  readonly width: number;
  readonly colour: string;
  readonly photo: MediaAsset | null;
}) {
  return (
    <View
      pointerEvents="none"
      style={[diagonalStyle(width), { backgroundColor: colour, overflow: 'hidden' }]}
    >
      <View
        style={{
          position: 'absolute',
          start: width,
          top: CARD_HEIGHT,
          width,
          height: CARD_HEIGHT,
          transform: [{ rotate: `${-diagonalDegrees(width)}deg` }],
        }}
      >
        <MediaLayer
          media={photo}
          surface="accent"
          accent={colour}
          dots={false}
          testID="final-split-photo-0"
        />
      </View>
    </View>
  );
}
