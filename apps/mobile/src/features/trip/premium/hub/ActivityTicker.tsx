/**
 * The crew's ticker (6.01): a white 40 pt pill scrolling the latest events right to left over 22 s,
 * drawn twice so the loop never shows a gap, with a small crew-colour dot between events. Tapping
 * an event opens what it is about. Still (the first events, no scroll) with Reduce Motion.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { PressableScale, Text, usePremiumReducedMotion, usePremiumTheme } from '@/ui/premium';

import { crewAccent } from '../components/crew-accent';

export const TICKER_LOOP_MS = 22_000;

export interface TickerItem {
  readonly id: string;
  readonly text: string;
  readonly onPress?: () => void;
}

function Strip({ items, copy }: { readonly items: readonly TickerItem[]; readonly copy: number }) {
  // The second copy only fills the loop; screen readers read the first.
  const hidden = copy !== 0;
  return (
    <View
      style={styles.strip}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
    >
      {items.map((item, index) => (
        <View key={`${copy}-${item.id}`} style={styles.item}>
          <PressableScale
            {...(item.onPress === undefined ? {} : { onPress: item.onPress })}
            disabled={item.onPress === undefined}
            accessibilityRole={item.onPress === undefined ? 'text' : 'button'}
            accessibilityLabel={item.text}
          >
            <Text variant="caption" style={styles.label} numberOfLines={1}>
              {item.text}
            </Text>
          </PressableScale>
          <View style={[styles.dot, { backgroundColor: crewAccent(index + 2) }]} />
        </View>
      ))}
    </View>
  );
}

export function ActivityTicker({ items }: { readonly items: readonly TickerItem[] }) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const [width, setWidth] = useState(0);
  const x = useSharedValue(0);
  useEffect(() => {
    if (!looping || width === 0) {
      cancelAnimation(x);
      x.value = 0;
      return undefined;
    }
    x.value = 0;
    x.value = withRepeat(
      withTiming(-width, { duration: TICKER_LOOP_MS, easing: Easing.linear }),
      -1,
      false,
    );
    return () => cancelAnimation(x);
  }, [looping, width, x]);
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (items.length === 0) return null;
  const onLayout = (event: LayoutChangeEvent) => {
    const next = Math.round(event.nativeEvent.layout.width);
    if (next !== width) setWidth(next);
  };
  return (
    <View
      style={[
        styles.pill,
        {
          marginHorizontal: th.space.gutter,
          borderRadius: th.radius.banner,
          backgroundColor: th.color.card,
          boxShadow: th.shadow.card,
        },
      ]}
      testID="trip-hub-ticker"
    >
      {reduced ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Strip items={items} copy={0} />
        </ScrollView>
      ) : (
        <Animated.View style={[styles.track, moving]}>
          <View onLayout={onLayout}>
            <Strip items={items} copy={0} />
          </View>
          <Strip items={items} copy={1} />
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: { height: 40, overflow: 'hidden', justifyContent: 'center' },
  track: { flexDirection: 'row' },
  strip: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingRight: 14 },
  label: { fontWeight: '600' },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
