/**
 * The Explore map, drawn from plain values: the search pill with the way back and the list toggle,
 * the filter chips, what the map says when location is off or the viewer is far away, the map (or
 * the list) and the cards along the bottom. Offline without the region on this phone, the map
 * gives way to the offer to download it; the list and search still work.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/ui/buttons/IconButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import { StraightArrow } from '@/ui/icons/StraightArrow';
import { TextField } from '@/ui/inputs/TextField';
import { Row } from '@/ui/layout/Row';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { MapFilter } from '../map-model';
import { ExploreListView } from '../screens/explore-list-screen';
import { FilterChips } from './filter-chips';
import { PlaceCarousel, type CarouselCard } from './place-carousel';

/** The search pill and the chips under it, for the list's top inset. */
const HEADER_PT = 132;
const CAROUSEL_PT = 150;

export interface ExploreMapViewProps {
  readonly destinationName: string;
  readonly mode: 'map' | 'list';
  readonly onToggleMode: () => void;
  readonly query: string;
  readonly onQuery: (text: string) => void;
  readonly filters: ReadonlySet<MapFilter>;
  readonly counts: Readonly<Record<MapFilter, number>>;
  readonly inTrip: boolean;
  readonly onToggleFilter: (filter: MapFilter) => void;
  readonly cards: readonly CarouselCard[];
  readonly selectedId: string | null;
  readonly onSettle: (id: string) => void;
  readonly onOpen: (card: CarouselCard) => void;
  readonly onBack: () => void;
  /**
   * The map canvas, given how far up its mark and attribution button must sit to clear the cards
   * and the home indicator; null when it cannot draw (offline with no region on this phone).
   */
  readonly canvas: ((ornamentBottom: number) => ReactNode) | null;
  /** The offer to download the region, shown where the map cannot draw. */
  readonly pack: ReactNode;
  /** Already worded: "You're 607 km from Kyoto"; null in the destination or with no fix. */
  readonly away: string | null;
  readonly locationOff: boolean;
  /** Opens the phone's settings for location. */
  readonly onLocationSettings: () => void;
  /** The places have not reached this phone yet. */
  readonly loading: boolean;
}

const useStyles = makeStyles((t) => ({
  top: { position: 'absolute', top: 0, start: 0, end: 0, gap: t.space['10'] },
  search: { paddingHorizontal: t.space['16'] },
  field: { flex: 1 },
  notes: { paddingHorizontal: t.size.gutter, gap: t.space['6'], alignItems: 'flex-start' },
  bottom: { position: 'absolute', bottom: 0, start: 0, end: 0, gap: t.space['8'] },
  card: {
    marginHorizontal: t.size.gutter,
    padding: t.space['16'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
  },
  unavailable: { justifyContent: 'center', paddingHorizontal: t.size.gutter },
}));

export function ExploreMapView(props: ExploreMapViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useLingui();
  useBackAffordance();
  const place = props.destinationName;
  const searchLabel = t({ id: 'explore.map.search', message: `Search ${place}` });
  const listMode = props.mode === 'list';
  const empty = !props.loading && props.cards.length === 0;
  return (
    <Scaffold variant={listMode ? 'dark' : 'map'} edges={[]} testID="explore-map">
      {listMode ? (
        // The list's own surface covers the whole screen, edge to edge; its rows keep to the safe
        // areas.
        <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.semantic.bg.base }]}>
          <ExploreListView
            cards={props.cards}
            onOpen={props.onOpen}
            topInset={insets.top + HEADER_PT}
            bottomInset={insets.bottom + theme.space['24']}
          />
        </View>
      ) : props.canvas === null ? (
        props.loading ? null : (
          <View
            style={[
              StyleSheet.absoluteFill,
              styles.unavailable,
              { backgroundColor: theme.color.map.base },
            ]}
            testID="explore-map-unavailable"
          >
            {props.pack}
          </View>
        )
      ) : (
        <View style={StyleSheet.absoluteFill}>
          {props.canvas(insets.bottom + theme.space['12'] + CAROUSEL_PT + theme.space['8'])}
        </View>
      )}
      <View
        style={[styles.top, { paddingTop: insets.top + theme.space['8'] }]}
        pointerEvents="box-none"
      >
        <Row gap="8" align="center" style={styles.search}>
          <IconButton
            label={t({ id: 'explore.place.back', message: 'Back' })}
            glyph={<StraightArrow direction="back" color={theme.semantic.text.primary} />}
            onPress={props.onBack}
            testID="explore-map-back"
          />
          <View style={styles.field}>
            <TextField
              label={searchLabel}
              labelHidden
              placeholder={searchLabel}
              value={props.query}
              onChangeText={props.onQuery}
              leading={
                <Icon name="pin" size={18} color={theme.semantic.text.secondary} decorative />
              }
              autoCorrect={false}
              returnKeyType="search"
              testID="explore-map-search"
            />
          </View>
          <IconButton
            label={
              listMode
                ? t({ id: 'explore.map.showMap', message: 'Show the map' })
                : t({ id: 'explore.map.showList', message: 'Show as a list' })
            }
            glyph={
              listMode ? (
                <Icon name="pin" size={20} decorative />
              ) : (
                <Text variant="title">{'≡'}</Text>
              )
            }
            onPress={props.onToggleMode}
            testID="explore-map-mode"
          />
        </Row>
        <FilterChips
          active={props.filters}
          counts={props.counts}
          inTrip={props.inTrip}
          onToggle={props.onToggleFilter}
        />
        {listMode ? null : (
          <View style={styles.notes} pointerEvents="box-none">
            {props.away === null ? null : (
              <InfoPill testID="explore-map-away">{props.away}</InfoPill>
            )}
            {props.locationOff ? (
              <Row gap="8" align="center" style={styles.card} testID="explore-map-location-off">
                <Text variant="bodySm">
                  {t({
                    id: 'explore.map.locationOff',
                    message: 'Location is off, so the map leaves you out.',
                  })}
                </Text>
                <TextLink
                  label={t({ id: 'explore.map.locationSettings', message: 'Settings' })}
                  onPress={props.onLocationSettings}
                  testID="explore-map-location-settings"
                />
              </Row>
            ) : null}
          </View>
        )}
      </View>
      {listMode ? null : (
        <View
          style={[styles.bottom, { paddingBottom: insets.bottom + theme.space['12'] }]}
          pointerEvents="box-none"
        >
          {props.loading ? (
            <View style={styles.card} testID="explore-map-loading">
              <Text variant="bodySm">
                {t({ id: 'explore.map.loading', message: `Fetching ${place}'s places` })}
              </Text>
            </View>
          ) : empty ? (
            <View style={styles.card} testID="explore-map-no-results">
              <Text variant="bodySm">
                {t({
                  id: 'explore.map.noResults',
                  message: 'Nothing matches. Try fewer filters or another word.',
                })}
              </Text>
            </View>
          ) : (
            <View style={{ minHeight: CAROUSEL_PT, justifyContent: 'flex-end' }}>
              <PlaceCarousel
                cards={props.cards}
                selectedId={props.selectedId}
                onSettle={props.onSettle}
                onOpen={props.onOpen}
              />
            </View>
          )}
        </View>
      )}
    </Scaffold>
  );
}
