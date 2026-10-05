/**
 * Live name results while typing (7d-1, undesigned): the phone's rows first (ideas, then curated),
 * the server's after them, and "More places" from Foursquare when fewer than five come back:
 * display-only (D25), a pick asks for the open-data place behind it.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { screenCredits, type PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { LivePlace, MorePlacesState } from '@/data/places/more-places';
import type { PlaceCandidate } from '@/data/places/match-places';
import type { SearchState } from '@/data/places/server-name-search';
import { makeStyles, Text, useTheme } from '@/ui';
import { AddButton, PhotoCredit, PlaceRow } from '@/ui/planning';
import { Skeleton } from '@/ui/states/Skeleton';

import { nameAnswer, nearestFirst } from './name-answer';
import { NameNotFound } from './name-not-found';
import { placeIcon } from './place-icons';
import {
  kindWord,
  rowWords,
  type RowContext,
  type RowWords,
  type SearchPlace,
} from './search-rows';

const useStyles = makeStyles((th) => ({
  card: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised, overflow: 'hidden' },
  section: { gap: th.space['8'] },
}));

export interface NameResultsProps {
  readonly rows: readonly PlaceCandidate[];
  readonly state: SearchState;
  readonly live: MorePlacesState;
  /** The places' photos by POI id, as they arrive. */
  readonly photos?: PlaceTilePhotos | undefined;
  readonly onOpen: (place: PlaceCandidate) => void;
  readonly onAdd: (place: PlaceCandidate) => void;
  readonly onPickLive: (place: LivePlace) => void;
  /** The row's second line and whether the place is already on a day. */
  readonly words?: ((place: PlaceCandidate) => RowWords) | undefined;
  /**
   * What she typed, once both searches have answered: rows that do not carry the name are then
   * told apart from the place she asked for (./name-answer). Absent, rows are listed as they come.
   */
  readonly asked?: string | undefined;
  /** What the rows' second lines are worded from; distances and "nearest first" use its point. */
  readonly context?: RowContext | undefined;
  /** An address was found for the text: "nothing at that address" would be untrue. */
  readonly addressFound?: boolean | undefined;
  /** The ways on when no place has that name; absent, nothing is drawn (the lab's bare lists). */
  readonly notFound?:
    | {
        readonly guideName: string;
        readonly onDropPin: () => void;
        readonly onAsk: () => void;
      }
    | undefined;
}

function addLabel(place: PlaceCandidate): string {
  const name = place.name;
  return t({ id: 'search.row.add', message: `Add ${name}` });
}

function plainWords(place: PlaceCandidate): RowWords {
  const meta =
    place.source === 'idea'
      ? t({ id: 'search.row.saved', message: 'In your Ideas' })
      : (place.nameLocal ?? undefined);
  return { meta, inPlan: false };
}

/** The row's area and address, from the server's answer or the phone's own places. */
function whereOf(row: SearchPlace, context: RowContext | undefined): string {
  const address = row.address ?? context?.addresses.get(row.poiId ?? row.id) ?? '';
  return `${row.area ?? ''} ${address}`;
}

function kindHeading(category: string): string {
  const kind = kindWord(category) ?? t({ id: 'search.name.kindPlaces', message: 'Places' });
  return t({ id: 'search.name.kindBelow', message: `${kind}, nearest first` });
}

export function NameResults({
  state,
  live,
  photos,
  onOpen,
  onAdd,
  onPickLive,
  asked,
  context,
  addressFound = false,
  notFound,
  ...props
}: NameResultsProps) {
  const styles = useStyles();
  const theme = useTheme();
  const words =
    props.words ??
    (context === undefined ? plainWords : (row: PlaceCandidate) => rowWords(row, context));
  const answer =
    asked === undefined
      ? null
      : nameAnswer(
          asked,
          props.rows.map((row) => ({ ...row, where: whereOf(row, context) })),
          context?.destination,
        );
  const missed = answer !== null && answer.kind === 'notFound' ? answer : null;
  // An address that was found answers the text: only the look-alike rows go.
  const sayMissed = missed !== null && !(missed.address && addressFound);
  const rows =
    missed === null
      ? props.rows
      : missed.below.rows === 'none'
        ? []
        : missed.below.rows === 'kind'
          ? nearestFirst(props.rows, context?.from ?? null)
          : props.rows;
  const heading =
    missed === null || rows.length === 0
      ? null
      : missed.below.rows === 'kind'
        ? kindHeading(missed.below.category)
        : t({ id: 'search.name.alike', message: 'Names a bit like it' });
  return (
    <View style={{ gap: theme.space['14'] }} testID="search-name-results">
      {props.rows.length === 0 && state === 'searching' ? (
        <Skeleton preset="list" repeat={2} />
      ) : null}
      {notFound !== undefined && (sayMissed || (props.rows.length === 0 && state === 'none')) ? (
        <NameNotFound {...notFound} typed={asked} address={missed?.address} />
      ) : null}
      {heading === null ? null : (
        <Text variant="eyebrow" testID="search-name-below">
          {heading}
        </Text>
      )}
      {rows.length === 0 ? null : (
        <View style={styles.card}>
          {rows.map((place, index) => {
            const row = words(place);
            return (
              <PlaceRow
                key={place.poiId ?? place.id}
                title={place.name}
                meta={row.meta}
                icon={placeIcon(place.category)}
                {...(place.poiId === null ? undefined : photos?.get(place.poiId)?.tile)}
                onPress={() => onOpen(place)}
                trailing={
                  place.poiId === null || row.inPlan ? undefined : (
                    <AddButton
                      accessibilityLabel={addLabel(place)}
                      onPress={() => onAdd(place)}
                      testID={`search-row-add-${String(index)}`}
                    />
                  )
                }
                testID={
                  row.inPlan ? `search-row-in-plan-${String(index)}` : `search-row-${String(index)}`
                }
              />
            );
          })}
        </View>
      )}
      {live.kind === 'done' && live.places.length > 0 ? (
        <View style={styles.section} testID="search-more-places">
          <Text variant="eyebrow">{t({ id: 'search.more.eyebrow', message: 'More places' })}</Text>
          <View style={styles.card}>
            {live.places.map((place) => (
              <PlaceRow
                key={place.fsqPlaceId}
                title={place.name}
                meta={place.address ?? undefined}
                icon="pin"
                onPress={() => onPickLive(place)}
              />
            ))}
          </View>
          <Text variant="caption" color={theme.semantic.text.secondary}>
            {t({ id: 'search.more.attribution', message: 'Powered by Foursquare' })}
          </Text>
        </View>
      ) : (
        // "More places" carries Foursquare's line itself; without it the photos' credit shows.
        <PhotoCredit credits={screenCredits(photos?.values() ?? [])} />
      )}
    </View>
  );
}
