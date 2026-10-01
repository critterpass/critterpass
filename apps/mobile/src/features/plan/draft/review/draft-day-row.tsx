/**
 * One day of the private draft: number tile in the guide's colour, the day's title, "FRI · first
 * stop at 11:20, second stop" (or a lottery date, or nothing booked on purpose), the avatars of
 * whoever's must-do lands on it, else BOOKED when a wallet booking sits on the day, or an OPTIONAL
 * tag. Rows drop in one after another (opacity 0,
 * ty −12 → 0, 400 ms, from 520 ms, 80 ms apart), then the owners' avatars stamp on. A kept redraft
 * flaps its title in place.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { t } from '@lingui/core/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { patterns } from '@/motion';
import { bezierEasing } from '@/motion/easing';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { PressScale } from '@/ui/press/PressScale';
import { StatusChip } from '@/ui/chips/StatusChip';
import { Avatar } from '@/ui/people/Avatar';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { clock, shortDate, weekday } from '../data/format';
import type { ReviewDay } from '../data/version';

export const ROW_BASE_DELAY_MS = 520;
const ROW_STAGGER_MS = 80;
const DROP_MS = 400;
const STAMP_MS = 280;
const TILE = 32;
const standard = bezierEasing(tokens.motion.easing.standard);
const back = bezierEasing(tokens.motion.easing.back);

const useStyles = makeStyles((th) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['10'],
    paddingHorizontal: th.space['14'],
  },
  divider: { borderTopWidth: 1, borderTopColor: th.color.divider },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: th.radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, gap: th.space['2'] },
  owners: { flexDirection: 'row' },
  tag: {
    borderWidth: 1,
    borderColor: th.semantic.border.control,
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['10'],
    paddingVertical: th.space['4'],
  },
}));

function useDrop(index: number) {
  const reduced = useReducedImpactMotion();
  const y = useSharedValue(reduced ? 0 : -12);
  const opacity = useSharedValue(0);
  useEffect(() => {
    const delay = ROW_BASE_DELAY_MS + index * ROW_STAGGER_MS;
    opacity.value = withDelay(delay, withTiming(1, { duration: DROP_MS, easing: standard }));
    if (!reduced)
      y.value = withDelay(delay, withTiming(0, { duration: DROP_MS, easing: standard }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [index, reduced]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
}

function useAvatarStamp(index: number) {
  const reduced = useReducedImpactMotion();
  const scale = useSharedValue(reduced ? 1 : 1.6);
  const opacity = useSharedValue(0);
  useEffect(() => {
    const delay = ROW_BASE_DELAY_MS + index * ROW_STAGGER_MS + DROP_MS;
    opacity.value = withDelay(delay, withTiming(1, { duration: STAMP_MS / 2 }));
    if (!reduced)
      scale.value = withDelay(delay, withTiming(1, { duration: STAMP_MS, easing: back }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [index, reduced]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }] }));
}

/** "FRI · Nishiki Market at 11:20, Gion" and its variants, in the viewer's language. */
export function dayDetail(locale: string, day: ReviewDay): string {
  const wd = upper(weekday(locale, day.date), locale);
  if (day.lottery !== null) {
    const date = shortDate(locale, day.lottery.date);
    const first = day.stops[0]?.name ?? '';
    return t({ id: 'planDraft.day.lottery', message: `${wd} · ${first}, lottery result ${date}` });
  }
  const [first, second] = day.stops;
  if (first === undefined) {
    return t({ id: 'planDraft.day.free', message: `${wd} · Nothing booked, on purpose` });
  }
  const name = first.name;
  const at = clock(locale, first.startsAt, first.tz);
  if (second === undefined) {
    return t({ id: 'planDraft.day.one', message: `${wd} · ${name} at ${at}` });
  }
  const next = second.name;
  return t({ id: 'planDraft.day.two', message: `${wd} · ${name} at ${at}, ${next}` });
}

export interface DraftDayRowProps {
  readonly day: ReviewDay;
  readonly index: number;
  readonly locale: string;
  readonly colour: string;
  readonly onPress?: (() => void) | undefined;
}

export function DraftDayRow({ day, index, locale, colour, onPress }: DraftDayRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const drop = useDrop(index);
  const stamp = useAvatarStamp(index);
  const { displayValue: title, style: flap } = patterns.useFlap({ value: day.title });
  const detail = dayDetail(locale, day);
  const n = day.dayNo;
  const optional = t({ id: 'planDraft.day.optional', message: 'Optional' });
  const closed = t({
    id: 'planDraft.day.closedNote',
    message: 'Something here is closed that day',
  });
  // The same word and chip the trip plan puts on a day that holds a booking.
  const booked = t({ id: 'plan.overview.chip.booked', message: 'Booked' });
  const label = [
    t({ id: 'planDraft.day.a11y', message: `Day ${n}` }),
    day.title,
    detail,
    day.booked === true ? booked : undefined,
    day.optional ? optional : undefined,
    day.closed ? closed : undefined,
    ...day.owners.map((owner) => owner.name),
  ]
    .filter(Boolean)
    .join(', ');
  const body = (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: colour }]}>
        <Text variant="title" color={theme.semantic.text.onAccent}>
          {String(n)}
        </Text>
      </View>
      <View style={styles.text}>
        <Animated.View style={flap}>
          <Text variant="title" numberOfLines={2}>
            {title}
          </Text>
        </Animated.View>
        <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={2}>
          {detail}
        </Text>
        {day.closed ? (
          <Text variant="caption" color={theme.semantic.state.warning}>
            {closed}
          </Text>
        ) : null}
      </View>
      {day.owners.length > 0 ? (
        <Animated.View style={[styles.owners, stamp]}>
          {day.owners.map((owner) => (
            <Avatar
              key={owner.uid}
              name={owner.name}
              joinIndex={owner.joinIndex}
              size="sm"
              decorative
            />
          ))}
        </Animated.View>
      ) : day.booked === true ? (
        <StatusChip
          status="booked"
          label={upper(booked, locale)}
          testID={`draft-day-booked-${n}`}
        />
      ) : day.optional ? (
        <View style={styles.tag}>
          <Text variant="label" color={theme.semantic.text.secondary}>
            {optional}
          </Text>
        </View>
      ) : null}
    </View>
  );
  return (
    <Animated.View style={[index > 0 ? styles.divider : null, drop]} testID={`draft-day-${n}`}>
      {onPress === undefined ? (
        <View accessible accessibilityLabel={label}>
          {body}
        </View>
      ) : (
        <PressScale onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
          {body}
        </PressScale>
      )}
    </Animated.View>
  );
}
