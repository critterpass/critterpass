/**
 * Lab scenes for the places map and list over a seeded Bali trip: the map with saved places, the
 * plan's routes and Tokek's picks (7c-1), Tirta Empul picked with its cards (7c-2) and the same
 * places as rows (7c-3). Chips, cards, the sort menu and swipes work over the fixtures; nothing is
 * sent.
 */
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState, type ReactNode } from 'react';

import { LAB_PHOTOS } from '@/data/media/dev/lab-place-photos';
import type { PlaceTilePhotos } from '@/data/media/use-place-tile-photos';
import { guideFor } from '../../format';
import type { HubPlace, PlacesFilter } from '../places-model';
import { PlacesListView } from '../places-list-view';
import { PlacesMapView } from '../places-map-view';
import { fitLines, weekdaysOf } from '../use-place-fits';
import {
  LAB_CREW,
  LAB_DAYS,
  LAB_FITS,
  LAB_PLACES,
  LAB_ROUTES,
  LAB_TODAY,
  LAB_TZ,
  VILLA,
} from './bali-places-fixture';

const noop = () => undefined;

/** Sample photos for the seeded places: their own, a generic stand-in, and none for the rest. */
const PHOTOS: PlaceTilePhotos = new Map([
  ['tirta', LAB_PHOTOS.temple],
  ['seniman', LAB_PHOTOS.food],
  ['lempuyang', LAB_PHOTOS.temple],
  ['cepung', LAB_PHOTOS.generic],
  ['murni', LAB_PHOTOS.food],
  ['kawi', LAB_PHOTOS.temple],
  ['tegallalang', LAB_PHOTOS.terraces],
  ['tibumana', LAB_PHOTOS.generic],
  ['locavore', LAB_PHOTOS.food],
]);

function useLabLines() {
  const { i18n } = useLingui();
  return useMemo(() => {
    const weekdays = weekdaysOf(LAB_DAYS, i18n.locale);
    return {
      weekdays,
      lines: fitLines([LAB_FITS], { weekdays, tz: LAB_TZ, stopName: () => null }),
    };
  }, [i18n.locale]);
}

function MapScene({ placeId }: { readonly placeId?: string }) {
  const [filter, setFilter] = useState<PlacesFilter>('all');
  const { lines } = useLabLines();
  return (
    <PlacesMapView
      inTrip
      loaded
      places={LAB_PLACES}
      crew={LAB_CREW}
      routes={LAB_ROUTES}
      today={LAB_TODAY}
      destinationName="Bali"
      destinationSlug="bali"
      guide={guideFor('tokek')}
      stay={VILLA}
      tz={LAB_TZ}
      canDraw
      localRegionUri={null}
      pack={null}
      placeId={placeId}
      filter={filter}
      onFilter={setFilter}
      onLeaveResults={noop}
      fitLines={lines}
      photos={PHOTOS}
      onAsk={noop}
      onOpen={noop}
      onAdd={noop}
      onSearch={noop}
      onList={noop}
      onBack={noop}
    />
  );
}

function ListScene() {
  const [filter, setFilter] = useState<PlacesFilter>('all');
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [saved, setSaved] = useState<ReadonlySet<string>>(new Set());
  const { lines, weekdays } = useLabLines();
  const places = useMemo(
    () =>
      LAB_PLACES.filter((place) => !hidden.has(place.id)).map((place): HubPlace =>
        saved.has(place.id) ? { ...place, standing: 'saved', backerIds: ['maya'] } : place,
      ),
    [hidden, saved],
  );
  return (
    <PlacesListView
      inTrip
      places={places}
      crew={LAB_CREW}
      stay={VILLA}
      destinationName="Bali"
      guide={guideFor('tokek')}
      filter={filter}
      onFilter={setFilter}
      onLeaveResults={noop}
      fits={LAB_FITS}
      lines={lines}
      photos={PHOTOS}
      weekdays={weekdays}
      suggestOrder={null}
      suggestTotal={null}
      sponsored={null}
      hidden={[]}
      onUnhide={noop}
      onAction={(place, action) =>
        action === 'save'
          ? setSaved((now) => new Set(now).add(place.id))
          : setHidden((now) => new Set(now).add(place.id))
      }
      onOpen={noop}
      onAdd={noop}
      onSplit={noop}
      onSearch={noop}
      onMap={noop}
      onBack={noop}
    />
  );
}

export const PLACES_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'places-map': () => <MapScene />,
  'places-picked': () => <MapScene placeId="tirta" />,
  'places-list': () => <ListScene />,
};
