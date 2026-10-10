import { useEffect } from 'react';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface SpinnerProps {
  /** Head colour. @default the theme's on-ink colour */
  readonly color?: string;
  /** Track colour. @default the theme's spinner track */
  readonly trackColor?: string;
  /** @default 16 */
  readonly size?: number;
}

/** The 16 pt loading ring (2.5 track, solid head) the loading pill shows beside its verb. */
export function Spinner({ color, trackColor, size }: SpinnerProps) {
  const t = usePremiumTheme();
  const side = size ?? t.size.spinner;
  const turn = useSharedValue(0);

  useEffect(() => {
    turn.set(
      withRepeat(
        withTiming(1, { duration: t.motion.spinnerTurnMs, easing: Easing.linear }),
        -1,
        false,
      ),
    );
    return () => cancelAnimation(turn);
  }, [turn, t.motion.spinnerTurnMs]);

  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }] }));
  const track = trackColor ?? t.color.spinnerTrack;

  return (
    <Animated.View
      accessible={false}
      style={[
        {
          width: side,
          height: side,
          borderRadius: side / 2,
          borderWidth: t.size.spinnerRing,
          borderColor: track,
          borderTopColor: color ?? t.color.onInk,
        },
        spin,
      ]}
    />
  );
}
