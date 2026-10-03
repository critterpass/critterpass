/**
 * The one label on a planning map: it pops in over the picked place or stop (7c-2 "TIRTA EMPUL ·
 * SAVED BY ALEX + RIN" on paper, 7a-2 "CAMPUHAN RIDGE · STOP 3 · 14:00" in the day's colour).
 * Nothing else on the map carries a name, so it is a single `Marker`: a live view on both
 * platforms (an Android view annotation is a snapshot a style swap drops). Pop-in is the
 * prototype's 340 ms cubic-bezier(.3, 1.5, .5, 1); reduced motion fades it in.
 */
import { tokens } from '@cp/design-tokens';
import { Marker, type LngLat } from '@maplibre/maplibre-react-native';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Text } from '../../text/Text';
import { makeStyles } from '../../theme';

/** The prototype's label pop (docs/design-system.md, planning kit). */
export const LABEL_POP_MS = tokens.motion.duration.base;
const labelPop = bezierEasing([0.3, 1.5, 0.5, 1]);
const POINTER = 7;

export interface MapLabelProps {
  readonly lngLat: LngLat;
  readonly title: string;
  readonly subtitle?: string | undefined;
  /** Paper for a place; a day's colour for a stop. */
  readonly tone?: 'paper' | { readonly fill: string } | undefined;
  /** An icon disc before the title (7c-2's category). */
  readonly leading?: ReactNode | undefined;
  /** How far above the point the pointer's tip sits (the dot's radius). */
  readonly lift?: number | undefined;
  readonly testID?: string | undefined;
}

const useStyles = makeStyles((t) => ({
  column: { alignItems: 'center' },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    paddingVertical: t.space['8'],
    paddingHorizontal: t.space['14'],
    borderRadius: t.radius.lg,
    maxWidth: 260,
  },
  text: { flexShrink: 1 },
  pointer: {
    width: 0,
    height: 0,
    borderStartWidth: POINTER,
    borderEndWidth: POINTER,
    borderTopWidth: POINTER,
    borderStartColor: 'transparent',
    borderEndColor: 'transparent',
  },
}));

export function MapLabel({
  lngLat,
  title,
  subtitle,
  tone = 'paper',
  leading,
  lift = 16,
  testID = 'map-label',
}: MapLabelProps) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const shown = useSharedValue(0);
  const fill = tone === 'paper' ? tokens.color.paper.base : tone.fill;
  const ink = tone === 'paper' ? tokens.color.paper.ink : tokens.color.paper.bright;
  const subInk = tone === 'paper' ? tokens.color.paper.muted : tokens.color.paper.bright;

  const [lng, lat] = lngLat;
  // A new place or stop pops in again; a re-render of the same one does not.
  useEffect(() => {
    shown.value = 0;
    shown.value = withTiming(1, {
      duration: reduced ? tokens.motion.duration.fast : LABEL_POP_MS,
      ...(reduced ? {} : { easing: labelPop }),
    });
  }, [lng, lat, reduced, shown, title]);

  const popStyle = useAnimatedStyle(() =>
    reduced
      ? { opacity: shown.value }
      : {
          opacity: Math.min(1, shown.value * 2),
          transform: [{ translateY: (1 - shown.value) * 8 }, { scale: 0.6 + 0.4 * shown.value }],
        },
  );

  return (
    <Marker lngLat={lngLat} anchor="bottom" offset={[0, -lift]}>
      <Animated.View style={[styles.column, popStyle]} testID={testID} pointerEvents="none">
        <View style={[styles.bubble, { backgroundColor: fill }]}>
          {leading}
          <View style={styles.text}>
            <Text variant="title" color={ink} numberOfLines={1}>
              {title}
            </Text>
            {subtitle === undefined ? null : (
              <Text variant="label" color={subInk} numberOfLines={1}>
                {subtitle}
              </Text>
            )}
          </View>
        </View>
        <View style={[styles.pointer, { borderTopColor: fill }]} />
      </Animated.View>
    </Marker>
  );
}
