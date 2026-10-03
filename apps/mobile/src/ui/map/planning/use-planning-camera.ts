/**
 * Camera moves a planning map makes: fit a day's stops above the sheet, fly to a place so it sits
 * above the cards laid over the map's foot (7c-2), and open a cluster at the zoom it splits at.
 * Reduced motion jumps instead of flying.
 */
import type { CameraRef, LngLat, LngLatBounds } from '@maplibre/maplibre-react-native';
import { useCallback, useMemo, useRef } from 'react';

import { tokens } from '@cp/design-tokens';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import type { Coord } from './route-trace';

const MOVE_MS = tokens.motion.duration.extra;
const PLACE_ZOOM = 15;
const EDGE = tokens.space['32'];

/** The box around `points`, or null for none. A single point gets a small box around it. */
export function boundsOf(points: readonly Coord[]): LngLatBounds | null {
  if (points.length === 0) return null;
  let west = Infinity;
  let south = Infinity;
  let east = -Infinity;
  let north = -Infinity;
  for (const [lng, lat] of points) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  const pad = west === east && south === north ? 0.005 : 0;
  return [west - pad, south - pad, east + pad, north + pad];
}

export interface CoveredEdges {
  /** Map hidden under the header and chips. */
  readonly top?: number;
  /** Map hidden under the sheet or the cards. */
  readonly bottom?: number;
}

export function usePlanningCamera() {
  const cameraRef = useRef<CameraRef>(null);
  const reduced = useReducedImpactMotion();
  const duration = reduced ? 0 : MOVE_MS;

  const fitPoints = useCallback(
    (points: readonly Coord[], covered: CoveredEdges = {}) => {
      const bounds = boundsOf(points);
      if (bounds === null) return;
      cameraRef.current?.fitBounds(bounds, {
        padding: {
          top: (covered.top ?? 0) + EDGE,
          bottom: (covered.bottom ?? 0) + EDGE,
          left: EDGE,
          right: EDGE,
        },
        duration,
      });
    },
    [duration],
  );

  const flyToPlace = useCallback(
    (center: LngLat, options: { zoom?: number; covered?: CoveredEdges } = {}) => {
      cameraRef.current?.easeTo({
        center,
        zoom: options.zoom ?? PLACE_ZOOM,
        padding: {
          top: options.covered?.top ?? 0,
          bottom: options.covered?.bottom ?? 0,
          left: 0,
          right: 0,
        },
        duration,
      });
    },
    [duration],
  );

  const openCluster = useCallback(
    (center: LngLat, expansionZoom: number) => {
      cameraRef.current?.easeTo({ center, zoom: expansionZoom, duration });
    },
    [duration],
  );

  return useMemo(
    () => ({ cameraRef, fitPoints, flyToPlace, openCluster }),
    [fitPoints, flyToPlace, openCluster],
  );
}
export type PlanningCamera = ReturnType<typeof usePlanningCamera>;
