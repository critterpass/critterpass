/**
 * Card 6, the one that got away (3m-7): the lights dim to a warm glow, the legendary's gold
 * silhouette drifts in, then its name, the line about it (the guide's, or the sightings while it
 * is unwritten) and how many of its forms the crew found. REMIND ME sits in the story's footer.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { GotAway } from '@/ui/recap/GotAway';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { useTheme } from '@/ui/theme';

import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const SILHOUETTE = 150;
const standard = bezierEasing(tokens.motion.easing.standard);

function useFadeUp(shown: boolean) {
  const opacity = useSharedValue(0);
  const y = useSharedValue(24);
  useEffect(() => {
    if (!shown) return;
    opacity.value = withTiming(1, { duration: tokens.motion.duration.slow, easing: standard });
    y.value = withTiming(0, { duration: tokens.motion.duration.extra, easing: standard });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- shared values are stable refs.
  }, [shown]);
  return useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ translateY: y.value }] }));
}

export interface GotAwayCardProps {
  readonly kind: string;
  readonly city: string;
  readonly eyebrow: string;
  readonly name: string;
  readonly story: string;
  readonly formsLabel: string;
}

export function GotAwayCard(props: GotAwayCardProps) {
  const theme = useTheme();
  const reached = useCardTimeline([200, 900]);
  const dim = useFadeUp(reached > 0);
  const words = useFadeUp(reached > 1);
  return (
    <CardShell ground={theme.semantic.bg.base} tone="dark" testID="recap-card-got-away">
      <Animated.View style={[{ flex: 1, justifyContent: 'center' }, dim]}>
        <Animated.View style={words}>
          <GotAway
            silhouette={
              <SilhouetteSlot
                kind={props.kind}
                city={props.city}
                size={SILHOUETTE}
                maskColor={theme.tier.locked.legendary.silhouette}
                glyphColor={theme.tier.legendary.color}
              />
            }
            eyebrow={props.eyebrow}
            name={props.name}
            story={props.story}
            formsLabel={props.formsLabel}
          />
        </Animated.View>
      </Animated.View>
    </CardShell>
  );
}
