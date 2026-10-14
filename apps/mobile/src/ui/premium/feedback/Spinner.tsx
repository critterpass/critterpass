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
  /**
   * What it spins on: the page's ground or a card (`ground`, an ink head), or an ink pill, a photo
   * or a dark viewer (`ink`, a white head). @default 'ground'
   */
  readonly surface?: 'ground' | 'ink';
  /** Head colour. @default the surface's */
  readonly color?: string;
  /** Track colour. @default the surface's */
  readonly trackColor?: string;
  /** @default 16 */
  readonly size?: number;
}

/** The 16 pt loading ring (2.5 track, solid head) the loading pill shows beside its verb. */
export function Spinner({ surface = 'ground', color, trackColor, size }: SpinnerProps) {
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
  // A white head on the ground vanished (a drafting step in progress, a search row loading).
  const onInk = surface === 'ink';
  const head = color ?? (onInk ? t.color.onInk : t.color.ink);
  const track = trackColor ?? (onInk ? t.color.spinnerTrack : t.color.control);

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
          borderTopColor: head,
        },
        spin,
      ]}
    />
  );
}
