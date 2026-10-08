/**
 * Keeps a planning map's camera on the points it should show. A fit asked for before the map's
 * style has loaded is dropped without a word, which left the map on its opening centre (or on
 * nothing at all), so after each fit the camera is checked against the points and asked again, a
 * few times, while they are still out of view. The checks stop as soon as she picks something (the
 * camera is hers then), and a map under another screen does not fit at all: it fits once it is
 * back on top, and only if what it shows changed meanwhile.
 */
import type { LngLatBounds } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';

import type { Coord, CoveredEdges, PlanningCamera } from '@/ui/map/planning';

import { pointsInView } from './trip-map-camera';

/** Long enough for a camera move to finish before it is checked. */
const CHECK_MS = 1200;
const MAX_TRIES = 4;

export interface FitCameraInput {
  /** Changes when the camera should fit again (the day, its stops, the sheet's snap, the size). */
  readonly fitKey: string;
  /** False until the map has a size and has answered its first region. */
  readonly ready: boolean;
  readonly points: readonly Coord[];
  readonly covered?: CoveredEdges | undefined;
  /** The map's visible bounds from its last region change. */
  readonly bounds: LngLatBounds | null;
  /** False while another screen covers the map: no fit is asked for until it is back. @default true */
  readonly active?: boolean | undefined;
  /** Changes when she moves the camera on purpose (a pin or a row picked): later checks stop. */
  readonly holdKey?: string | null | undefined;
}

export function useFitCamera(camera: PlanningCamera, input: FitCameraInput): void {
  const latest = useRef(input);
  // Before the fit below: it reads the points and bounds as they are when it runs.
  useEffect(() => {
    latest.current = input;
  });
  const { fitKey, ready } = input;
  const active = input.active ?? true;
  // What the map showed when another screen covered it: coming back to the same view fits nothing.
  const coveredOn = useRef<string | null>(null);
  useEffect(() => {
    if (!active) coveredOn.current = latest.current.fitKey;
  }, [active]);
  useEffect(() => {
    if (!ready || !active) return undefined;
    const same = coveredOn.current === fitKey;
    coveredOn.current = null;
    if (same) return undefined;
    const held = latest.current.holdKey ?? null;
    let tries = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fit = () => {
      const { points, covered, bounds, holdKey } = latest.current;
      if (points.length === 0) return;
      if (tries > 0 && (holdKey ?? null) !== held) return;
      if (tries > 0 && bounds !== null && pointsInView(points, bounds)) return;
      tries += 1;
      camera.fitPoints(points, covered ?? {});
      if (tries < MAX_TRIES) timer = setTimeout(fit, CHECK_MS);
    };
    fit();
    return () => {
      if (timer !== null) clearTimeout(timer);
    };
    // The key says when to fit again; the points and bounds are read as they are at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready, active]);
}
