/**
 * Home on a first sync (3.03): the real layout as shimmer blocks and, under them, Pon bringing the
 * trip to this phone with a moving bar. Nothing reports bytes yet, so the bar sweeps rather than
 * counting; the tabs stay usable meanwhile and the sync keeps going in the background.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients, never copy. */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import {
  Card,
  CritterSticker,
  Skeleton,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
} from '@/ui/premium';

const SWEEP_MS = 1400;

const useStyles = makePremiumStyles((t) => ({
  body: { gap: t.space.gap16 },
  rows: { gap: t.space.gap10 },
  card: { padding: t.space.gap14, paddingHorizontal: t.space.gap16, gap: t.space.gap10 },
  head: { flexDirection: 'row', alignItems: 'center', gap: t.space.gap10 },
  disc: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.color.status.tangerine.bg,
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  grow: { flex: 1 },
  track: { height: 6, borderRadius: 3, backgroundColor: t.color.control, overflow: 'hidden' },
  fill: {
    width: '45%',
    height: 6,
    borderRadius: 3,
    backgroundImage: 'linear-gradient(90deg, #ffd84a, #ff9a4d)',
  },
}));

function SweepBar() {
  const styles = useStyles();
  const reduced = usePremiumReducedMotion();
  const x = useSharedValue(0);
  const width = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      cancelAnimation(x);
      x.set(0);
      return;
    }
    x.set(withRepeat(withTiming(1, { duration: SWEEP_MS }), -1, true));
  }, [reduced, x]);
  // The fill slides on the UI thread (a transform), never re-laying out the bar each frame.
  const moving = useAnimatedStyle(() => ({
    transform: [{ translateX: x.get() * 0.55 * width.get() }],
  }));
  return (
    <View style={styles.track} onLayout={(e) => width.set(e.nativeEvent.layout.width)}>
      <Animated.View style={[styles.fill, moving]} />
    </View>
  );
}

export function HomeSyncing() {
  const styles = useStyles();
  const { t } = useLingui();
  return (
    <View style={styles.body} testID="home-loading">
      <Skeleton width={180} height={18} radius={9} />
      <Skeleton height={250} radius={32} tone="block" />
      <Skeleton width={110} height={14} radius={7} tone="soft" />
      <View style={styles.rows}>
        <Skeleton height={72} radius={24} tone="block" />
        <Skeleton height={72} radius={24} tone="block" />
      </View>
      <Card radius={24} style={styles.card}>
        <View style={styles.head}>
          <View style={styles.disc}>
            <CritterSticker kind="tanuki" name="Pon" size={36} pose="think" />
          </View>
          <View style={styles.grow}>
            <Text variant="toast">
              {t({ id: 'home.premium.sync.title', message: 'Bringing the trip to this phone' })}
            </Text>
            <Text variant="caption" tone="muted">
              {t({ id: 'home.premium.sync.line', message: 'Plan, bookings and chat' })}
            </Text>
          </View>
        </View>
        <SweepBar />
      </Card>
    </View>
  );
}
