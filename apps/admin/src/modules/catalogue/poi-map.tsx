/**
 * Pin preview for a POI's coordinates: MapLibre over OpenStreetMap raster tiles, following the form
 * as the operator types.
 */
import 'maplibre-gl/dist/maplibre-gl.css';

import { Map as MapLibreMap, Marker, type StyleSpecification } from 'maplibre-gl';
import { useEffect, useRef, useState } from 'react';

function hasWebGl2(): boolean {
  return document.createElement('canvas').getContext('webgl2') !== null;
}

const OSM_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm', type: 'raster', source: 'osm' }],
};

function coordinates(values: Record<string, unknown>): [number, number] | undefined {
  const lat = values['lat'];
  const lng = values['lng'];
  if (typeof lat !== 'number' || typeof lng !== 'number') return undefined;
  if (Number.isNaN(lat) || Number.isNaN(lng)) return undefined;
  return [lng, lat];
}

export function PoiMapPreview({ values }: { values: Record<string, unknown> }) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<MapLibreMap | null>(null);
  const marker = useRef<Marker | null>(null);
  const [unsupported] = useState(() => !hasWebGl2());
  const point = coordinates(values);

  useEffect(() => {
    if (container.current === null || unsupported) return;
    let instance: MapLibreMap;
    try {
      instance = new MapLibreMap({
        container: container.current,
        style: OSM_STYLE,
        center: point ?? [0, 0],
        zoom: point ? 14 : 1,
        attributionControl: { compact: true },
      });
    } catch {
      // A GPU that reports WebGL2 but fails to start it; the section below stays empty.
      return;
    }
    map.current = instance;
    return () => {
      instance.remove();
      map.current = null;
      marker.current = null;
    };
    // The map is created once; the effect below follows the coordinates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const lng = point?.[0];
  const lat = point?.[1];
  useEffect(() => {
    const instance = map.current;
    if (instance === null || lng === undefined || lat === undefined) return;
    const pin = marker.current ?? new Marker().setLngLat([lng, lat]).addTo(instance);
    marker.current = pin;
    pin.setLngLat([lng, lat]);
    instance.jumpTo({ center: [lng, lat], zoom: Math.max(instance.getZoom(), 14) });
  }, [lng, lat]);

  return (
    <figure className="stack" aria-label="Pin preview" style={{ margin: 0 }}>
      <div ref={container} className="map-preview" hidden={unsupported} />
      {unsupported && (
        <div className="card muted">
          Map preview needs WebGL2. Pin at{' '}
          <span className="mono">{point ? `${point[1]}, ${point[0]}` : 'no coordinates'}</span>
        </div>
      )}
    </figure>
  );
}
