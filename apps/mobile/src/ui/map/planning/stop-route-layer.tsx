/**
 * The trip's day routes as map layers (7a-1, 7a-2, 7b-1): numbered stops in each day's colour,
 * joined by straight segments from the stay; the chosen day at full strength, the others at half.
 * Choosing another day traces its route out from the stay. Must be a child of
 * `PlanningMapCanvas`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre source and layer ids, never copy. */
import { tokens } from '@cp/design-tokens';
import { GeoJSONSource, Layer, type PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import type { NativeSyntheticEvent } from 'react-native';

import { useReducedImpactMotion } from '@/motion/patterns/shared';

import { MAP_LABEL_FONT } from './map-fonts';
import { pressedPlaceId } from './place-dots';
import { routeFeatures, type Coord, type RouteDay } from './route-trace';

export type { RouteDay, RouteStop } from './route-trace';

/** The trace runs as long as a hero draw-on (design-system.md §3.4 `draw`, icons). */
const TRACE_MS = tokens.motion.duration.extra;

export interface StopRouteLayerProps {
  readonly days: readonly RouteDay[];
  /** The chosen day; null draws every day at full strength (the whole trip, 7a-3). */
  readonly chosenDayNo: number | null;
  readonly stay?: Coord | null | undefined;
  readonly onSelectStop?: ((stopId: string) => void) | undefined;
  readonly id?: string | undefined;
}

/** 0 → 1 over the trace each time `key` changes; 1 at once under reduced motion. */
function useTrace(key: number | null): number {
  const reduced = useReducedImpactMotion();
  const [traced, setTraced] = useState<{ readonly key: number | null; readonly progress: number }>({
    key,
    progress: 1,
  });
  useEffect(() => {
    if (reduced || key === null) return undefined;
    let frame = 0;
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / TRACE_MS);
      // Ease out: the line leaves the stay quickly and settles on the last stop.
      setTraced({ key, progress: 1 - (1 - t) * (1 - t) });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, reduced]);
  if (reduced || key === null) return 1;
  // A new day starts from the stay before its first frame lands.
  return traced.key === key ? traced.progress : 0;
}

export function StopRouteLayer({
  days,
  chosenDayNo,
  stay = null,
  onSelectStop,
  id = 'cp-route',
}: StopRouteLayerProps) {
  const progress = useTrace(chosenDayNo);
  const { lines, stops } = useMemo(
    () => routeFeatures(days, chosenDayNo, stay, progress),
    [days, chosenDayNo, stay, progress],
  );
  const onPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const stopId = pressedPlaceId(event.nativeEvent.features);
    if (stopId === null) return;
    event.stopPropagation();
    onSelectStop?.(stopId);
  };

  return (
    <>
      <GeoJSONSource id={`${id}-lines`} data={lines}>
        <Layer
          id={`${id}-line`}
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['get', 'color'],
            'line-opacity': ['get', 'opacity'],
            'line-width': ['case', ['get', 'chosen'], 3.5, 2.5],
          }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={`${id}-stops`} data={stops} onPress={onPress}>
        <Layer
          id={`${id}-stop`}
          type="circle"
          paint={{
            'circle-radius': ['case', ['get', 'chosen'], 13, 9],
            'circle-color': ['get', 'color'],
            'circle-opacity': ['get', 'opacity'],
            'circle-stroke-color': tokens.color.ink[850],
            'circle-stroke-width': 2,
            'circle-stroke-opacity': ['get', 'opacity'],
          }}
        />
        <Layer
          id={`${id}-stop-number`}
          type="symbol"
          layout={{
            'text-field': ['get', 'label'],
            'text-font': [MAP_LABEL_FONT],
            'text-size': ['case', ['get', 'chosen'], 14, 11],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{ 'text-color': tokens.color.paper.bright, 'text-opacity': ['get', 'opacity'] }}
        />
      </GeoJSONSource>
    </>
  );
}
