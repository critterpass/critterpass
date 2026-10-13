/**
 * Search's state and actions (7d-1…7d-4, 7i-2), shared by the screen's two looks: what was typed
 * and asked, the phone's and the server's places for it, addresses, the copied link, the queued
 * question with no signal, and where each tap goes. The views only draw what this returns.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';

import { useLivePlaces, wantsLivePlaces } from '@/data/places/more-places';
import { usePlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import type { PlaceCandidate } from '@/data/places/match-places';
import { useOnline } from '@/data/places/server-name-search';
import { useTripPlaceSearch } from '@/data/places/use-trip-place-search';
import { goBackOr } from '@/lib/navigation/back';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';

import { tripExploreLinks } from '../trip-explore/links';
import { looksLikeAddress, wantsAddresses } from './address-rule';
import type { BrowseTile } from './browse-tiles';
import { typedLink } from './clipboard';
import { fetchSearchPlaces } from './data/fetch-search-places';
import { useSearchServices } from './data/search-services';
import { searchRoutes, type SearchParams } from './routes';
import { matchPlaceRef } from './search-navigation';
import { parseNear, poiRef, scopeLabel } from './search-scope';
import { nearestRows, useTripDayPoint } from './trip-day';
import { useAddPlace } from './use-add-place';
import {
  useAddresses,
  useDestinationCentre,
  type AddressPoint,
  type FoundAddress,
} from './use-addresses';
import { useClipboardLink } from './use-clipboard-link';
import { usePhoneAddresses } from './use-phone-addresses';
import { usePickLive } from './use-pick-live';
import { useQueuedPlainQuestion } from './use-queued-plain-question';
import { useScopePlace, useSearchTrip } from './use-search-trip';
import { useShownRows } from './use-shown-rows';

export interface SearchControllerProps extends SearchParams {
  readonly tripId: string;
}

/** DROP A PIN, opened bare or on a picked address. */
export interface PinStart {
  readonly start: AddressPoint | null;
  readonly name: string;
  readonly near?: string;
}

export function useSearchController(props: SearchControllerProps) {
  const { tripId } = props;
  const services = useSearchServices();
  const focusDayId = props.scope === 'day' ? (props.dayId ?? null) : null;
  const trip = { ...useSearchTrip(tripId), focusDayId };
  const tripDayPoint = useTripDayPoint(trip);
  const place = useScopePlace(props.scope === 'place' ? (props.poiId ?? null) : null);
  const [query, setQuery] = useState(props.q ?? '');
  const [asked, setAsked] = useState<string | null>(props.q ?? null);
  // DROP A PIN, opened bare or on a picked address: its spot, the traveller's own words as the
  // name, and the address found as the sheet's hint.
  const [pinning, setPinning] = useState<PinStart | null>(null);
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
  const at = place?.lat == null || place.lng == null ? null : { lat: place.lat, lng: place.lng };
  const near = parseNear(props.near) ?? at ?? tripDayPoint;
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
  const rows = nearestRows(useShownRows(search.rows, trip.destinationId), tripDayPoint);
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
  const pickAddress = (address: FoundAddress) =>
    setPinning({
      start: { lat: address.lat, lng: address.lng },
      name: typed,
      near: address.rest === null ? address.line : `${address.line}, ${address.rest}`,
    });
  const question = useQueuedPlainQuestion({ tripId, online, guideName: trip.guideName });

  const go = (href: Href | undefined) => {
    if (href !== undefined) router.push(href);
  };
  const openPlace = (target: PlaceCandidate) =>
    go(matchPlaceRef(tripId, trip.destinationId, target, 'open'));
  const openPoi = (poiId: string) => openPlace(poiRef(poiId));
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
  const livePick = usePickLive({
    getJson: services.getJson,
    destinationId: trip.destinationId,
    onReady: openPoi,
  });
  const browse = (tile: BrowseTile) => {
    const list =
      tile.filter === null ? undefined : hrefFor('7c-3', { tripId, filter: tile.filter });
    // A kind the list has no filter for (coffee, waterfalls) is asked for in words.
    if (list === undefined) ask(tile.label());
    else router.push(list);
  };
  const addFromLink = (from: { readonly url: string }) =>
    router.push(searchRoutes.link(tripId, { url: from.url }));
  const pinSaved = (name: string) => {
    setPinning(null);
    toast.show({
      id: 'search-pin-saved',
      title: t({ id: 'search.pin.saved', message: `${name} is in Ideas` }),
    });
  };

  return {
    tripId,
    trip,
    place,
    scope: scopeLabel(props, trip, place?.name ?? null),
    /** Where the search looked, for "Nothing like that near Ubud". */
    area: place?.name ?? trip.destination,
    query,
    type,
    ask,
    asked,
    setChips,
    link,
    typed,
    online,
    search,
    rows,
    photos,
    knownAddresses,
    live,
    livePick,
    clipboard,
    near,
    centre,
    addressState,
    addressFirst: looksLikeAddress(typed),
    pickAddress,
    question,
    pinning,
    setPinning,
    pinSaved,
    openPlace,
    openPoi,
    add,
    addPlace,
    dropPin,
    askGuide,
    browse,
    addFromLink,
    freeWeekday: trip.days.find((day) => day.weekday !== null)?.weekday ?? null,
    cancel: () => goBackOr(tripExploreLinks.hub(tripId)),
  };
}

export type SearchController = ReturnType<typeof useSearchController>;
