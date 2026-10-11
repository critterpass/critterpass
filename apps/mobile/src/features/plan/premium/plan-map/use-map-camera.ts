/**
 * Keeps the plan map's camera on what matters: the chosen day (or the whole trip at full) fitted
 * into the map the top chrome and the sheet leave, again whenever the points or the height change.
 */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import { useEffect, type RefObject } from 'react';

import { cameraPadding, type Coord, type MapDetent } from '../map';
import { boundsOf } from './map-days';

/** At full only the island strip shows above the sheet's top at 196. */
const FULL_SHEET_TOP = 196;

export function useMapCamera(input: {
  readonly camera: RefObject<CameraRef | null>;
  readonly points: readonly Coord[];
  readonly detent: MapDetent;
  readonly height: number;
  readonly reduced: boolean;
}): void {
  const { camera, points, detent, height, reduced } = input;
  const signature = JSON.stringify(points);
  useEffect(() => {
    const bounds = boundsOf(points);
    if (bounds === null) return;
    camera.current?.fitBounds(bounds, {
      padding:
        detent === 'full'
          ? { top: 56, bottom: height - FULL_SHEET_TOP + 12, left: 24, right: 24 }
          : cameraPadding(detent, height),
      duration: reduced ? 0 : 500,
    });
    // The signature stands for the points.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, detent, height, reduced]);
}
