import { useEffect, useRef } from 'react';
import { Animated } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { useMotionMode } from '@/motion/motion-mode';

/** The drawn sticker; one drawn just now fades in briefly unless motion is reduced. */
export function StickerImage({
  uri,
  size,
  fade,
}: {
  readonly uri: string;
  readonly size: number;
  readonly fade: boolean;
}) {
  const [motionMode] = useMotionMode();
  const animate = fade && motionMode === 'full';
  const opacity = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return undefined;
    const fadeIn = Animated.timing(opacity, {
      toValue: 1,
      duration: tokens.motion.duration.fast,
      useNativeDriver: true,
    });
    fadeIn.start();
    return () => fadeIn.stop();
  }, [animate, opacity]);
  return (
    <Animated.Image
      source={{ uri }}
      style={{ width: size, height: size, opacity }}
      resizeMode="contain"
      accessible={false}
      fadeDuration={0}
      testID="sticker-image"
    />
  );
}
