import { Path } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { useRays } from '@/motion/patterns/rays';

import { wedgesPath } from './geometry';
import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface RaysProps {
  /** Spins while true (and the screen is focused); omitted entirely under reduced motion. */
  readonly active?: boolean;
}

/** `tex.rays`: cream sunburst behind wins and befriends, spinning on the shared idle clock. */
export function Rays({ active = true }: RaysProps) {
  const { style, visible } = useRays(active);
  const { color, opacity, step } = TEXTURE.rays;
  if (!visible) return null;
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <TextureCanvas testID="texture-rays">
        {({ width, height }) => (
          <Path path={wedgesPath(width, height, step)} color={color} opacity={opacity} />
        )}
      </TextureCanvas>
    </Animated.View>
  );
}
