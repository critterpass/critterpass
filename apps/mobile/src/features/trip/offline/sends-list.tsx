/**
 * SENDS WHEN YOU'RE BACK (3k-4): every write still in the upload queue, oldest first, each with a
 * clock that drops in. Back online, each clock ticks to a check as its op is acknowledged (350 ms
 * then 330 ms apart within one batch of acks) and its label flaps to SENT. Tapping a line that has
 * not sent opens it (cancel, or change a chat message's text).
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import type { MessageDescriptor } from '@lingui/core';
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { Pressable, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useFlap } from '@/motion/patterns/flap';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Card } from '@/ui/cards/Card';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export const TICK_FIRST_MS = 350;
export const TICK_STEP_MS = 330;

export interface SendsLine {
  readonly opId: string;
  readonly summary: MessageDescriptor;
  readonly sent: boolean;
  readonly tickIndex: number;
}

const useStyles = makeStyles((th) => ({
  row: { paddingVertical: th.space['10'] },
  divider: { borderTopWidth: 1, borderTopColor: th.semantic.bg.control },
  clock: {
    width: th.space['20'],
    height: th.space['20'],
    borderRadius: th.space['20'],
    borderWidth: th.space['2'],
    alignItems: 'center',
    justifyContent: 'center',
  },
}));

function Line({
  line,
  first,
  onOpen,
}: {
  readonly line: SendsLine;
  readonly first: boolean;
  readonly onOpen: (opId: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { i18n, t } = useLingui();
  const reduced = useReducedImpactMotion();
  const drop = useSharedValue(reduced ? 1 : 0);
  const tick = useSharedValue(line.sent ? 1 : 0);
  useEffect(() => {
    drop.value = reduced ? 1 : withSpring(1);
  }, [drop, reduced]);
  useEffect(() => {
    if (!line.sent) return;
    const delay = reduced ? 0 : TICK_FIRST_MS + TICK_STEP_MS * line.tickIndex;
    tick.value = withDelay(delay, withTiming(1, { duration: tokens.motion.duration.fast }));
  }, [line.sent, line.tickIndex, reduced, tick]);
  const clockStyle = useAnimatedStyle(() => ({
    opacity: 1 - tick.value,
    transform: [{ translateY: (1 - drop.value) * -12 }, { scale: 1 - tick.value * 0.4 }],
  }));
  const checkStyle = useAnimatedStyle(() => ({
    opacity: tick.value,
    transform: [{ scale: 0.6 + tick.value * 0.4 }],
  }));
  const text = i18n._(line.summary);
  const sent = t({ id: 'trip.offline.sent', message: 'Sent' });
  const flap = useFlap({ value: line.sent ? upper(sent, i18n.locale) : '' });
  return (
    <Pressable
      disabled={line.sent}
      onPress={() => onOpen(line.opId)}
      accessibilityRole="button"
      accessibilityLabel={line.sent ? `${text}, ${sent}` : text}
      testID={`trip-offline-send-${line.opId}`}
    >
      <Row gap="12" align="center" style={[styles.row, first ? null : styles.divider]}>
        <View>
          <Animated.View style={[styles.clock, { borderColor: theme.color.yellow }, clockStyle]}>
            <View style={{ width: 2, height: 6, backgroundColor: theme.color.yellow }} />
          </Animated.View>
          <Animated.View style={[{ position: 'absolute' }, checkStyle]}>
            <Icon name="check" size={20} decorative color={theme.semantic.state.success} />
          </Animated.View>
        </View>
        <Text variant="body" style={{ flex: 1 }}>
          {text}
        </Text>
        <Animated.View style={flap.style}>
          <Text variant="label" color={theme.semantic.state.success}>
            {flap.displayValue}
          </Text>
        </Animated.View>
      </Row>
    </Pressable>
  );
}

export function SendsList({
  lines,
  onOpen,
}: {
  readonly lines: readonly SendsLine[];
  readonly onOpen: (opId: string) => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  if (lines.length === 0) return null;
  return (
    <Card testID="trip-offline-sends">
      <Stack>
        <Text variant="eyebrow" color={theme.color.yellow} accessibilityRole="header">
          {upper(t({ id: 'trip.offline.sendsTitle', message: "Sends when you're back" }), locale)}
        </Text>
        {lines.map((line, index) => (
          <Line key={line.opId} line={line} first={index === 0} onOpen={onOpen} />
        ))}
      </Stack>
    </Card>
  );
}
