/**
 * The hand-drawn strike across a packed chip: a slightly wavy pen line drawn left to right in
 * 260 ms when the chip is ticked (already drawn when it mounts packed, and with reduced motion).
 */
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { useSharedValue, withTiming } from 'react-native-reanimated';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

export const PEN_STRIKE_MS = 260;

export interface PenStrikeProps {
  readonly drawn: boolean;
  readonly color: string;
}

function strokePath(width: number, height: number) {
  const path = Skia.Path.Make();
  const y = height / 2;
  path.moveTo(2, y + 1.5);
  path.cubicTo(width * 0.3, y - 2, width * 0.6, y + 2.5, width - 2, y - 1);
  return path;
}

export function PenStrike({ drawn, color }: PenStrikeProps) {
  const reduced = useReducedImpactMotion();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const end = useSharedValue(drawn ? 1 : 0);
  const first = useRef(true);
  useEffect(() => {
    const target = drawn ? 1 : 0;
    if (first.current || reduced || !drawn) {
      end.value = target;
    } else {
      end.value = 0;
      end.value = withTiming(1, { duration: PEN_STRIKE_MS });
    }
    first.current = false;
  }, [drawn, reduced, end]);
  const path = useMemo(
    () => (size.width > 0 ? strokePath(size.width, size.height) : null),
    [size.width, size.height],
  );
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setSize({ width, height });
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout}>
      {path !== null && drawn ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Path
            path={path}
            style="stroke"
            strokeWidth={2.5}
            strokeCap="round"
            color={color}
            start={0}
            end={end}
          />
        </Canvas>
      ) : null}
    </View>
  );
}
