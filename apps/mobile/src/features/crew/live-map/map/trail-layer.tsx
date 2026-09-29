/**
 * Ephemeral trails as native dotted lines, one per fast-moving member in their colour, fading out
 * after they stop. The points come from screen memory only (../data/use-trails.ts).
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre source and layer ids, never copy. */
import { resolveMemberStyle } from '@cp/design-tokens';
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';

import type { VisibleTrail } from '../data/use-trails';

export function TrailLayer({
  trails,
  joinIndexOf,
}: {
  readonly trails: readonly VisibleTrail[];
  readonly joinIndexOf: (uid: string) => number;
}) {
  return (
    <>
      {trails.map((trail) => (
        <GeoJSONSource
          key={trail.uid}
          id={`trail-${trail.uid}`}
          data={{
            type: 'Feature',
            properties: {},
            geometry: { type: 'LineString', coordinates: trail.coordinates.map((c) => [...c]) },
          }}
        >
          <Layer
            id={`trail-${trail.uid}-line`}
            type="line"
            layout={{ 'line-cap': 'round', 'line-join': 'round' }}
            paint={{
              'line-color': resolveMemberStyle(joinIndexOf(trail.uid)).color,
              'line-width': 3,
              'line-dasharray': [0.5, 2],
              'line-opacity': trail.opacity,
            }}
          />
        </GeoJSONSource>
      ))}
    </>
  );
}
