/**
 * The page fading out behind a floating dock (Add, Pitch to the crew, Add as a day trip): clear
 * above the dock's top, the ground from its middle down, so a section never sits half under the
 * button with a hard edge. It takes no touches.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradient parts, never copy. */
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { usePremiumTheme } from '@/ui/premium';

/** How far above the dock the fade begins. */
const FADE_ABOVE = 20;

/** `dockHeight` is the dock's own height above its bottom offset (`gap` over the home bar). */
export function DockFade({
  dockHeight,
  gap,
}: {
  readonly dockHeight: number;
  readonly gap: number;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const ground = th.color.ground;
  const height = insets.bottom + gap + dockHeight + FADE_ABOVE;
  const solid = Math.round(((insets.bottom + gap + dockHeight / 2) / height) * 100);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.fade,
        {
          height,
          experimental_backgroundImage: `linear-gradient(0deg, ${ground} ${String(solid)}%, ${ground}00)`,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  fade: { position: 'absolute', bottom: 0, left: 0, right: 0 },
});
