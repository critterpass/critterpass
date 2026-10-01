/**
 * Lab scenes for the Explore map (3d-4): the map inside a trip with a place chosen, far from the
 * destination, with location off, with nothing matching, offline without the region on this
 * phone, the list view with a sponsored row, and Đà Nẵng with long Vietnamese names. Search, the
 * chips, the cards and the list toggle work over the fixtures.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { useMemo, useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { useFlyTo } from '@/ui/map/useFlyTo';

import { ExploreMapCanvas } from '../components/explore-map-canvas';
import { ExploreMapView } from '../components/explore-map-view';
import type { CarouselCard } from '../components/place-carousel';
import { RegionPackCardView } from '../components/region-pack-card';
import { guideFor } from '../format';
import { awayLine, cardMeta, planChip } from '../map-copy';
import {
  centreOf,
  filterCounts,
  filterPlaces,
  type FilterContext,
  type MapFilter,
  type MapPoi,
  type Point,
} from '../map-model';
import { openState } from '../place-model';

const span = [{ start: '00:00', end: '24:00' }];
const ALWAYS = {
  weekly: { mo: span, tu: span, we: span, th: span, fr: span, sa: span, su: span },
};
const poi = (id: string, name: string, category: string, lat: number, lng: number): MapPoi => ({
  id,
  name,
  nameLocal: null,
  category,
  lat,
  lng,
  hours: category === 'temple_shrine' || category === 'beach' ? ALWAYS : null,
});

const KYOTO: readonly MapPoi[] = [
  poi('fushimi', 'Fushimi Inari', 'temple_shrine', 34.9671, 135.7727),
  poi('nishiki', 'Nishiki Market', 'market', 35.005, 135.7649),
  poi('gion', 'Gion', 'nightlife', 35.0037, 135.7751),
  poi('arashiyama', 'Arashiyama', 'nature', 35.0094, 135.6668),
  poi('kiyomizu', 'Kiyomizu-dera', 'temple_shrine', 34.9949, 135.785),
  poi('pontocho', 'Pontocho Alley', 'food', 35.0052, 135.7708),
  poi('yasaka', 'Yasaka Shrine', 'temple_shrine', 35.0036, 135.7786),
];
const DA_NANG: readonly MapPoi[] = [
  poi('son-tra', 'Bán đảo Sơn Trà và chùa Linh Ứng', 'nature', 16.1003, 108.2779),
  poi('marble', 'Ngũ Hành Sơn (Marble Mountains)', 'nature', 16.0034, 108.2639),
  poi('con', 'Chợ Cồn', 'market', 16.0679, 108.2143),
  poi('my-khe', 'Bãi biển Mỹ Khê', 'beach', 16.0612, 108.2468),
  poi('banh-mi', 'Bánh mì Bà Lan', 'food', 16.0755, 108.2217),
];
const CREW = [
  { key: 'm', name: 'Maya', joinIndex: 0 },
  { key: 'j', name: 'Jordan', joinIndex: 1 },
  { key: 'r', name: 'Rin', joinIndex: 3 },
  { key: 'a', name: 'Alex', joinIndex: 4 },
];
const NOW = new Date('2027-04-03T01:00:00Z');

interface MapSpec {
  readonly name: string;
  readonly guide: string;
  readonly tz: string;
  readonly places: readonly MapPoi[];
  readonly selected?: string;
  readonly keen?: Readonly<Record<string, number>>;
  readonly planned?: Readonly<Record<string, string>>;
  readonly saved?: readonly string[];
  readonly you?: Point | undefined;
  readonly awayMeters?: number;
  readonly locationOff?: boolean;
  readonly filters?: readonly MapFilter[];
  readonly query?: string;
  readonly mode?: 'map' | 'list';
  /** Offline with no region on this phone: the map cannot draw. */
  readonly noMap?: boolean;
  readonly sponsored?: string;
  readonly inTrip?: boolean;
}

const TRIP: MapSpec = {
  name: 'Kyoto',
  guide: 'pon',
  tz: 'Asia/Tokyo',
  places: KYOTO,
  selected: 'fushimi',
  keen: { fushimi: 4, nishiki: 2, arashiyama: 1 },
  planned: { fushimi: '2027-04-02T21:00:00Z' },
  saved: ['fushimi', 'nishiki', 'gion'],
  you: { lat: 34.985, lng: 135.758 },
  inTrip: true,
};

