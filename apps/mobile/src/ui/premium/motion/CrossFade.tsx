import type { ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { usePremiumReducedMotion } from './reduced-motion';
import { enterTransition, exitTransition } from './springs';

export interface CrossFadeProps {
  /** Changing the key swaps the content: the old fades out as the new fades in. */
  readonly swapKey: string;
  readonly children: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}

/**
 * A content swap (a value, a label, a state) as a cross-fade on Smooth; under Reduce Motion it is the
 * 150 ms fade every move becomes.
 */
export function CrossFade({ swapKey, children, style }: CrossFadeProps) {
  const reduced = usePremiumReducedMotion();
  return (
    <Animated.View
      key={swapKey}
      entering={enterTransition(reduced)}
      exiting={exitTransition(reduced)}
      style={style}
    >
      {children}
    </Animated.View>
  );
}
