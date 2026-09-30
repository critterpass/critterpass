/**
 * The day cards streaming under the drafting checklist: one pill per day as its theme arrives,
 * scrolling right to left in a seamless loop (the list is drawn twice and moves by one copy's
 * width), so there is always something new to read. Under reduced motion the pills sit still and
 * the row scrolls by hand.
 */
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';

import { LOOP_PRESETS, sampleLoopPreset, useMotionMode, useSharedClock } from '@/motion';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { DayCard } from '../data/job';
import { dayCardLabel } from './step-copy';

const useStyles = makeStyles((th) => ({
  strip: { overflow: 'hidden', paddingVertical: th.space['8'] },
  row: { flexDirection: 'row', gap: th.space['12'], paddingEnd: th.space['12'] },
  pill: {
    paddingHorizontal: th.space['20'],
    paddingVertical: th.space['16'],
    borderRadius: th.radius.lg,
  },
}));

function Pills({ days }: { readonly days: readonly DayCard[] }) {
  const styles = useStyles();
  const theme = useTheme();
  const accents = [
    theme.color.orange,
    theme.color.yellow,
    theme.color.pink,
    theme.color.blue,
    theme.color.green.base,
  ];
  return (
    <>
      {days.map((day, index) => (
        <View
          key={day.dayNo}
          style={[styles.pill, { backgroundColor: accents[index % accents.length] }]}
        >
          <Text variant="title" numberOfLines={1} color={theme.semantic.text.onAccent}>
            {dayCardLabel(day)}
          </Text>
        </View>
      ))}
    </>
  );
}

export function DayMarquee({ days }: { readonly days: readonly DayCard[] }) {
  const styles = useStyles();
  const [motionMode] = useMotionMode();
  const clock = useSharedClock();
  const [width, setWidth] = useState(0);
  const def = LOOP_PRESETS.marquee;
  const moving = motionMode === 'full' && days.length > 0;
  const style = useAnimatedStyle(() => {
    if (!moving || width === 0) return { transform: [{ translateX: 0 }] };
    const frame = sampleLoopPreset(def, clock.value / def.durationMs);
    // The preset moves by a fraction of the doubled row: -0.5 is one copy's width.
    return { transform: [{ translateX: frame.tx * 2 * width }] };
  });
  if (days.length === 0) return <View style={styles.strip} />;
  if (!moving) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="drafting-days">
        <View style={styles.row}>
          <Pills days={days} />
        </View>
      </ScrollView>
    );
  }
  return (
    <View style={styles.strip} testID="drafting-days" accessible={false}>
      <Animated.View style={[{ flexDirection: 'row' }, style]}>
        <View style={styles.row} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
          <Pills days={days} />
        </View>
        <View style={styles.row} importantForAccessibility="no-hide-descendants">
          <Pills days={days} />
        </View>
      </Animated.View>
    </View>
  );
}
