import { Canvas } from '@shopify/react-native-skia';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent, StyleProp, ViewStyle } from 'react-native';

export interface TextureSize {
  readonly width: number;
  readonly height: number;
}

export interface TextureCanvasProps {
  readonly children: (size: TextureSize) => ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
}

/**
 * Fills its parent with a Skia canvas sized from layout. Textures are pure decoration: never
 * touchable and hidden from assistive tech.
 */
export function TextureCanvas({ children, style, testID }: TextureCanvasProps) {
  const [size, setSize] = useState<TextureSize | null>(null);
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width !== size?.width || height !== size.height) setSize({ width, height });
  };
  return (
    <View
      testID={testID}
      style={[StyleSheet.absoluteFill, style]}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
    >
      {size && size.width > 0 && size.height > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>{children(size)}</Canvas>
      ) : null}
    </View>
  );
}
