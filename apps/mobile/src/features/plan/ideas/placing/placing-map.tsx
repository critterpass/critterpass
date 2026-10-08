/**
 * The placing screen's little map (7h-6): the ideas as cream pins where they are, each popping into
 * a numbered stop in its day's colour as Tokek places it, and Tokek hopping in the middle. Drawn
 * as plain views over a dark panel (at most eight pins move); reduced motion fades instead.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
  ZoomIn,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { useMotionMode } from '@/motion/motion-mode';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { PlanGuideSticker } from '../../plan-guide';

export const MAP_HEIGHT = 340;
const PIN = 28;
const PAD = 28;
const MAX_PINS = 8;
/** A placed pin remounts under its own key, so its pop plays. */
// eslint-disable-next-line lingui/no-unlocalized-strings
const stopKey = (id: string) => `${id}:stop`;

const useStyles = makeStyles((t) => ({
  panel: {
    height: MAP_HEIGHT,
    borderRadius: t.radius.lg,
    borderWidth: 1,
    borderColor: t.semantic.border.decorative,
    backgroundColor: t.semantic.bg.raised,
    overflow: 'hidden',
  },
  pin: {
    position: 'absolute',
    width: PIN,
    height: PIN,
    borderRadius: PIN / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guide: { position: 'absolute', alignSelf: 'center', top: MAP_HEIGHT / 2 - 40 },
}));

export interface MapPin {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly icon: DoodleName;
  /** Placed: its number and its day's colour. */
  readonly stop: { readonly number: number; readonly color: string } | null;
}

/** Pins spread over the panel's width and height, north up. */
export function pinSpots(
  pins: readonly MapPin[],
  width: number,
): { readonly pin: MapPin; readonly x: number; readonly y: number }[] {
  const shown = pins.slice(0, MAX_PINS);
  const lats = shown.map((pin) => pin.lat);
  const lngs = shown.map((pin) => pin.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const spanX = Math.max(maxLng - minLng, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const innerW = Math.max(width - 2 * PAD - PIN, 1);
  const innerH = MAP_HEIGHT - 2 * PAD - PIN;
  return shown.map((pin) => ({
    pin,
    x: PAD + ((pin.lng - minLng) / spanX) * innerW,
    y: PAD + ((maxLat - pin.lat) / spanY) * innerH,
  }));
}

function HoppingGuide({ reduced }: { readonly reduced: boolean }) {
  const hop = useSharedValue(0);
  const hopping = useIdleLoopRunning(!reduced);
  useEffect(() => {
    if (!hopping) {
      hop.set(0);
      return undefined;
    }
    hop.set(
      withRepeat(
        withSequence(
          withTiming(-10, { duration: tokens.motion.duration.fast }),
          withTiming(0, { duration: tokens.motion.duration.fast }),
        ),
        -1,
      ),
    );
    return () => cancelAnimation(hop);
  }, [hop, hopping]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: hop.value }] }));
  return (
    <Animated.View style={style}>
      <PlanGuideSticker size={72} />
    </Animated.View>
  );
}

export function PlacingMap({
  pins,
  width,
}: {
  readonly pins: readonly MapPin[];
  readonly width: number;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const [motionMode] = useMotionMode();
  const reduced = motionMode !== 'full';
  return (
    <View style={styles.panel} testID="plan-placing-map">
      {pinSpots(pins, width).map(({ pin, x, y }) =>
        pin.stop === null ? (
          <View
            key={pin.id}
            style={[styles.pin, { left: x, top: y, backgroundColor: theme.color.paper.base }]}
          >
            <Icon name={pin.icon} size={16} color={theme.color.paper.ink} decorative />
          </View>
        ) : (
          <Animated.View
            key={stopKey(pin.id)}
            entering={reduced ? FadeIn.duration(tokens.motion.duration.fast) : ZoomIn.springify()}
            style={[styles.pin, { left: x, top: y, backgroundColor: pin.stop.color }]}
            testID={`plan-placing-stop-${String(pin.stop.number)}`}
          >
            <Text variant="label" color={theme.color.paper.ink}>
              {String(pin.stop.number)}
            </Text>
          </Animated.View>
        ),
      )}
      <View style={styles.guide} pointerEvents="none">
        <HoppingGuide reduced={reduced} />
      </View>
    </View>
  );
}
