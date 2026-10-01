/**
 * The estimated journey (3h-3's draining bar, made truthful): after "I'm in the car" the bar fills
 * by elapsed time against the driving estimate and says so; it knows nothing about where the car
 * is. At the end it offers to log the ride.
 */
import { useLingui } from '@lingui/react/macro';
import * as Haptics from 'expo-haptics';
import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { journeyProgress } from './model';

export interface JourneyProgressProps {
  /** Driving minutes for the leg; without them there is nothing to estimate. */
  readonly minutes: number | null;
  readonly startedAt: number | null;
  readonly onStart: () => void;
  readonly onLog: () => void;
  readonly now?: () => number;
}

const useStyles = makeStyles((t) => ({
  track: { height: 8, borderRadius: 4, backgroundColor: t.semantic.bg.control, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4, backgroundColor: t.color.yellow },
}));

export function JourneyProgress({
  minutes,
  startedAt,
  onStart,
  onLog,
  now = Date.now,
}: JourneyProgressProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  const [nowMs, setNowMs] = useState(now());
  const arrived = useRef(false);
  const progress =
    startedAt !== null && minutes !== null ? journeyProgress(startedAt, minutes, nowMs) : null;
  const done = progress !== null && progress.share >= 1;
  useEffect(() => {
    if (startedAt === null || done) return undefined;
    const timer = setInterval(() => setNowMs(now()), 5000);
    return () => clearInterval(timer);
  }, [startedAt, done, now]);
  useEffect(() => {
    if (done && !arrived.current) {
      arrived.current = true;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
        () => undefined,
      );
    }
  }, [done]);
  if (minutes === null) return null;
  if (progress === null) {
    return (
      <PillButton
        variant="secondary"
        size="sm"
        label={t({ id: 'suppliers.journey.start', message: "I'm in the car" })}
        onPress={onStart}
        testID="getting-around-in-car"
      />
    );
  }
  const left = progress.minutesLeft;
  return (
    <Stack gap="8" testID={done ? 'getting-around-arrived' : 'getting-around-journey'}>
      <View style={styles.track}>
        <View style={[styles.fill, { width: `${Math.round((1 - progress.share) * 100)}%` }]} />
      </View>
      <Row gap="10" align="center" style={{ justifyContent: 'space-between' }}>
        <Text variant="bodySm" color={theme.semantic.text.secondary} style={{ flexShrink: 1 }}>
          {done
            ? t({ id: 'suppliers.journey.there', message: 'You should be about there · estimate' })
            : t({ id: 'suppliers.journey.left', message: `About ${left} min to go · estimate` })}
        </Text>
        {done ? (
          <PillButton
            size="sm"
            variant="secondary"
            label={t({ id: 'suppliers.journey.log', message: 'Log it' })}
            onPress={onLog}
            testID="getting-around-log-arrived"
          />
        ) : null}
      </Row>
    </Stack>
  );
}
