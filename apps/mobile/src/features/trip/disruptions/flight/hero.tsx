/**
 * The pink hero of 3k-5: the flight and route, DELAYED 2H 10M (or what else happened), and the
 * guide's line. It drops in once (560 ms after 380 ms, with a thud) and the guide wiggles beside
 * it; with reduced motion it is simply there.
 */
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { tokens } from '@cp/design-tokens';

import { impact, useLoop } from '@/motion';
import { useReducedImpactMotion } from '@/motion/patterns/shared';
import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

export interface FlightHeroProps {
  readonly eyebrow: string;
  readonly lines: readonly [string, string | null];
  readonly detail: string;
  readonly guide: GuideStickerId;
}

/** The hero drops in once it is laid out (3k-5: 560 ms, after 380 ms). */
const DROP_MS = 560;
const DROP_DELAY_MS = 380;
const GUIDE_SIZE = 96;
// eslint-disable-next-line lingui/no-unlocalized-strings -- a sound cue id, never copy.
const THUD = 'thud.heavy';

const useStyles = makeStyles((th) => ({
  hero: {
    borderTopStartRadius: 0,
    borderTopEndRadius: 0,
    borderBottomStartRadius: th.radius.heroBottom,
    borderBottomEndRadius: th.radius.heroBottom,
  },
  guide: { position: 'absolute', end: th.space['16'], bottom: th.space['20'], opacity: 0.55 },
  // The title and the line never run under the guide. The padding is on each Text, where
  // auto-fit reads it, so a long duration shrinks into the width beside the sticker before wrapping.
  words: { paddingEnd: GUIDE_SIZE },
}));

export function FlightHero(props: FlightHeroProps) {
  const styles = useStyles();
  const theme = useTheme();
  const wiggle = useLoop('wiggle');
  const reduced = useReducedImpactMotion();
  const drop = useSharedValue(0);
  useEffect(() => {
    if (reduced) {
      drop.value = withTiming(1, { duration: tokens.motion.duration.instant });
      return undefined;
    }
    drop.value = withDelay(DROP_DELAY_MS, withTiming(1, { duration: DROP_MS }));
    const timer = setTimeout(() => impact(THUD), DROP_DELAY_MS + DROP_MS);
    return () => clearTimeout(timer);
  }, [reduced, drop]);
  const dropStyle = useAnimatedStyle(() => ({
    opacity: drop.value,
    transform: [{ translateY: (1 - drop.value) * -32 }],
  }));
  const ink = theme.semantic.text.onAccent;
  return (
    <Card tone="pink" halftone radius="cardBig" style={styles.hero} testID="disruption-hero">
      <Animated.View style={dropStyle}>
        <Stack gap="10">
          <Text variant="eyebrow" color={ink} testID="disruption-hero-eyebrow">
            {props.eyebrow}
          </Text>
          <View accessible accessibilityRole="header">
            <Text variant="displayHero" color={ink} autoFit style={styles.words}>
              {props.lines[0]}
            </Text>
            {props.lines[1] === null ? null : (
              <Text
                variant="displayHero"
                color={ink}
                autoFit
                style={styles.words}
                testID="disruption-hero-amount"
              >
                {props.lines[1]}
              </Text>
            )}
          </View>
          {props.detail === '' ? null : (
            <Text variant="body" color={ink} singleLine={false} style={styles.words}>
              {props.detail}
            </Text>
          )}
        </Stack>
      </Animated.View>
      <Animated.View style={[styles.guide, wiggle]} pointerEvents="none">
        <Sticker
          kind={GUIDE_STICKERS[props.guide].kind}
          name={GUIDE_STICKERS[props.guide].name}
          size={GUIDE_SIZE}
        />
      </Animated.View>
    </Card>
  );
}
