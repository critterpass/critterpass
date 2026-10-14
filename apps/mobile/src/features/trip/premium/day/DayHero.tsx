/**
 * The day's hero (6.04, 6.05): the destination's photo under a dark fade with the day and the
 * weather as clear-glass chips, then the one number that matters (the leave-by, or the first or
 * next stop's time) large in white, with the countdown to it under a leave-by. A free day, or a
 * day already done, says so in words instead.
 * With no photo the hero is the ink surface, so the white still reads.
 */
import type { MediaAsset } from '@cp/domain';
import { premium } from '@cp/design-tokens';
import { memo } from 'react';
import { Image, PixelRatio, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { savedStillUri } from '@/lib/media/media-files';
import { pickBySize } from '@/lib/media/variants';
import { GlassPill, Text, usePremiumTheme } from '@/ui/premium';

import type { LeaveByView } from '../../leave-by/model';
import { LeaveByCountdown } from './LeaveByCountdown';

/** The photo's height, and how far the card under it rises over it. */
export const DAY_HERO_HEIGHT = 330;

/**
 * Dark at the top for the chips, clear through the middle, then a scrim under the headline that
 * holds the white type on any photo, a bright beach or a sign behind it included.
 */
const FADE =
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a CSS gradient, not copy
  'linear-gradient(180deg, rgba(10,10,25,0.5) 0%, rgba(10,10,25,0.05) 30%, rgba(10,10,25,0.5) 58%, rgba(10,10,25,0.8) 100%)';

export interface DayHeroProps {
  readonly media: MediaAsset | null;
  readonly eyebrow: string;
  readonly forecast: string | null;
  readonly onForecast?: (() => void) | undefined;
  /** "Leave by", "First up", "Next up"; null on a free or finished day. */
  readonly label: string | null;
  /** "03:10"; or the free/finished day's headline. */
  readonly big: string;
  readonly spoken?: string;
  /** A free or finished day: the headline is words, not a time. */
  readonly words: boolean;
  /** The leave-by the countdown under the time counts to, with the page's minute clock. */
  readonly countdown: LeaveByView | null;
  readonly now: Date;
  readonly guideName: string;
}

export const DayHero = memo(function DayHero(props: DayHeroProps) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const still =
    props.media === null ? undefined : pickBySize(props.media.images, width * PixelRatio.get());
  const uri =
    props.media === null || still === undefined
      ? null
      : (savedStillUri(props.media, still.url) ?? still.url);
  const white = premium.accent.paper;
  return (
    <View
      style={[
        styles.hero,
        {
          height: DAY_HERO_HEIGHT + insets.top - th.space.statusBar,
          backgroundColor: premium.modes.dark.color.inkSurface,
          borderBottomLeftRadius: 40,
          borderBottomRightRadius: 40,
        },
      ]}
      testID="trip-day-hero"
    >
      {uri === null ? null : (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          accessibilityIgnoresInvertColors
        />
      )}
      <View style={[StyleSheet.absoluteFill, { backgroundImage: FADE }]} />
      <View
        style={[
          styles.chips,
          { top: insets.top + th.space.gap6, left: 76, right: th.space.gutter },
        ]}
      >
        <GlassPill kind="clear" label={props.eyebrow} testID="trip-day-eyebrow" />
        <View style={styles.spacer} />
        {props.forecast === null ? null : (
          <GlassPill
            kind="clear"
            label={props.forecast}
            {...(props.onForecast === undefined ? {} : { onPress: props.onForecast })}
            testID="trip-day-forecast"
          />
        )}
      </View>
      <View style={[styles.copy, { paddingHorizontal: th.space.titleGutter }]}>
        {props.label === null ? null : (
          <Text variant="headline" color={white} style={styles.soft}>
            {props.label}
          </Text>
        )}
        <Text
          variant={props.words ? 'display' : 'hero'}
          color={white}
          style={props.words ? null : styles.tabular}
          accessibilityRole="header"
          {...(props.spoken === undefined ? {} : { accessibilityLabel: props.spoken })}
          testID="trip-day-big"
        >
          {props.big}
        </Text>
        {props.countdown === null ? null : (
          <LeaveByCountdown view={props.countdown} now={props.now} guideName={props.guideName} />
        )}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  hero: { overflow: 'hidden', justifyContent: 'flex-end' },
  chips: { position: 'absolute', flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  copy: { paddingBottom: 56, gap: 2 },
  soft: { opacity: 0.92 },
  spacer: { flexGrow: 1 },
  tabular: { fontVariant: ['tabular-nums'] },
});
