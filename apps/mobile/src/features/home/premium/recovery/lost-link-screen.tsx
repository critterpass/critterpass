/**
 * A link that leads nowhere (3.19): ✕ on glass, a floating Tokek over a pink pin, "This page
 * wandered off", and the ways on: Home, searching your trips, or telling us the link is broken
 * (the problem form with the link attached).
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and CSS gradients, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  CritterSticker,
  Icon,
  ListCard,
  Row,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { useIdleLoopRunning } from '@/motion/idle-pause';
import { FullScreen } from '@/ui/premium/shell';

import { HomeGlyph } from '../components/home-glyph';

const FLOAT_MS = 2000;

const useStyles = makePremiumStyles((t) => ({
  root: {
    flex: 1,
    paddingHorizontal: t.space.gutter,
    gap: t.space.gap16,
    backgroundImage: `radial-gradient(circle at 50% 34%, #e6f6fb 0%, ${t.color.ground} 60%)`,
    backgroundColor: t.color.ground,
  },
  art: { height: 220, alignItems: 'center', justifyContent: 'center' },
  pin: { position: 'absolute', end: 96, top: 30, transform: [{ rotate: '12deg' }] },
  // A soft ground shadow under the critter, not a solid bar that reads as a loading line.
  shadow: {
    width: 140,
    height: 22,
    marginTop: 0,
    experimental_backgroundImage:
      'radial-gradient(closest-side, rgba(23,20,42,0.16), rgba(23,20,42,0))',
  },
  tile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  grow: { flex: 1 },
}));

export function LostLinkScreen() {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const { t } = useLingui();
  const path = usePathname();
  const lift = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(lift);
      lift.value = 0;
      return;
    }
    lift.value = withRepeat(
      withTiming(1, { duration: FLOAT_MS, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [lift, looping]);
  const float = useAnimatedStyle(() => ({
    transform: [{ translateY: -9 * lift.value }, { rotate: `${-2 + 4 * lift.value}deg` }],
  }));
  const home = () => router.replace('/');
  const chevron = <Icon name="forward" size={16} color={theme.color.placeholder} />;
  return (
    <FullScreen
      closeLabel={t({ id: 'home.premium.lost.close', message: 'Close' })}
      overPhoto={false}
      onClose={home}
      testID="not-found"
    >
      <View
        style={[styles.root, { paddingTop: insets.top + 96, paddingBottom: insets.bottom + 16 }]}
      >
        <View
          style={styles.art}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <View style={styles.pin}>
            <HomeGlyph name="link" size={54} color={theme.accent.pink} stroke={2.4} />
          </View>
          <Animated.View style={float}>
            <CritterSticker kind="gecko" name="Tokek" size={140} pose="think" />
          </Animated.View>
          <View style={styles.shadow} />
        </View>
        <Text variant="emptyTitle" accessibilityRole="header" align="center">
          {t({ id: 'home.premium.lost.title', message: 'This page wandered off' })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t({
            id: 'home.premium.lost.line',
            message: 'The link may be old, or the trip it pointed at is no longer yours to see.',
          })}
        </Text>
        <ListCard radius={theme.radius.cardRow}>
          <Row
            title={t({ id: 'home.premium.lost.home', message: 'Go to Home' })}
            subtitle={t({ id: 'home.premium.lost.homeSub', message: 'Your crews and what’s next' })}
            trailing={chevron}
            leading={
              <View style={[styles.tile, { backgroundColor: theme.color.control }]}>
                <Icon name="home" size={18} />
              </View>
            }
            onPress={home}
            testID="not-found-home"
          />
          <Row
            title={t({ id: 'home.premium.lost.trips', message: 'Search your trips' })}
            subtitle={t({ id: 'home.premium.lost.tripsSub', message: 'Every trip you’re part of' })}
            trailing={chevron}
            leading={
              <View style={[styles.tile, { backgroundColor: theme.color.status.rain.bg }]}>
                <HomeGlyph name="search" size={18} color={theme.color.status.rain.text} />
              </View>
            }
            onPress={() => router.replace('/trips')}
            testID="not-found-trips"
          />
        </ListCard>
        <View style={styles.grow} />
        <TextButton
          align="center"
          label={t({ id: 'home.premium.lost.report', message: 'Tell us this link is broken' })}
          onPress={() =>
            router.push({
              pathname: '/help-centre/feedback',
              params: { mode: 'problem', context: `link:${path}` },
            })
          }
          testID="not-found-report"
        />
      </View>
    </FullScreen>
  );
}