const SPECS: Readonly<Record<string, MapSpec>> = {
  map: TRIP,
  'map-away': {
    ...TRIP,
    you: undefined,
    awayMeters: 607_000,
    inTrip: false,
    keen: {},
    planned: {},
  },
  'map-location-off': { ...TRIP, you: undefined, locationOff: true },
  'map-no-results': { ...TRIP, filters: ['crew', 'food'], query: 'sushi' },
  'map-offline-no-pack': { ...TRIP, you: undefined, noMap: true },
  'map-list': { ...TRIP, mode: 'list', sponsored: 'pontocho' },
  'map-da-nang': {
    name: 'Đà Nẵng',
    guide: 'chava',
    tz: 'Asia/Ho_Chi_Minh',
    places: DA_NANG,
    selected: 'marble',
    saved: ['my-khe'],
    sponsored: 'banh-mi',
  },
};

function MapScene({ spec }: { readonly spec: MapSpec }) {
  const locale = useLocale();
  const { cameraRef, flyToPlace, fitToBounds } = useFlyTo();
  const [mode, setMode] = useState(spec.mode ?? 'map');
  const [query, setQuery] = useState(spec.query ?? '');
  const [filters, setFilters] = useState<ReadonlySet<MapFilter>>(new Set(spec.filters ?? []));
  const [selectedId, setSelectedId] = useState<string | null>(spec.selected ?? null);
  const [pack, setPack] = useState<'none' | 'downloading'>('none');
  const context = useMemo(
    (): FilterContext => ({
      savedIds: new Set(spec.saved ?? []),
      crewIds: new Set(Object.keys(spec.keen ?? {})),
      tz: spec.tz,
      now: NOW,
    }),
    [spec],
  );
  const shown = filterPlaces(spec.places, filters, query, context);
  const cards = shown.map((place): CarouselCard => {
    const start = spec.planned?.[place.id];
    return {
      id: place.id,
      name: place.name,
      category: place.category,
      meta: cardMeta(place.category, openState(place.hours, spec.tz, NOW)),
      keen: CREW.slice(0, spec.keen?.[place.id] ?? 0),
      planChip: start === undefined ? null : planChip(2, start, spec.tz),
      ...(spec.sponsored === place.id ? { sponsored: { onWhy: () => undefined } } : {}),
    };
  });
  const selected = shown.find((place) => place.id === selectedId) ?? null;
  return (
    <ExploreMapView
      // Re-words the scene when the lab switches language.
      key={locale}
      destinationName={spec.name}
      mode={mode}
      onToggleMode={() => setMode((current) => (current === 'map' ? 'list' : 'map'))}
      query={query}
      onQuery={setQuery}
      filters={filters}
      counts={filterCounts(spec.places, context)}
      inTrip={spec.inTrip ?? false}
      onToggleFilter={(filter) =>
        setFilters((current) => {
          const next = new Set(current);
          if (!next.delete(filter)) next.add(filter);
          return next;
        })
      }
      cards={cards}
      selectedId={selectedId}
      onSettle={(id) => {
        setSelectedId(id);
        const place = spec.places.find((candidate) => candidate.id === id);
        if (place !== undefined) flyToPlace([place.lng, place.lat]);
      }}
      onOpen={() => undefined}
      onBack={() => undefined}
      canvas={
        spec.noMap === true ? null : (
          <ExploreMapCanvas
            places={shown.map((place) => ({
              ...place,
              faces: CREW.slice(0, spec.keen?.[place.id] ?? 0),
            }))}
            selectedId={selectedId}
            onSelect={setSelectedId}
            centre={selected ?? centreOf(spec.places) ?? { lat: 0, lng: 0 }}
            destinationSlug={null}
            localRegionUri={null}
            you={spec.you ?? null}
            guide={guideFor(spec.guide)}
            cameraRef={cameraRef}
            onFit={fitToBounds}
          />
        )
      }
      pack={
        <RegionPackCardView
          destinationName={spec.name}
          status={pack}
          progress={0.42}
          bytes={null}
          onDownload={() => setPack('downloading')}
          onRemove={() => setPack('none')}
        />
      }
      away={spec.awayMeters === undefined ? null : awayLine(locale, spec.awayMeters, spec.name)}
      locationOff={spec.locationOff ?? false}
      onLocationSettings={() => undefined}
      loading={false}
    />
  );
}

export const MAP_SCENES: Readonly<Record<string, () => ReactNode>> = Object.fromEntries(
  Object.entries(SPECS).map(([name, spec]) => [name, () => <MapScene spec={spec} />]),
);
