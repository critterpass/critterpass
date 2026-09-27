import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useLoop } from '@/motion/use-loop';

import { Row } from '../layout/Row';
import { Text } from '../text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '../theme';

export interface Seat {
  readonly id: string;
  readonly name: string;
  readonly avatar: ReactNode;
}

export interface SeatsRowProps {
  readonly seats: readonly Seat[];
  /** Seats on the current plan (6 on free crews). */
  readonly capacity: number;
  /** Someone waiting beyond capacity: their seat pulses dashed yellow. */
  readonly waiting?: Seat;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  seat: {
    width: MIN_TOUCH_TARGET,
    height: MIN_TOUCH_TARGET,
    borderRadius: MIN_TOUCH_TARGET / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  waiting: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.action.primary,
  },
}));

/** Crew seats filling left to right; the extra person's seat pulses dashed past the limit. */
export function SeatsRow({ seats, capacity, waiting, testID }: SeatsRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const pulse = useLoop('pulse', { active: waiting !== undefined });
  const taken = Math.min(seats.length, capacity);
  const waitingName = waiting?.name ?? '';
  const seatNumber = capacity + 1;
  const summary = [
    t({ id: 'common.monetize.seatsTaken', message: `${taken} of ${capacity} seats taken` }),
    waiting
      ? t({
          id: 'common.monetize.seatWaiting',
          message: `${waitingName} waiting for seat ${seatNumber}`,
        })
      : undefined,
  ]
    .filter(Boolean)
    .join(', ');
  return (
    <Row
      gap="6"
      wrap
      testID={testID}
      accessible
      accessibilityRole="text"
      accessibilityLabel={summary}
    >
      {Array.from({ length: capacity }, (_, index) => {
        const seat = seats[index];
        return (
          <View key={seat?.id ?? `empty${index}`} style={[styles.seat, seat ? null : styles.empty]}>
            {seat?.avatar}
          </View>
        );
      })}
      {waiting ? (
        <Animated.View style={[styles.seat, styles.waiting, pulse]}>
          {waiting.avatar ?? (
            <Text variant="label" color={theme.semantic.action.primary}>
              {waitingName.slice(0, 1)}
            </Text>
          )}
        </Animated.View>
      ) : null}
    </Row>
  );
}
