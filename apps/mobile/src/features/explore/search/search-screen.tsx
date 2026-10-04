/**
 * Search (7d-1): one field that starts from wherever it was opened (the map's area, a day, a
 * place, or the whole destination). Empty, it offers a copied link, three plain-words examples and
 * kinds of place to browse; typing shows the phone's places at once and the server's after them.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids, never copy. */
import { t } from '@lingui/core/macro';
import { router, type Href } from 'expo-router';
import { useState } from 'react';

import { matchPlaceRef } from './search-navigation';
import {
  useLivePlaces,
  wantsLivePlaces,
  resolveLivePlace,
  type LivePlace,
} from '@/data/places/more-places';
import type { PlaceCandidate } from '@/data/places/match-places';
import { useTripPlaceSearch } from '@/data/places/use-trip-place-search';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';

import { BrowseGrid, type BrowseTile } from './browse-grid';
import { DropPinSheet } from './drop-pin-sheet';
import { ClipboardCard } from './clipboard-card';
import type { ClipboardLink } from './clipboard';
import { useSearchServices } from './data/search-services';
import { NameResults } from './name-results';
import { PlainBlock } from './plain-block';
import { searchRoutes, type SearchParams } from './routes';
import { SearchView } from './search-view';
import { plainExamples, TypedExamples } from './typed-examples';
import { useClipboardLink } from './use-clipboard-link';
import { useScopePlace, useSearchTrip, type SearchTrip } from './use-search-trip';

export interface SearchScreenProps extends SearchParams {
  readonly tripId: string;
}

function parseNear(value: string | undefined): { lat: number; lng: number } | null {
  if (value === undefined) return null;
  const [lat, lng] = value.split(',').map(Number);
  return lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng)
    ? null
    : { lat, lng };
}

function scopeLabel(
  props: SearchScreenProps,
  trip: SearchTrip,
  place: string | null,
): string | null {
  switch (props.scope) {
    case 'map':
      return t({ id: 'search.scope.map', message: 'In this area' });
    case 'day': {
      const day = trip.days.find((entry) => entry.id === props.dayId);
      if (day === undefined) return null;
      const no = day.dayNo;
      const weekday = day.weekday;
      return weekday === null
        ? t({ id: 'search.scope.dayNo', message: `For day ${no}` })
        : t({ id: 'search.scope.day', message: `For day ${no} · ${weekday}` });
    }
    case 'place':
      return place === null ? null : t({ id: 'search.scope.place', message: `Near ${place}` });
    case 'explore':
    case undefined:
      return null;
  }
}

/** A search row for a place known only by its id. */
function poiRef(poiId: string): PlaceCandidate {
  return {
    id: poiId,
    poiId,
    name: '',
    nameLocal: null,
    category: null,
    lat: null,
    lng: null,
    tags: [],
    source: 'server',
  };
}

export function SearchScreen(props: SearchScreenProps) {
  const { tripId } = props;
  const services = useSearchServices();
  const trip = useSearchTrip(tripId);
  const place = useScopePlace(props.scope === 'place' ? (props.poiId ?? null) : null);
  const [query, setQuery] = useState(props.q ?? '');
  const [asked, setAsked] = useState<string | null>(props.q ?? null);
  const [pinning, setPinning] = useState(false);
  const type = (text: string) => {
    setQuery(text);
    setAsked(null);
  };
  const ask = (question: string) => {
    const trimmed = question.trim();
    if (trimmed === '') return;
    setQuery(trimmed);
    setAsked(trimmed);
  };
  const near =
    parseNear(props.near) ??
    (place !== null && place.lat !== null && place.lng !== null
      ? { lat: place.lat, lng: place.lng }
      : null);
  const search = useTripPlaceSearch({
    destinationId: trip.destinationId,
    tripId,
    query,
    near,
  });
  const typed = query.trim();
  const live = useLivePlaces({
    getJson: services.getJson,
    destinationId: trip.destinationId,
    query: typed,
    wanted: wantsLivePlaces(
      typed,
      search.state === 'searching' || search.more ? null : search.rows.length,
      search.offline,
    ),
  });
  const clipboard = useClipboardLink(typed === '');

  const go = (href: Href | undefined) => {
    if (href !== undefined) router.push(href);
  };
  const openPlace = (target: PlaceCandidate) =>
    go(matchPlaceRef(tripId, trip.destinationId, target, 'open'));
  const addPlace = (target: PlaceCandidate) =>
    go(matchPlaceRef(tripId, trip.destinationId, target, 'add'));
  const pickLive = (picked: LivePlace) => {
    if (trip.destinationId === null) return;
    void resolveLivePlace(services.getJson, trip.destinationId, picked).then((pick) => {
      if (pick.kind === 'ready') openPlace(poiRef(pick.poiId));
    });
  };
  const browse = (tile: BrowseTile) => {
    const list = hrefFor('7c-3', { tripId, category: tile.category });
    if (list === undefined) type(tile.word);
    else router.push(list);
  };
  const addFromLink = (link: ClipboardLink) =>
    router.push(searchRoutes.link(tripId, { url: link.url }));
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
      }}
      scope={scopeLabel(props, trip, place?.name ?? null)}
      overlay={
        pinning ? (
          <DropPinSheet
            tripId={tripId}
            destinationId={trip.destinationId}
            destinationSlug={trip.destinationSlug}
            start={near}
            name=""
            onSaved={(name) => {
              setPinning(false);
              toast.show({
                id: 'search-pin-saved',
                title: t({ id: 'search.pin.saved', message: `${name} is in Ideas` }),
              });
            }}
            onClose={() => setPinning(false)}
          />
        ) : null
      }
    >
      {asked !== null ? (
        <PlainBlock
          key={asked}
          question={asked}
          tripId={tripId}
          trip={trip}
          area={place?.name ?? trip.destination}
          onOpen={(poiId) => openPlace(poiRef(poiId))}
          onAdd={(poiId) => addPlace(poiRef(poiId))}
          onDropPin={() => setPinning(true)}
          onAsk={() => go(hrefFor('3j-1', { tripId, q: asked }))}
        />
      ) : typed === '' ? (
        <>
          <ClipboardCard
            state={clipboard.state}
            onAdd={addFromLink}
            onPasted={clipboard.onPasted}
          />
          <TypedExamples
            examples={plainExamples({ destination: trip.destination, freeWeekday })}
            onAsk={ask}
          />
          <BrowseGrid onBrowse={browse} />
        </>
      ) : (
        <NameResults
          rows={search.rows}
          state={search.state}
          live={live}
          onOpen={openPlace}
          onAdd={addPlace}
          onPickLive={pickLive}
        />
      )}
    </SearchView>
  );
}
