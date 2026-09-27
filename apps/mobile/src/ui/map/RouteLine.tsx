/**
 * Renders a route polyline (a day's route, or the dotted line from `YouDot` to a selected pin —
 * F-031 "Pins": "dotted line to selected pin") as a real MapLibre vector layer, not a React
 * overlay: `GeoJSONSource` + `Layer` scale to a route's point count far better than one
 * `ViewAnnotation` per vertex would, and dash patterns are a native paint property.
 */
import { GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import type { LineString } from 'geojson';

export interface RouteLineProps {
  readonly id: string;
  /** `[lng, lat]` pairs, in order. */
  readonly coordinates: ReadonlyArray<readonly [number, number]>;
  readonly color: string;
  /** Dotted line to a selected pin vs. a solid day-route line. */
  readonly dashed?: boolean;
  readonly width?: number;
}

export function RouteLine({ id, coordinates, color, dashed = false, width = 3 }: RouteLineProps) {
  if (coordinates.length < 2) return null;

  const geometry: LineString = { type: 'LineString', coordinates: coordinates.map((c) => [...c]) };
  // Internal MapLibre layer/source ids, never rendered as copy — not user-facing text.
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const sourceId = `${id}-source`;
  // eslint-disable-next-line lingui/no-unlocalized-strings
  const layerId = `${id}-layer`;

  return (
    <GeoJSONSource id={sourceId} data={{ type: 'Feature', properties: {}, geometry }}>
      <Layer
        id={layerId}
        type="line"
        layout={{ 'line-cap': 'round', 'line-join': 'round' }}
        paint={{
          'line-color': color,
          'line-width': width,
          ...(dashed ? { 'line-dasharray': [2, 2] } : {}),
        }}
      />
    </GeoJSONSource>
  );
}
