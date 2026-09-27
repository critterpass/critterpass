import { Path } from '@shopify/react-native-skia';

import { stripesPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

/** `tex.engraving`: 115° hairlines (visa pages, the gold cover). */
export function Engraving() {
  const { angle, color, width: line, gap } = TEXTURE.engraving;
  return (
    <TextureCanvas testID="texture-engraving">
      {({ width, height }) => (
        <Path
          path={stripesPath(width, height, angle, line + gap)}
          color={color}
          style="stroke"
          strokeWidth={line}
        />
      )}
    </TextureCanvas>
  );
}
