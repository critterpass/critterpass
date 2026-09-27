import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import Animated from 'react-native-reanimated';

import { useSheen } from '@/motion/patterns/sheen';

import { makeStyles } from '../theme';
import { TEXTURE } from './texture-tokens';

const useStyles = makeStyles(() => ({
  clip: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  layer: { ...StyleSheet.absoluteFill, transformOrigin: 'left' },
  band: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -1.5 * TEXTURE.sheen.width,
    width: TEXTURE.sheen.width,
    backgroundColor: TEXTURE.sheen.color,
    transform: [{ skewX: `${TEXTURE.sheen.skew}deg` }],
  },
}));

/**
 * `tex.sheen`: the light band sweeping across primary CTAs every 3.6 s, clipped to its parent and
 * parked hidden under reduced motion. The motion pattern animates a 0–1 fraction; the outer layer
 * scales that fraction to the measured travel and the inner layer undoes the scale for the band.
 */
export function Sheen() {
  const styles = useStyles();
  const [width, setWidth] = useState(0);
  const sweep = useSheen();
  const travel = width + 3 * TEXTURE.sheen.width;
  const onLayout = (event: LayoutChangeEvent) => setWidth(event.nativeEvent.layout.width);
  return (
    <View
      style={styles.clip}
      pointerEvents="none"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      testID="texture-sheen"
    >
      {width > 0 ? (
        <View style={[styles.layer, { transform: [{ scaleX: travel }] }]}>
          <Animated.View style={[styles.layer, sweep]}>
            <View style={[styles.layer, { transform: [{ scaleX: 1 / travel }] }]}>
              <View style={styles.band} />
            </View>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}
