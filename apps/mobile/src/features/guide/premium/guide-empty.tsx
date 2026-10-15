/**
 * A guide thread with nothing in it yet (5.13): the guide waving and bobbing, a greeting, what it
 * knows, and four starters (each asks its question, or opens the menu camera), with the free
 * pass's daily allowance under them.
 */
import { t } from '@lingui/core/macro';
import { useEffect, type ReactNode } from 'react';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { useIdleLoopRunning } from '@/motion/idle-pause';
import { transparentOf } from '@/ui/premium/shell/screens/scroll-edge';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  CritterSticker,
  PressableScale,
  Text,
  makePremiumStyles,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { Doodle, type DoodleName } from '@/features/crew';

export interface GuideStarter {
  readonly key: string;
  readonly doodle: DoodleName;
  readonly color: string;
  readonly title: string;
  readonly line: string;
  readonly onPress: () => void;
}

const GLOW = 360;

const useStyles = makePremiumStyles((th) => ({
  glow: {
    position: 'absolute',
    top: -GLOW / 2 + 64,
    alignSelf: 'center',
    width: GLOW,
    height: GLOW,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap10 },
  card: {
    width: '48%',
    flexGrow: 1,
    minHeight: 112,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 24,
    justifyContent: 'space-between',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function Bobbing({ children }: { readonly children: ReactNode }) {
  const th = usePremiumTheme();
  const reduced = usePremiumReducedMotion();
  const looping = useIdleLoopRunning(!reduced);
  const y = useSharedValue(0);
  useEffect(() => {
    if (!looping) {
      cancelAnimation(y);
      y.value = 0;
      return undefined;
    }
    y.value = withRepeat(withTiming(-th.motion.bobLift, { duration: th.motion.bobMs }), -1, true);
    return () => cancelAnimation(y);
  }, [looping, y, th.motion.bobLift, th.motion.bobMs]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

export function GuideEmpty({
  slug,
  guideName,
  firstName,
  hasTrip,
  starters,
  allowance,
}: {
  readonly slug: string;
  readonly guideName: string;
  readonly firstName: string | null;
  readonly hasTrip: boolean;
  readonly starters: readonly GuideStarter[];
  /** "30 answers a day on the free pass · resets at midnight", when the meter counts. */
  readonly allowance: string | null;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const name = firstName;
  const warm = th.color.status.maybe.bg;
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a gradient, never copy.
  const glow = `radial-gradient(closest-side, ${warm}, ${transparentOf(warm)})`;
  return (
    <View style={{ gap: th.space.gap16 }} testID="guide-empty">
      {/* The warm glow the guide stands in. */}
      <View pointerEvents="none" style={[styles.glow, { experimental_backgroundImage: glow }]} />
      <View style={{ alignItems: 'center', paddingTop: th.space.gap8 }}>
        <Bobbing>
          <CritterSticker kind={guideSticker(slug).kind} name={guideName} size={128} pose="wave" />
        </Bobbing>
      </View>
      <View style={{ gap: th.space.gap8, alignItems: 'center' }}>
        <Text variant="emptyTitle" align="center">
          {name === null
            ? t({ id: 'guide.premium.hello', message: 'Hello there' })
            : t({ id: 'guide.premium.helloName', message: `Hello, ${name}` })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {hasTrip
            ? t({
                id: 'guide.premium.knows',
                message:
                  'I know your plan, your bookings and where you’re going. Ask in any language.',
              })
            : t({
                id: 'guide.premium.knowsNoTrip',
                message: 'Ask me where to go, when to go, or how to get your crew planning.',
              })}
        </Text>
      </View>
      <View style={styles.grid}>
        {starters.map((starter) => (
          <PressableScale
            key={starter.key}
            style={styles.card}
            onPress={starter.onPress}
            accessibilityRole="button"
            accessibilityLabel={`${starter.title}. ${starter.line}`}
            testID={`guide-starter-${starter.key}`}
          >
            <Doodle name={starter.doodle} color={starter.color} size={34} />
            <View>
              <Text variant="rowTextStrong" numberOfLines={2}>
                {starter.title}
              </Text>
              <Text variant="captionMuted" tone="muted" numberOfLines={1}>
                {starter.line}
              </Text>
            </View>
          </PressableScale>
        ))}
      </View>
      {allowance === null ? null : (
        <Text variant="captionMuted" tone="placeholder" align="center">
          {allowance}
        </Text>
      )}
    </View>
  );
}
