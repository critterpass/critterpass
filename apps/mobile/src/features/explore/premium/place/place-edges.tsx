/**
 * The place page's two soft edges. At the top, once the page scrolls past its photo, the ground
 * fades in behind the status bar and the glass circles, so the name never runs under them. At the
 * foot, the page fades out behind the Add dock, so a section never sits half under the button.
 * Neither takes touches.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradient parts, never copy. */
import { StyleSheet } from 'react-native';
import Animated, { interpolate, useAnimatedStyle, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '@/ui/premium';

/** A colour at zero alpha, so the fade runs from the ground's own hue, not from black. */
function clearOf(colour: string): string {
  return /^#[0-9a-f]{6}$/i.test(colour) ? `${colour}00` : 'transparent';
}

/** The glass circles' row and the air under it that the top fade covers. */
const HEADER_ROW = 44;
const HEADER_AIR = 20;
/** How far the page scrolls while the top fade comes in. */
const FADE_IN = 40;

export function PlaceTopEdge({
  y,
  solidFrom,
}: {
  readonly y: SharedValue<number>;
  readonly solidFrom: number;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const height = insets.top + th.space.gap4 + HEADER_ROW + HEADER_AIR;
  const shown = useAnimatedStyle(() => ({
    opacity: interpolate(
      y.value,
      [solidFrom - height - FADE_IN, solidFrom - height],
      [0, 1],
      'clamp',
    ),
  }));
  const ground = th.color.ground;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.top,
        {
          height,
          experimental_backgroundImage: `linear-gradient(180deg, ${ground} 70%, ${clearOf(ground)})`,
        },
        shown,
      ]}
    />
  );
}

/** Behind the dock: clear above the button, the ground from its middle down. */
export function PlaceDockEdge({ dockHeight }: { readonly dockHeight: number }) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const ground = th.color.ground;
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.bottom,
        {
          height: insets.bottom + th.space.gap12 + dockHeight + HEADER_AIR,
          experimental_backgroundImage: `linear-gradient(0deg, ${ground} 55%, ${clearOf(ground)})`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
