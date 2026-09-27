import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

export interface WidthFractionProps {
  /** The child's measured box; until known, children render untransformed. */
  readonly layout: { readonly width: number; readonly height: number } | null;
  /** A motion-pattern animated style whose `translateX` is a fraction of the child's width. */
  readonly style: object;
  readonly children: ReactNode;
}

/**
 * Motion patterns such as `slideOff` animate `translateX` as a fraction of the row's own width and
 * leave the multiplication to the caller, but their animated styles are opaque handles. This lens
 * scales a layer uniformly by the width, applies the pattern inside it (so a fraction becomes
 * points and rotations stay true rotations about the child's centre), then undoes the scale for
 * the content.
 */
export function WidthFraction({ layout, style, children }: WidthFractionProps) {
  if (!layout || layout.width === 0) {
    return <Animated.View style={style}>{children}</Animated.View>;
  }
  const { width, height } = layout;
  return (
    <View style={{ width, height }}>
      <View style={[styles.layer, { transform: [{ scale: width }] }]}>
        <Animated.View
          style={[styles.layer, { transformOrigin: [0.5, height / (2 * width), 0] }, style]}
        >
          <View style={[styles.layer, { transform: [{ scale: 1 / width }] }]}>{children}</View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  layer: { ...StyleSheet.absoluteFill, transformOrigin: [0, 0, 0] },
});
