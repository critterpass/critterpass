/**
 * The Pass+ night surface (9.10, 9.15, 9.17): a fixed themed ground that keeps its colours in light
 * and dark alike, with three gold sparkles, and the glass drawn on it. Values are the design's own;
 * they are a candidate `premium.night` token group.
 */
/* eslint-disable lingui/no-unlocalized-strings -- style values, never copy. */
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { NIGHT } from '../monetize-palette';

export { NIGHT };

const GLASS_RING = 'inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 0.5px rgba(255,255,255,0.11)';

const SPARKLES = [
  { top: '14%', left: '12%', size: 6, opacity: 0.7 },
  { top: '24%', left: '84%', size: 5, opacity: 0.5 },
  { top: '58%', left: '8%', size: 4, opacity: 0.4 },
] as const;

export function NightGround({
  children,
  style,
  sparkles = true,
}: {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
  /** The ground's own sparkles; off where a page scrolls text over them (it draws its own). */
  readonly sparkles?: boolean;
}) {
  return (
    <View
      style={[
        styles.ground,
        {
          experimental_backgroundImage: `radial-gradient(90% 50% at 50% 30%, ${NIGHT.top}, ${NIGHT.mid} 62%, ${NIGHT.bottom})`,
        },
        style,
      ]}
    >
      {(sparkles ? SPARKLES : []).map((s) => (
        <View
          key={`${s.top}-${s.left}`}
          pointerEvents="none"
          style={[
            styles.sparkle,
            { top: s.top, left: s.left, width: s.size, height: s.size, opacity: s.opacity },
          ]}
        />
      ))}
      {children}
    </View>
  );
}

/** Glass on the night ground: 8% white with a light top edge. */
export function NightGlass({
  children,
  style,
}: {
  readonly children?: ReactNode;
  readonly style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ backgroundColor: NIGHT.glass, boxShadow: GLASS_RING }, style]}>{children}</View>
  );
}

/**
 * Two sparkles in the clear space past a headline's last letter, laid out with the headline so
 * they never land on a word whatever the screen's height or the language's length.
 */
export function HeadlineSparkles() {
  return (
    <>
      <View pointerEvents="none" style={[styles.sparkle, styles.sparkleHigh]} />
      <View pointerEvents="none" style={[styles.sparkle, styles.sparkleLow]} />
    </>
  );
}

const styles = StyleSheet.create({
  sparkleHigh: { left: '100%', marginLeft: 22, top: 6, width: 6, height: 6, opacity: 0.7 },
  sparkleLow: { left: '100%', marginLeft: 48, bottom: 12, width: 4, height: 4, opacity: 0.45 },
  ground: { flex: 1, backgroundColor: NIGHT.mid },
  sparkle: { position: 'absolute', backgroundColor: NIGHT.gold, transform: [{ rotate: '45deg' }] },
});
