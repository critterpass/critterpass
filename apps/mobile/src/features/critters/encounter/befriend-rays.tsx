/**
 * The sunburst behind a befriended critter (3l-6). It spins on the idle clock; with motion
 * reduced it stands still in its resting frame, so the critter keeps its backdrop.
 */
import { Path } from '@shopify/react-native-skia';

import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { wedgesPath } from '@/ui/textures/geometry';
import { Rays } from '@/ui/textures/rays';
import { TEXTURE } from '@/ui/textures/texture-tokens';
import { TextureCanvas } from '@/ui/textures/TextureCanvas';

export function BefriendRays() {
  const reduced = useReducedImpactMotion();
  if (!reduced) return <Rays />;
  const { color, opacity, step } = TEXTURE.rays;
  return (
    <TextureCanvas testID="critters-befriended-rays">
      {({ width, height }) => (
        <Path path={wedgesPath(width, height, step)} color={color} opacity={opacity} />
      )}
    </TextureCanvas>
  );
}
