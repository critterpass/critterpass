import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { Row } from '../layout/Row';
import { Stack } from '../layout/Stack';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface RouteStop {
  readonly id: string;
  readonly name: string;
  /** "Days 2–4", "Day 4 · 02:51". */
  readonly dayLabel: string;
  /** Glows orange (the 02:51 start). */
  readonly highlight?: boolean;
}

export interface RouteRiderProps {
  readonly stops: readonly RouteStop[];
  /** "214 km". */
  readonly distance: string;
  /** Guide sticker riding the trail. */
  readonly rider?: ReactNode;
  /** Stops reached so far (the rider sits on the last reached stop). */
  readonly reached: number;
  readonly testID?: string;
}

const ROW = 44;

const useStyles = makeStyles((th) => ({
  trail: {
    position: 'absolute',
    start: th.space['10'] - 1,
    top: th.space['10'],
    bottom: th.space['10'],
    borderStartWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.action.primary,
  },
  row: { height: ROW, alignItems: 'center', gap: th.space['12'] },
  dot: {
    width: th.space['20'],
    height: th.space['20'],
    borderRadius: th.space['10'],
    borderWidth: th.space['4'],
  },
  rider: { position: 'absolute', start: -th.space['8'] },
}));

/** The trip's route as a stop list with the guide riding down it; reads as the ordered stops. */
export function RouteRider({ stops, distance, rider, reached, testID }: RouteRiderProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reduced = useReducedImpactMotion();
  const y = useSharedValue(0);
  const target = Math.max(0, Math.min(stops.length, reached) - 1) * ROW;
  useEffect(() => {
    y.value = reduced ? target : withTiming(target, { duration: tokens.motion.duration.slow });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- y is a stable shared value ref.
  }, [target, reduced]);
  const riderStyle = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const route = stops.map((stop) => `${stop.name} ${stop.dayLabel}`).join(', ');
  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="summary"
      accessibilityLabel={t({ id: 'common.recap.route', message: `Route, ${distance}: ${route}` })}
    >
      <View style={styles.trail} />
      <Stack>
        {stops.map((stop, index) => {
          const done = index < reached;
          const color = stop.highlight
            ? theme.semantic.state.warning
            : theme.semantic.action.primary;
          return (
            <Row key={stop.id} style={styles.row}>
              <View
                style={[
                  styles.dot,
                  { borderColor: color, backgroundColor: done ? color : theme.semantic.bg.base },
                ]}
              />
              <Text variant="title" style={{ flex: 1 }}>
                {stop.name}
              </Text>
              <Text
                variant="monoData"
                color={stop.highlight ? color : theme.semantic.text.secondary}
              >
                {stop.dayLabel}
              </Text>
            </Row>
          );
        })}
      </Stack>
      {rider ? <Animated.View style={[styles.rider, riderStyle]}>{rider}</Animated.View> : null}
    </View>
  );
}
