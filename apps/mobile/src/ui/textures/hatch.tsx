import { Path, Rect } from '@shopify/react-native-skia';

import { stripesPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface HatchProps {
  /** Muted fill under the stripes; defaults to the token's own base colour. */
  readonly baseColor?: string;
}

/** `tex.hatch`: 135° light stripes on a muted fill (photo placeholders, loading skeletons). */
export function Hatch({ baseColor }: HatchProps) {
  const { angle, color, width: stripe, gap, base } = TEXTURE.hatch;
  return (
    <TextureCanvas testID="texture-hatch">
      {({ width, height }) => (
        <>
          <Rect x={0} y={0} width={width} height={height} color={baseColor ?? base} />
          <Path
            path={stripesPath(width, height, angle, stripe + gap)}
            color={color}
            style="stroke"
            strokeWidth={stripe}
          />
        </>
      )}
    </TextureCanvas>
  );
}
