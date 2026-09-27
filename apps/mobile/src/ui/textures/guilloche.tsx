import { Path } from '@shopify/react-native-skia';

import { ringsPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

/** `tex.guilloche`: fine concentric rings rising from below the page (passport pages). */
export function Guilloche() {
  const { color, lineWidth, pitch, originX, originY } = TEXTURE.guilloche;
  return (
    <TextureCanvas testID="texture-guilloche">
      {({ width, height }) => (
        <Path
          path={ringsPath(width, height, originX, originY, pitch)}
          color={color}
          style="stroke"
          strokeWidth={lineWidth}
        />
      )}
    </TextureCanvas>
  );
}
