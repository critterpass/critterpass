/**
 * One briefing line (3k-1): the icon, the guide's sentence and its chip. DONE slides the line off
 * with its check; NUDGE flaps to SENT; SET flaps to SET ✓; OPEN follows the link.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useFlap } from '@/motion/patterns/flap';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Icon } from '@/ui/icons/Icon';
import type { DoodleName } from '@/ui/icons/generated';
import { Row } from '@/ui/layout/Row';
import { PressScale } from '@/ui/press/PressScale';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { BriefingLine } from './briefing-model';

const ICONS: Readonly<Record<string, DoodleName>> = {
  ticket: 'ticket',
  plane: 'plane',
  wallet: 'wallet',
  alarm: 'bell',
  key: 'lock',
  vote: 'star',
  chat: 'chat',
  sun: 'sun',
  bag: 'spark',
};

const useStyles = makeStyles((th) => ({
  row: { paddingVertical: th.space['12'] },
  divider: { borderTopWidth: 1, borderTopColor: th.color.ink['850'] + '26' },
  chip: {
    minHeight: th.space['24'] + th.space['4'],
    borderRadius: th.space['16'],
    paddingHorizontal: th.space['10'],
    justifyContent: 'center',
  },
}));

function chipLabel(line: BriefingLine): string {
  switch (line.action) {
    case 'done':
      return t({ id: 'trip.briefing.done', message: 'Done' });
    case 'nudge':
      return line.status === 'nudged'
        ? t({ id: 'trip.briefing.sent', message: 'Sent' })
        : t({ id: 'trip.briefing.nudge', message: 'Nudge' });
    case 'set':
      return line.status === 'set'
        ? t({ id: 'trip.briefing.setDone', message: 'Set ✓' })
        : t({ id: 'trip.briefing.set', message: 'Set' });
    case 'open':
      return t({ id: 'trip.briefing.open', message: 'Open' });
  }
}

export interface BriefingRowProps {
  readonly line: BriefingLine;
  readonly first: boolean;
  readonly onAct: (line: BriefingLine) => void;
}

export function BriefingRow({ line, first, onAct }: BriefingRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const reduced = useReducedImpactMotion();
  const label = upper(chipLabel(line), locale);
  const flap = useFlap({ value: label });
  const leaving = line.action === 'done' && line.status === 'done';
  const [gone, setGone] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const x = useSharedValue(0);
  const height = useSharedValue(-1);
  useEffect(() => {
    if (!leaving || size.width === 0) return;
    const exit = reduced ? 0 : tokens.motion.duration.base;
    x.value = withTiming(reduced ? 0 : size.width * 1.1, { duration: exit });
    height.value = size.height;
    height.value = withDelay(
      exit,
      withTiming(0, { duration: tokens.motion.duration.base }, (finished) => {
        'worklet';
        if (finished) scheduleOnRN(setGone, true);
      }),
    );
  }, [leaving, reduced, size.width, size.height, x, height]);
  const slide = useAnimatedStyle(() => ({
    opacity: size.width === 0 ? 1 : 1 - Math.min(1, x.value / (size.width * 1.1)),
    transform: [
      { translateX: x.value },
      { rotate: `${(x.value / Math.max(1, size.width)) * 4}deg` },
    ],
  }));
  const collapse = useAnimatedStyle(() =>
    height.value < 0 ? {} : { height: height.value, overflow: 'hidden' },
  );
  if (gone) return null;
  const tone = {
    done: { bg: theme.color.green.base, fg: theme.semantic.text.onAccent },
    nudge: { bg: theme.color.ink['850'], fg: theme.color.yellow },
    set: { bg: theme.color.paper.warm, fg: theme.semantic.text.onAccent },
    open: { bg: theme.color.paper.warm, fg: theme.semantic.text.onAccent },
  }[line.action];
  const acted = line.status !== 'open';
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height: h } = event.nativeEvent.layout;
    if (size.width === 0) setSize({ width, height: h });
  };
  return (
    <Animated.View style={collapse} onLayout={onLayout} testID={`trip-briefing-line-${line.id}`}>
      <Animated.View style={slide}>
        <Row gap="12" align="center" style={[styles.row, first ? null : styles.divider]}>
          <Icon
            name={leaving ? 'check' : (ICONS[line.icon] ?? 'sun')}
            size={22}
            decorative
            color={theme.semantic.text.onAccent}
          />
          <View style={{ flex: 1 }}>
            <Text variant="body" color={theme.semantic.text.onAccent}>
              {line.text}
            </Text>
          </View>
          <PressScale
            accessibilityRole="button"
            accessibilityLabel={`${chipLabel(line)}: ${line.text}`}
            accessibilityState={{ disabled: acted && line.action !== 'open' }}
            disabled={acted && line.action !== 'open'}
            onPress={() => onAct(line)}
            widthClass="narrow"
            hitSlop={theme.space['8']}
            testID={`trip-briefing-chip-${line.action}`}
            style={[styles.chip, { backgroundColor: tone.bg }]}
          >
            <Animated.View style={flap.style}>
              <Text variant="label" color={tone.fg}>
                {flap.displayValue}
              </Text>
            </Animated.View>
          </PressScale>
        </Row>
      </Animated.View>
    </Animated.View>
  );
}
