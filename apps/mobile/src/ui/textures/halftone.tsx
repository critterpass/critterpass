import { Path } from '@shopify/react-native-skia';

import { dotGridPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface HalftoneProps {
  /** `light` on colour heroes, tickets and cards; `dark` on splash, invite and the voice orb. */
  readonly variant?: 'light' | 'dark';
}

const DARK_DOT_RADIUS = 1.3;

/** `tex.halftone` dot screen. */
export function Halftone({ variant = 'light' }: HalftoneProps) {
  return (
    <TextureCanvas testID="texture-halftone">
      {({ width, height }) => {
        if (variant === 'light') {
          const { color, radius, grid } = TEXTURE.halftone;
          return <Path path={dotGridPath(width, height, grid, radius)} color={color} />;
        }
        return TEXTURE.halftoneDark.layers.map(({ color, grid }, index) => {
          return (
            <Path
              key={`${color}-${grid}`}
              path={dotGridPath(width, height, grid, DARK_DOT_RADIUS, (index * grid) / 2)}
              color={color}
            />
          );
        });
      }}
    </TextureCanvas>
  );
}
