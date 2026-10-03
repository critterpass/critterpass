/**
 * One traveller's signature on the stamp page, in their colour: their drawn stroke writing itself
 * (the path drawn on from start to end), or their name in the signature hand while they have not
 * drawn one or it has not loaded. Reduce Motion shows it written.
 */
import { tokens } from '@cp/design-tokens';
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { View } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Text } from '@/ui/text/Text';

import type { SignatureStroke } from './stroke';

export const SIGNATURE_BOX = { width: 120, height: 48 } as const;
const STROKE_WIDTH = 3;
const easeInOut = bezierEasing(tokens.motion.easing.standard);

export interface WrittenSignatureProps {
  readonly name: string;
  readonly color: string;
  readonly stroke: SignatureStroke | null;
  /** Writes itself once this turns true. */
  readonly written: boolean;
  readonly testID?: string;
}

export function WrittenSignature({ name, color, stroke, written, testID }: WrittenSignatureProps) {
  const reduced = useReducedImpactMotion();
  const end = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    if (!written) return;
    end.value = reduced
      ? 1
      : withTiming(1, { duration: tokens.motion.duration.extra * 2, easing: easeInOut });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a shared value's ref is stable.
  }, [written, reduced]);

  if (!written) return <View style={SIGNATURE_BOX} testID={testID} />;
  if (stroke === null) {
    return (
      <View style={SIGNATURE_BOX} testID={testID} accessible accessibilityLabel={name}>
        <Text variant="voiceSignature" color={color} numberOfLines={1}>
          {name}
        </Text>
      </View>
    );
  }
  const scale = Math.min(SIGNATURE_BOX.width / stroke.width, SIGNATURE_BOX.height / stroke.height);
  return (
    <View style={SIGNATURE_BOX} testID={testID} accessible accessibilityLabel={name}>
      <Canvas style={SIGNATURE_BOX}>
        <Group transform={[{ scale }]}>
          <Path
            path={stroke.path}
            style="stroke"
            strokeWidth={STROKE_WIDTH / scale}
            strokeCap="round"
            strokeJoin="round"
            color={color}
            start={0}
            end={end}
          />
        </Group>
      </Canvas>
    </View>
  );
}
