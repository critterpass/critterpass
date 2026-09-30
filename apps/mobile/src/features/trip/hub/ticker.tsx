/**
 * The crew's activity ticker (3k-1): a 36 pt strip scrolling the latest events right to left over
 * 22 s, the content drawn twice so the loop never shows a gap; an event that arrives joins on the
 * next cycle. Tapping an event opens what it is about. Hidden when there is nothing yet; still
 * (the first events, no scroll) with reduced motion.
 */
import { upper } from '@cp/i18n';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { Row } from '@/ui/layout/Row';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export const TICKER_CYCLE_MS = 22_000;
export const TICKER_HEIGHT = 36;

export interface TickerEvent {
  readonly id: string;
  readonly text: string;
  readonly onPress?: () => void;
}

const useStyles = makeStyles((th) => ({
  strip: {
    height: TICKER_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'center',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: th.semantic.bg.control,
    backgroundColor: th.semantic.bg.sunken,
  },
  dot: {
    width: th.space['6'],
    height: th.space['6'],
    borderRadius: th.space['6'],
    backgroundColor: th.color.pink,
    marginHorizontal: th.space['16'],
  },
}));

function Run({
  events,
  onWidth,
}: {
  readonly events: readonly TickerEvent[];
  readonly onWidth?: (w: number) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  return (
    <Row
      align="center"
      onLayout={(event: LayoutChangeEvent) => onWidth?.(event.nativeEvent.layout.width)}
    >
      {events.map((event) => (
        <Row key={event.id} align="center">
          <Pressable
            accessibilityRole={event.onPress === undefined ? 'text' : 'link'}
            onPress={event.onPress}
            disabled={event.onPress === undefined}
            hitSlop={theme.space['8']}
          >
            <Text variant="label" color={theme.semantic.text.primary} singleLine>
              {upper(event.text, locale)}
            </Text>
          </Pressable>
          <View style={styles.dot} />
        </Row>
      ))}
    </Row>
  );
}

export function Ticker({ events }: { readonly events: readonly TickerEvent[] }) {
  const styles = useStyles();
  const reduced = useReducedImpactMotion();
  const [width, setWidth] = useState(0);
  // New events join on the next cycle, never mid-scroll.
  const [shown, setShown] = useState(events);
  const latest = useRef(events);
  useEffect(() => {
    latest.current = events;
  }, [events]);
  const x = useSharedValue(0);
  useEffect(() => {
    if (reduced || width === 0) {
      cancelAnimation(x);
      x.value = 0;
      return undefined;
    }
    x.value = 0;
    x.value = withRepeat(
      withTiming(-width, { duration: TICKER_CYCLE_MS, easing: Easing.linear }),
      -1,
    );
    const timer = setInterval(() => setShown(latest.current), TICKER_CYCLE_MS);
    return () => {
      clearInterval(timer);
      cancelAnimation(x);
    };
  }, [reduced, width, x]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  const list = shown.length === 0 ? events : shown;
  if (list.length === 0) return null;
  return (
    <View
      style={styles.strip}
      accessible
      accessibilityRole="text"
      accessibilityLabel={list.map((event) => event.text).join('. ')}
      testID="trip-hub-ticker"
    >
      <Animated.View style={[{ flexDirection: 'row' }, style]}>
        <Run events={list} onWidth={setWidth} />
        {reduced ? null : <Run events={list} />}
      </Animated.View>
    </View>
  );
}
