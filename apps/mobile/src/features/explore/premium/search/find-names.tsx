/**
 * Names while typing on Find (4.30, undesigned between the empty field and plain words): the
 * phone's places first and the server's after them, each with `+`; when both have answered and no
 * place carries the name, the guide says so with Drop a pin and Ask, and the look-alikes (or the
 * nearest of the kind) follow under their heading. "More places" lists what the open map knows,
 * display-only; a pick asks for the place behind it.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { LivePlace, MorePlacesState } from '@/data/places/more-places';
import type { PlaceCandidate } from '@/data/places/match-places';
import type { SearchState } from '@/data/places/server-name-search';
import { Button, ListCard, Spinner, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { nameAnswer, nearestFirst } from '../../search/name-answer';
import { placeIcon } from '../../search/place-icons';
import { kindWord, rowWords, type RowContext, type SearchPlace } from '../../search/search-rows';
import { GuideDock } from '../components/guide-dock';
import { SectionLabel } from '../components/labels';
import { FindSkeleton } from '../components/find-skeleton';
import { PlaceResultRow } from '../components/place-result-row';

export interface FindNamesProps {
  readonly rows: readonly PlaceCandidate[];
  readonly state: SearchState;
  readonly incomplete: boolean;
  readonly onRetry: () => void;
  readonly live: MorePlacesState;
  readonly pickingLive: string | null;
  readonly onPickLive: (place: LivePlace) => void;
  readonly photos: PlaceTilePhotos;
  readonly context: RowContext;
  /** What was typed, once both searches have answered. */
  readonly asked: string | undefined;
  readonly addressFound: boolean;
  readonly guideName: string;
  readonly critter: string;
  readonly onOpen: (place: PlaceCandidate) => void;
  readonly onAdd: (place: PlaceCandidate) => void;
  readonly onDropPin: () => void;
  readonly onAsk: () => void;
}

function whereOf(row: SearchPlace, context: RowContext): string {
  return `${row.area ?? ''} ${row.address ?? context.addresses.get(row.poiId ?? row.id) ?? ''}`;
}

function kindHeading(category: string): string {
  const kind = kindWord(category) ?? t({ id: 'search.name.kindPlaces', message: 'Places' });
  return t({ id: 'search.name.kindBelow', message: `${kind}, nearest first` });
}

function noneLine(address: boolean, asked: string | undefined): string {
  if (address)
    return t({ id: 'search.name.noneAddress', message: 'Nothing found at that address' });
  if (asked === undefined || asked === '') {
    return t({ id: 'search.name.none', message: 'No place called that' });
  }
  return t({ id: 'search.name.noneNamed', message: `No place called “${asked}”` });
}

export function FindNames(props: FindNamesProps) {
  const theme = usePremiumTheme();
  const { asked, context, state, live } = props;
  const answer =
    asked === undefined
      ? null
      : nameAnswer(
          asked,
          props.rows.map((row) => ({ ...row, where: whereOf(row, context) })),
          context.destination,
        );
  const missed = answer?.kind === 'notFound' ? answer : null;
  const sayMissed = missed !== null && !(missed.address && props.addressFound);
  const rows =
    missed === null
      ? props.rows
      : missed.below.rows === 'none'
        ? []
        : missed.below.rows === 'kind'
          ? nearestFirst(props.rows, context.from)
          : props.rows;
  const heading =
    missed === null || rows.length === 0
      ? null
      : missed.below.rows === 'kind'
        ? kindHeading(missed.below.category)
        : t({ id: 'search.name.alike', message: 'Names a bit like it' });
  const notFound = sayMissed || (props.rows.length === 0 && state === 'none');
  return (
    <View style={{ gap: theme.space.gap16 }} testID="search-name-results">
      {props.rows.length === 0 && state === 'searching' ? <FindSkeleton /> : null}
      {notFound ? (
        <GuideDock
          guideName={props.guideName}
          critter={props.critter}
          text={noneLine(missed?.address === true, asked)}
          action={{
            label: t({ id: 'search.none.pin', message: 'Drop a pin' }),
            onPress: props.onDropPin,
            testID: 'search-name-pin',
          }}
          testID="search-name-none"
        />
      ) : null}
      {notFound ? (
        <TextButton
          label={t({ id: 'search.name.ask', message: `Ask ${props.guideName}` })}
          onPress={props.onAsk}
          testID="search-name-ask"
        />
      ) : null}
      {props.rows.length === 0 && state === 'arriving' ? (
        <Text variant="body" tone="muted" testID="search-name-arriving">
          {t({
            id: 'search.name.arriving',
            message: "This trip's places are still arriving on this phone. Try again in a moment.",
          })}
        </Text>
      ) : null}
      {heading === null ? null : <SectionLabel>{heading}</SectionLabel>}
      {rows.length === 0 ? null : (
        <ListCard>
          {rows.map((place, index) => {
            const words = rowWords(place, context);
            const name = place.name;
            return (
              <PlaceResultRow
                key={place.poiId ?? place.id}
                title={name}
                meta={words.meta}
                icon={placeIcon(place.category)}
                photo={place.poiId === null ? undefined : props.photos.get(place.poiId)?.tile.photo}
                onPress={() => props.onOpen(place)}
                {...(place.poiId === null || words.inPlan
                  ? {}
                  : {
                      onAdd: () => props.onAdd(place),
                      addLabel: t({ id: 'search.row.add', message: `Add ${name}` }),
                      addTestID: `search-row-add-${String(index)}`,
                    })}
                testID={
                  words.inPlan
                    ? `search-row-in-plan-${String(index)}`
                    : `search-row-${String(index)}`
                }
              />
            );
          })}
        </ListCard>
      )}
      {state === 'failed' || props.incomplete ? (
        <View style={{ gap: theme.space.gap8 }} testID="search-name-failed">
          <Text variant="body">
            {rows.length === 0
              ? t({ id: 'search.name.failed', message: "The search didn't go through." })
              : t({ id: 'search.name.incomplete', message: "Couldn't reach more places." })}
          </Text>
          <Button
            label={t({ id: 'search.link.retry', message: 'Try again' })}
            size="small"
            variant="secondary"
            onPress={props.onRetry}
            testID="search-name-retry"
          />
        </View>
      ) : null}
      {live.kind === 'done' && live.places.length > 0 ? (
        <View style={{ gap: theme.space.gap8 }} testID="search-more-places">
          <SectionLabel>{t({ id: 'search.more.eyebrow', message: 'More places' })}</SectionLabel>
          <ListCard>
            {live.places.map((place) => (
              <PlaceResultRow
                key={place.fsqPlaceId}
                title={place.name}
                meta={place.address ?? undefined}
                icon="pin"
                trailing={props.pickingLive === place.fsqPlaceId ? <Spinner /> : undefined}
                onPress={props.pickingLive === null ? () => props.onPickLive(place) : undefined}
                testID={`search-more-${place.fsqPlaceId}`}
              />
            ))}
          </ListCard>
          <Text variant="caption" tone="muted">
            {t({ id: 'search.more.attribution', message: 'Powered by Foursquare' })}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
