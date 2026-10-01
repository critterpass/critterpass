/**
 * Stand-in for `@shopify/react-native-skia` in component suites: the native JSI/GPU host that
 * draws Skia scenes does not exist under Jest. Containers render their children and every drawing
 * primitive renders an inspectable, a11y-hidden `View` carrying its props, so suites can assert
 * what a component asks Skia to draw (paths, colours) without drawing pixels. Use it with
 * `jest.mock('@shopify/react-native-skia', () => require('<path>/test-support/skia-double'))`.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

interface PrimitiveProps {
  readonly children?: ReactNode;
  readonly [prop: string]: unknown;
}

function primitive(kind: string) {
  function SkiaPrimitive({ children, ...props }: PrimitiveProps) {
    return (
      <View testID={`skia-${kind}`} accessible={false} {...{ skiaProps: props }}>
        {children}
      </View>
    );
  }
  SkiaPrimitive.displayName = `Skia${kind}`;
  return SkiaPrimitive;
}

export const Canvas = primitive('canvas');
export const Group = primitive('group');
export const Path = primitive('path');
export const Rect = primitive('rect');
export const RoundedRect = primitive('rounded-rect');
export const Circle = primitive('circle');
export const LinearGradient = primitive('linear-gradient');
export const SweepGradient = primitive('sweep-gradient');
export const RadialGradient = primitive('radial-gradient');
export const Picture = primitive('picture');
export const Image = primitive('image');

export const vec = (x = 0, y = 0) => ({ x, y });
