/**
 * The sunburst behind the winning guide (3c-2): cream rays from the sticker's centre, strongest
 * there and fading outwards in three rings, turning once every 30 seconds on the app's idle clock.
 * Reduced motion leaves them out, like every other ray backdrop.
 */
import { Path } from '@shopify/react-native-skia';
import { useIsFocused } from 'expo-router';
import { View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { useIdleLoopRunning, useSharedClock } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { TEXTURE } from '@/ui/textures/texture-tokens';
import { TextureCanvas } from '@/ui/textures/TextureCanvas';

const TURN_MS = 30_000;
/** Each ring's reach, as a share of the backdrop's radius; together they add up to full strength. */
const RINGS = [0.5, 0.75, 1] as const;

/** Alternating wedges `stepDeg` wide and `radius` long from the centre of a `size` square. */
export function raysPath(size: number, radius: number, stepDeg: number): string {
  const centre = size / 2;
  const point = (degrees: number) => {
    const angle = (degrees * Math.PI) / 180;
    const x = centre + Math.cos(angle) * radius;
    const y = centre + Math.sin(angle) * radius;
    return `${x.toFixed(1)} ${y.toFixed(1)}`;
  };
  const parts: string[] = [];
  for (let at = 0; at < 360; at += stepDeg * 2) {
    // eslint-disable-next-line lingui/no-unlocalized-strings -- path data, never copy.
    parts.push(`M${centre} ${centre}L${point(at)}L${point(at + stepDeg)}Z`);
  }
  return parts.join('');
}

export function RevealRays({ size }: { readonly size: number }) {
  const reduced = useReducedImpactMotion();
  const focused = useIsFocused();
  const running = useIdleLoopRunning(!reduced && focused);
  const clock = useSharedClock(running);
  const turn = useAnimatedStyle(() => ({
    transform: [{ rotate: `${((clock.value % TURN_MS) / TURN_MS) * 360}deg` }],
  }));
  if (reduced) return null;
  const { color, opacity, step } = TEXTURE.rays;
  return (
    <View
      style={{ position: 'absolute', width: size, height: size }}
      pointerEvents="none"
      testID="reveal-rays"
    >
      <Animated.View style={[{ width: size, height: size }, turn]}>
        <TextureCanvas>
          {({ width }) =>
            RINGS.map((reach) => (
              <Path
                key={reach}
                path={raysPath(width, (width / 2) * reach, step)}
                color={color}
                opacity={opacity / RINGS.length}
              />
            ))
          }
        </TextureCanvas>
      </Animated.View>
    </View>
  );
}
