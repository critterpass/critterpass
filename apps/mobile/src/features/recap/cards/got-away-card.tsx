/**
 * Card 6, the one that got away (3m-7): the lights dim to a warm glow and the legendary's gold
 * silhouette drifts in, then, set left like the render, its name, the line about it (the guide's,
 * or the sightings while it is unwritten) and the row of its forms: the ones the crew found in
 * colour, the one that got away as its gold silhouette, with "3 of 4 forms". REMIND ME sits in
 * the story's footer.
 */
import { tokens } from '@cp/design-tokens';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { bezierEasing } from '@/motion/easing';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { SilhouetteSlot } from '@/ui/sticker/SilhouetteSlot';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { artKind, formSpec } from '../data/critter-art';
import type { FormRow } from '../data/recap-rows';
import { useCardTimeline } from '../story/use-card-timeline';
import { CardShell } from './card-shell';

const SILHOUETTE = 170;
const FORM = 40;
const standard = bezierEasing(tokens.motion.easing.standard);

const useStyles = makeStyles((th) => ({
  glow: {
    alignSelf: 'center',
    width: SILHOUETTE + th.space['32'] * 2,
    height: SILHOUETTE + th.space['32'] * 2,
    borderRadius: (SILHOUETTE + th.space['32'] * 2) / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.color.gold.dark,
    shadowColor: th.color.gold.base,
    shadowOpacity: 0.5,
    shadowRadius: th.space['32'],
  },
  words: { gap: th.space['8'] },
  forms: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
}));

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

export interface GotAwayFormChip {
  readonly row: FormRow;
  readonly found: boolean;
  readonly gotAway: boolean;
}

export interface GotAwayCardProps {
  readonly kind: string;
  readonly city: string;
  readonly eyebrow: string;
  readonly name: string;
  readonly story: string;
  readonly forms: readonly GotAwayFormChip[];
  readonly formsLabel: string;
}

export function GotAwayCard(props: GotAwayCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  const reached = useCardTimeline([200, 1000, 1600]);
  const glow = useFadeUp(reached > 0);
  const words = useFadeUp(reached > 1);
  const forms = useFadeUp(reached > 2);
  return (
    <CardShell ground={theme.semantic.bg.base} tone="dark" testID="recap-card-got-away">
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Animated.View style={[styles.glow, glow]}>
          <SilhouetteSlot
            kind={props.kind}
            city={props.city}
            size={SILHOUETTE}
            maskColor={theme.tier.locked.legendary.silhouette}
            glyphColor={theme.tier.legendary.color}
          />
        </Animated.View>
      </View>
      <Animated.View style={[styles.words, words]}>
        <Text variant="eyebrow" color={theme.tier.legendary.color}>
          {props.eyebrow}
        </Text>
        <Text variant="displayXl" accessibilityRole="header" testID="recap-got-away-name">
          {props.name}
        </Text>
        <SecondaryText variant="body" testID="recap-got-away-story">
          {props.story}
        </SecondaryText>
      </Animated.View>
      {props.forms.length === 0 ? null : (
        <Animated.View style={[styles.forms, forms]} testID="recap-got-away-forms">
          {props.forms.map((form) => {
            const kind = artKind(form.row.critter_key);
            const city = form.row.city ?? props.city;
            if (form.found) {
              const spec = formSpec(form.row);
              return (
                <Sticker
                  key={form.row.id}
                  kind={kind}
                  name={city}
                  size={FORM}
                  {...(spec === null ? {} : { form: spec })}
                />
              );
            }
            return (
              <SilhouetteSlot
                key={form.row.id}
                kind={kind}
                city={city}
                size={FORM}
                maskColor={
                  form.gotAway ? theme.tier.locked.legendary.silhouette : theme.tier.locked.default
                }
                glyphColor={form.gotAway ? theme.tier.legendary.color : theme.tier.epic.color}
              />
            );
          })}
          <Text variant="bodySm" color={theme.semantic.text.secondary}>
            {props.formsLabel}
          </Text>
        </Animated.View>
      )}
    </CardShell>
  );
}
