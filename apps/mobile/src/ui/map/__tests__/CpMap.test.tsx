import { fireEvent, screen } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

// See RouteLine.test.tsx for why this is a real `require()`, not an import.
jest.mock('@maplibre/maplibre-react-native', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment
  const { View } = require('react-native');
  return {
    Map: ({ children }: { children: unknown }) => <View testID="maplibre-map">{children}</View>,
    Camera: () => null,
    ViewAnnotation: ({ children }: { children: unknown }) => <View>{children}</View>,
    Marker: ({ children }: { children: unknown }) => <View>{children}</View>,
    GeoJSONSource: ({ children }: { children: unknown }) => <View>{children}</View>,
    Layer: () => null,
  };
});

jest.mock('../../../../assets/map-style/critterpass-dark.json', () => ({
  version: 8,
  sources: {
    world: { type: 'vector', url: 'pmtiles://https://tiles.test/world/tiles-v1.pmtiles' },
  },
  layers: [],
}));

import type { LngLatBounds } from '@maplibre/maplibre-react-native';

import { renderWithI18n } from '../../../lib/i18n/testing';
import { clusterPlaces, CpMap, type MapPlace } from '../CpMap';

const KYOTO_BOUNDS: LngLatBounds = [135.6, 34.85, 135.9, 35.15];

const NISHIKI: MapPlace = {
  id: 'nishiki',
  name: 'Nishiki Market',
  iconKey: 'pin-market',
  categoryLabel: 'Market',
  lat: 35.005,
  lng: 135.765,
};
const FUSHIMI: MapPlace = {
  id: 'fushimi',
  name: 'Fushimi Inari',
  iconKey: 'pin-temple-shrine',
  categoryLabel: 'Temple or shrine',
  lat: 34.967,
  lng: 135.773,
};

describe('clusterPlaces', () => {
  it('keeps far-apart places in separate single-place clusters', () => {
    const clusters = clusterPlaces([NISHIKI, FUSHIMI], 14);
    expect(clusters).toHaveLength(2);
    expect(clusters.every((cluster) => cluster.places.length === 1)).toBe(true);
  });

  it('groups near-identical coordinates into one cluster', () => {
    const nearby: MapPlace = { ...NISHIKI, id: 'nishiki-2', lat: NISHIKI.lat + 0.0001 };
    const clusters = clusterPlaces([NISHIKI, nearby], 14);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]?.places).toHaveLength(2);
  });

  it('returns nothing for an empty place list', () => {
    expect(clusterPlaces([], 14)).toEqual([]);
  });
});

describe('CpMap', () => {
  it('collapses near-identical places into a cluster bubble, then expands it on tap', async () => {
    const nearby: MapPlace = {
      ...NISHIKI,
      id: 'nishiki-2',
      name: 'Nishiki Stall 2',
      lat: NISHIKI.lat + 0.0001,
    };
    await renderWithI18n(<CpMap places={[NISHIKI, nearby]} zoom={14} />);
    expect(screen.getByTestId('cluster-bubble')).toBeTruthy();
    expect(screen.queryByTestId('doodle-pin-pin-market')).toBeNull();

    await fireEvent.press(screen.getByTestId('cluster-bubble'));

    expect(screen.queryByTestId('cluster-bubble')).toBeNull();
    expect(screen.getAllByTestId('doodle-pin-pin-market')).toHaveLength(2);
  });

  it('shows "location denied" and renders no you-dot when permission is denied', async () => {
    await renderWithI18n(<CpMap places={[]} locationStatus="denied" />);
    expect(screen.getByTestId('map-location-denied')).toBeTruthy();
    expect(screen.queryByTestId('you-dot')).toBeNull();
  });

  it('shows "not in destination" and renders no you-dot when outside the destination bounds', async () => {
    await renderWithI18n(
      <CpMap
        places={[]}
        locationStatus="granted-in-destination"
        youLocation={[139.7, 35.68]}
        destinationBounds={KYOTO_BOUNDS}
        destinationName="Kyoto"
      />,
    );
    expect(screen.getByTestId('map-not-in-destination')).toBeTruthy();
    expect(screen.getByText("You're not in Kyoto yet.")).toBeTruthy();
    expect(screen.queryByTestId('you-dot')).toBeNull();
  });

  it('renders you-dot when inside the destination bounds', async () => {
    await renderWithI18n(
      <CpMap
        places={[]}
        locationStatus="granted-in-destination"
        youLocation={[135.77, 35.0]}
        destinationBounds={KYOTO_BOUNDS}
      />,
    );
    expect(screen.getByTestId('you-dot')).toBeTruthy();
    expect(screen.queryByTestId('map-not-in-destination')).toBeNull();
  });
});
