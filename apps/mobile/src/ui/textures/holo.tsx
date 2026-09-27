import { Circle, SweepGradient, vec } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';

import { TEXTURE } from './texture-tokens';
import { TextureCanvas } from './TextureCanvas';

export interface HoloProps {
  readonly active?: boolean;
}

/** `tex.holo`: rotating pink→yellow→green→blue foil (Pass+ visa seal). Static under reduced motion. */
export function Holo({ active = true }: HoloProps) {
  const style = useLoop('spin', { active: active && TEXTURE.holo.animated });
  const colors = [...TEXTURE.holo.colors, ...TEXTURE.holo.colors.slice(0, 1)];
  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      <TextureCanvas testID="texture-holo">
        {({ width, height }) => {
          const center = vec(width / 2, height / 2);
          return (
            <Circle cx={center.x} cy={center.y} r={Math.hypot(width, height) / 2}>
              <SweepGradient c={center} colors={colors} />
            </Circle>
          );
        }}
      </TextureCanvas>
    </Animated.View>
  );
}
