/**
 * Search (7d-1): one field that starts from wherever it was opened (the map's area, a day, a
 * place, or the whole destination). Empty, it offers a copied link, three plain-words examples and
 * kinds of place to browse; typing shows the phone's places at once and the server's after them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';

import { useSettleProvisionalIdeas } from '../place-detail/provisional-idea';
import { matchPlaceRef } from './search-navigation';
import {
  useLivePlaces,
  wantsLivePlaces,
  resolveLivePlace,
  type LivePlace,
} from '@/data/places/more-places';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { PlaceCandidate } from '@/data/places/match-places';
import { useOnline } from '@/data/places/server-name-search';
import { useTripPlaceSearch } from '@/data/places/use-trip-place-search';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';

import { looksLikeAddress, wantsAddresses } from './address-rule';
import { AddressSection } from './address-section';
import { BrowseGrid, type BrowseTile } from './browse-grid';
import { DropPinSheet } from './drop-pin-sheet';
import { ClipboardCard } from './clipboard-card';
import { typedLink } from './clipboard';
import { fetchSearchPlaces } from './data/fetch-search-places';
import { useSearchServices } from './data/search-services';
import { NameResults } from './name-results';
import { OfflineBanner } from './offline-banner';
import { OfflineSection } from './offline-section';
import { PlainBlock } from './plain-block';
import { searchRoutes, type SearchParams } from './routes';
import { useShownRows } from './use-shown-rows';
import { parseNear, poiRef, scopeLabel } from './search-scope';
import { SearchView } from './search-view';
import { TypedLinkCard } from './typed-link-card';
import { plainExamples, TypedExamples } from './typed-examples';
import { useAddPlace } from './use-add-place';
import { useAddresses, useDestinationCentre, type AddressPoint } from './use-addresses';
import { useClipboardLink } from './use-clipboard-link';
import { usePhoneAddresses } from './use-phone-addresses';
import { useQueuedPlainQuestion } from './use-queued-plain-question';
import { useScopePlace, useSearchTrip } from './use-search-trip';

export interface SearchScreenProps extends SearchParams {
  readonly tripId: string;
}

export function SearchScreen(props: SearchScreenProps) {
  const { tripId } = props;
  const services = useSearchServices();
  useSettleProvisionalIdeas();
  const trip = useSearchTrip(tripId);
  const place = useScopePlace(props.scope === 'place' ? (props.poiId ?? null) : null);
  const [query, setQuery] = useState(props.q ?? '');
  const [asked, setAsked] = useState<string | null>(props.q ?? null);
  // DROP A PIN, opened bare or on a picked address: its spot, the traveller's own words as the
  // name, and the address found as the sheet's hint.
  const [pinning, setPinning] = useState<{
    readonly start: AddressPoint | null;
    readonly name: string;
    readonly near?: string;
  } | null>(null);
  // Chips a submitted question parsed into: null until it has been read.
  const [chips, setChips] = useState<number | null>(null);
  const type = (text: string) => {
    setQuery(text);
    setAsked(null);
    setChips(null);
  };
  // A link in the field is added from, never searched by name or looked up as an address.
  const link = typedLink(query);
  const searched = link === null ? query : '';
  const ask = (words: string) => {
    const trimmed = words.trim();
    if (trimmed === '') return;
    const asLink = typedLink(trimmed);
    if (asLink !== null) {
      router.push(searchRoutes.link(tripId, { url: asLink.url }));
      return;
    }
    setQuery(trimmed);
    if (trimmed !== asked) setChips(null);
    setAsked(trimmed);
    // Plain words need signal: with none, the guide keeps the question for the first bar.
    if (!online) question.ask(trimmed);
  };
  const near =
    parseNear(props.near) ??
    (place !== null && place.lat !== null && place.lng !== null
      ? { lat: place.lat, lng: place.lng }
      : null);
  const nearKey = near === null ? null : `${String(near.lat)},${String(near.lng)}`;
  // `nearKey` stands for `near`: the same point in a new object is the same fetcher.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const fetchPlaces = useMemo(() => fetchSearchPlaces(near), [nearKey]);
  const search = useTripPlaceSearch({
    destinationId: trip.destinationId,
    tripId,
    query: searched,
    near,
    fetchPlaces,
  });
  const rows = useShownRows(search.rows, trip.destinationId);
  const rowIds = useMemo(
    () => rows.flatMap((row) => (row.poiId === null ? [] : [row.poiId])),
    [rows],
  );
  const photos = usePlaceTilePhotos(rowIds);
  const knownAddresses = usePhoneAddresses(rowIds);
  const typed = searched.trim();
  const found = search.state === 'searching' || search.more ? null : rows.length;
  const live = useLivePlaces({
    getJson: services.getJson,
    destinationId: trip.destinationId,
    query: typed,
    wanted: wantsLivePlaces(typed, found, search.offline),
  });
  const clipboard = useClipboardLink(query.trim() === '');
  const online = useOnline();
  const centre = useDestinationCentre(trip.destinationId);
  const addressState = useAddresses({
    getJson: services.getJson,
    query: typed,
    near: near ?? centre,
    wanted: wantsAddresses({
      query: typed,
      results: found,
      offline: !online || search.offline,
      question: asked === null ? false : chips === null ? null : chips > 0,
    }),
  });
  const addresses = (
    <AddressSection
      state={addressState}
      onPick={(address) =>
        setPinning({
          start: { lat: address.lat, lng: address.lng },
          name: typed,
          near: address.rest === null ? address.line : `${address.line}, ${address.rest}`,
        })
      }
    />
  );
  const question = useQueuedPlainQuestion({ tripId, online, guideName: trip.guideName });

  const go = (href: Href | undefined) => {
    if (href !== undefined) router.push(href);
  };
  const openPlace = (target: PlaceCandidate) =>
    go(matchPlaceRef(tripId, trip.destinationId, target, 'open'));
  const add = useAddPlace({
    tripId,
    destinationId: trip.destinationId,
    dayId: props.scope === 'day' ? props.dayId : undefined,
  });
  const addPlace = (target: PlaceCandidate) => {
    if (target.poiId === null) return;
    add({ poiId: target.poiId, name: target.name });
  };
  const dropPin = () => setPinning({ start: null, name: typed });
  const askGuide = (words: string) => go(hrefFor('3j-1', { tripId, q: words }));
  const addressFirst = looksLikeAddress(typed);
  const pickLive = (picked: LivePlace) => {
    if (trip.destinationId === null) return;
    void resolveLivePlace(services.getJson, trip.destinationId, picked).then((pick) => {
      if (pick.kind === 'ready') openPlace(poiRef(pick.poiId));
    });
  };
  const browse = (tile: BrowseTile) => {
    const list =
      tile.filter === null ? undefined : hrefFor('7c-3', { tripId, filter: tile.filter });
    // A kind the list has no filter for (coffee, waterfalls) is asked for in words.
    if (list === undefined) ask(tile.label());
    else router.push(list);
  };
  const addFromLink = (from: { readonly url: string }) =>
    router.push(searchRoutes.link(tripId, { url: from.url }));
  const freeWeekday = trip.days.find((day) => day.weekday !== null)?.weekday ?? null;

  return (
    <SearchView
      header={{
        value: query,
        onChangeText: type,
        onSubmit: () => ask(query),
        onCancel: () => router.back(),
        destination: trip.destination,
        guide: trip.guide,
        guideName: trip.guideName,
        dimmed: !online,
        asked: asked !== null,
      }}
      scope={scopeLabel(props, trip, place?.name ?? null)}
      banner={
        !online || question.answered ? (
          <OfflineBanner answered={online && question.answered} guideName={trip.guideName} />
        ) : null
      }
      overlay={
        pinning !== null ? (
          <DropPinSheet
            tripId={tripId}
            destinationId={trip.destinationId}
            destinationSlug={trip.destinationSlug}
            start={pinning.start ?? near}
            name={pinning.name}
            hint={pinning.near}
            onSaved={(name) => {
              setPinning(null);
              toast.show({
                id: 'search-pin-saved',
                title: t({ id: 'search.pin.saved', message: `${name} is in Ideas` }),
              });
            }}
            onClose={() => setPinning(null)}
          />
        ) : null
      }
    >
      {link !== null ? (
        <TypedLinkCard link={link} guideName={trip.guideName} onAdd={() => addFromLink(link)} />
      ) : !online && typed !== '' ? (
        <OfflineSection
          search={search}
          trip={trip}
          area={place?.name ?? trip.destination}
          from={near}
          queued={question.queued}
          onOpen={(key) => openPlace(poiRef(key))}
        />
      ) : asked !== null ? (
        <PlainBlock
          key={asked}
          question={asked}
          tripId={tripId}
          trip={trip}
          area={place?.name ?? trip.destination}
          whole={place === null}
          onOpen={(poiId) => openPlace(poiRef(poiId))}
          onAdd={(poiId, name) => add({ poiId, name })}
          onDropPin={() => setPinning({ start: null, name: '' })}
          addresses={addresses}
          onChips={setChips}
          onAsk={() => askGuide(asked)}
        />
      ) : typed === '' ? (
        <>
          <ClipboardCard
            state={clipboard.state}
            onAdd={addFromLink}
            onPasted={clipboard.onPasted}
          />
          <TypedExamples
            examples={plainExamples({
              destination: trip.destination,
              freeWeekday,
              stay: trip.hasStay,
            })}
            onAsk={ask}
          />
          <BrowseGrid onBrowse={browse} />
        </>
      ) : (
        <>
          {addressFirst ? addresses : null}
          <NameResults
            rows={rows}
            state={search.state}
            live={live}
            photos={photos}
            onOpen={openPlace}
            onAdd={addPlace}
            onPickLive={pickLive}
            context={{
              destination: trip.destination,
              from: near ?? centre,
              addresses: knownAddresses,
              planDays: trip.planDays,
            }}
            asked={search.more || search.state === 'searching' ? undefined : typed}
            addressFound={addressState.kind === 'done' && addressState.addresses.length > 0}
            notFound={{
              guideName: trip.guideName,
              onDropPin: dropPin,
              onAsk: () => askGuide(typed),
            }}
          />
          {addressFirst ? null : addresses}
        </>
      )}
    </SearchView>
  );
}
