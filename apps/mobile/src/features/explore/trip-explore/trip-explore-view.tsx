/**
 * Explore in a trip (7g-1), drawn from plain values: the destination hero with the way back to the
 * trip and the crew's saved count, the search docked under it (pinned to the top once the page
 * scrolls past it), FOR YOUR GAPS, the guide's picks with where each stands, and SWIPE TOGETHER.
 */
import { tokens } from '@cp/design-tokens';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedScrollHandler,
  useSharedValue,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { InlineAction } from '@/ui/buttons/InlineAction';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { DestHero, type DestHeroProps } from '../components/dest-hero';
import { PicksRow, type PickCard } from '../components/picks-row';
import * as copy from './copy';
import { DOCKED_SEARCH_HEIGHT, DockedSearch } from './docked-search';
import { GapsCard, type GapsCardState } from './gaps-card';
import { PickStateChip } from './pick-state-chip';
import { SwipeTogetherCard } from './swipe-together-card';
import type { PickState, SwipeLive } from './trip-explore-model';

export interface TripPick extends PickCard {
  readonly state: PickState;
}

export interface TripExploreViewProps {
  readonly hero: Omit<DestHeroProps, 'trailing' | 'saved' | 'onToggleSave' | 'chips'>;
  readonly savedCount: number;
  readonly onSaved?: (() => void) | undefined;
  readonly searchPlaceholder: string;
  readonly onSearch?: (() => void) | undefined;
  readonly offline: boolean;
  readonly gaps: GapsCardState;
  readonly picks: readonly TripPick[];
  /** How many places the guide covers here, already formatted ("86"). */
  readonly placesCount: string | null;
  readonly onAllPlaces?: (() => void) | undefined;
  readonly onOpenPick?: ((pick: PickCard) => void) | undefined;
  readonly onSavePick: (pick: TripPick) => void;
  readonly swipe: {
    readonly deckSize: number;
    readonly live: SwipeLive;
    readonly onPress: () => void;
  };
}

const useStyles = makeStyles((t) => ({
  dock: { paddingHorizontal: t.size.gutter, marginTop: -DOCKED_SEARCH_HEIGHT / 2 },
  pinned: {
    position: 'absolute',
    top: 0,
    start: 0,
    end: 0,
    paddingHorizontal: t.size.gutter,
    paddingBottom: t.space['8'],
    backgroundColor: t.semantic.bg.base,
  },
  body: { gap: t.space['20'], paddingTop: t.space['20'] },
  inset: { paddingHorizontal: t.size.gutter },
}));

export function TripExploreView(props: TripExploreViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { i18n } = useLingui();
  const locale = i18n.locale;
  const guide = props.hero.guide;
  const [dockY, setDockY] = useState<number | null>(null);
  const [pinned, setPinned] = useState(false);
  // The pinned copy shows once the docked bar would slide under the status bar.
  const pinAt = useSharedValue(Number.POSITIVE_INFINITY);
  const shown = useSharedValue(false);
  const pinFrom = dockY === null ? Number.POSITIVE_INFINITY : dockY - insets.top - theme.space['8'];
  useEffect(() => {
    pinAt.value = pinFrom;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pinAt is a stable shared value ref.
  }, [pinFrom]);
  const onScroll = useAnimatedScrollHandler((event) => {
    const next = event.contentOffset.y >= pinAt.value;
    if (next === shown.value) return;
    shown.value = next;
    runOnJS(setPinned)(next);
  });

  const search = (testID: string) => (
    <DockedSearch
      guide={guide}
      placeholder={props.searchPlaceholder}
      onPress={props.onSearch}
      testID={testID}
    />
  );

  return (
    <Scaffold edges={[]} testID="explore-trip">
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ paddingBottom: insets.bottom + theme.space['24'] }}
      >
        <DestHero
          {...props.hero}
          chips={[]}
          guideArt="ghost"
          trailing={
            <InlineAction
              kind="choice"
              label={upper(copy.savedCount(props.savedCount), locale)}
              onPress={props.onSaved ?? (() => undefined)}
              disabled={props.onSaved === undefined}
              testID="explore-trip-saved"
            />
          }
        />
        <View style={styles.dock} onLayout={(event) => setDockY(event.nativeEvent.layout.y)}>
          {search('explore-trip-search')}
        </View>
        <View style={styles.body}>
          {props.offline ? (
            <View style={styles.inset}>
              <OfflinePill testID="explore-trip-offline" />
            </View>
          ) : null}
          <GapsCard guideName={guide.name} state={props.gaps} />
          {props.picks.length === 0 ? null : (
            <View style={{ gap: theme.space['10'] }}>
              <Row justify="space-between" align="center" gap="8" style={styles.inset}>
                <View style={{ flex: 1 }}>
                  <Text variant="eyebrow" numberOfLines={1}>
                    {upper(copy.picksTitle(guide.name), locale)}
                  </Text>
                </View>
                {props.placesCount === null || props.onAllPlaces === undefined ? null : (
                  <TextLink
                    label={copy.picksAll(props.placesCount)}
                    onPress={props.onAllPlaces}
                    testID="explore-trip-all-places"
                  />
                )}
              </Row>
              <PicksRow
                picks={props.picks}
                onOpen={props.onOpenPick}
                accent={guide.colour}
                footer={(pick) => {
                  const trip = props.picks.find((entry) => entry.id === pick.id);
                  return trip === undefined ? null : (
                    <PickStateChip
                      state={trip.state}
                      placeName={trip.name}
                      onSave={() => props.onSavePick(trip)}
                      testID={`explore-trip-pick-${trip.state.kind}-${String(props.picks.indexOf(trip))}`}
                    />
                  );
                }}
              />
            </View>
          )}
          <SwipeTogetherCard {...props.swipe} />
        </View>
      </Animated.ScrollView>
      {pinned ? (
        <Animated.View
          entering={FadeIn.duration(tokens.motion.duration.fast)}
          exiting={FadeOut.duration(tokens.motion.duration.fast)}
          style={[styles.pinned, { paddingTop: insets.top + theme.space['8'] }]}
        >
          {search('explore-trip-search-pinned')}
        </Animated.View>
      ) : null}
    </Scaffold>
  );
}
