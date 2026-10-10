/**
 * The plan's days on the premium map (4.25–4.28) as MapLibre layers: the chosen day's route over a
 * casing (white on the light map, near-black at night), walks dotted, a boat leg a dotted blue arc;
 * its stops as numbered pins with a white ring and a soft shadow; other days' stops as small dots
 * at half strength; anything a filter chip leaves out faint. Choosing a day traces its route out
 * from the stay. A child of `PremiumMapCanvas`; places and stops are layers, never views.
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre source and layer ids, never copy. */
import { GeoJSONSource, Layer, type PressEventWithFeatures } from '@maplibre/maplibre-react-native';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, type NativeSyntheticEvent } from 'react-native';

import { BOAT_BLUE, MAP_PALETTES, type MapMode } from './palette';
import { planMapFeatures, type Coord, type MapDay } from './route-features';

const FONT = ['Archivo-W100-700 Regular'];
/** The route trace's length (the design's line-trim, ease out, not a spring). */
const TRACE_MS = 600;

export interface PlanRouteLayerProps {
  readonly days: readonly MapDay[];
  /** The day whose route and numbered pins show; null shows every day as dots (whole trip). */
  readonly chosenDayNo: number | null;
  readonly stay?: Coord | null | undefined;
  readonly mode: MapMode;
  /** Pins 26 (one day), 24 (the trip at peek) or 18 (mini maps); routes thin on mini maps. */
  readonly size?: 'large' | 'medium' | 'small' | undefined;
  /** Stop ids a filter chip leaves out: drawn at 20%. */
  readonly faded?: ReadonlySet<string> | undefined;
  readonly onSelectStop?: ((stopId: string) => void) | undefined;
  readonly id?: string | undefined;
}

const PIN_RADIUS = { large: 13, medium: 12, small: 9 } as const;
const NUMERAL = { large: 12, medium: 11, small: 10 } as const;

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (live) setReduced(on);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      live = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/** 0 → 1 over the trace each time `key` changes; 1 at once with Reduce Motion. */
function useTrace(key: number | null): number {
  const reduced = useReducedMotion();
  const [traced, setTraced] = useState({ key, progress: 1 });
  useEffect(() => {
    if (reduced || key === null) return undefined;
    let frame = 0;
    const start = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - start) / TRACE_MS);
      setTraced({ key, progress: 1 - (1 - t) * (1 - t) });
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [key, reduced]);
  if (reduced || key === null) return 1;
  return traced.key === key ? traced.progress : 0;
}

function pressedStop(features: readonly { properties?: Record<string, unknown> | null }[]) {
  for (const feature of features) {
    const id = feature.properties?.['id'];
    if (typeof id === 'string') return id;
  }
  return null;
}

export function PlanRouteLayer({
  days,
  chosenDayNo,
  stay = null,
  mode,
  size = 'large',
  faded,
  onSelectStop,
  id = 'cp-plan',
}: PlanRouteLayerProps) {
  const progress = useTrace(chosenDayNo);
  const { legs, pins } = useMemo(
    () => planMapFeatures({ days, chosenDayNo, stay, progress, ...(faded ? { faded } : {}) }),
    [days, chosenDayNo, stay, progress, faded],
  );
  const casing = MAP_PALETTES[mode].routeCasing;
  const thin = size === 'small';
  const width = thin ? 3 : 4.5;
  const casingWidth = thin ? 5 : 8;
  const radius = PIN_RADIUS[size];
  const opacity = ['case', ['get', 'faded'], 0.2, ['==', ['get', 'kind'], 'dot'], 0.5, 1];
  const onPress = (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
    const stopId = pressedStop(event.nativeEvent.features);
    if (stopId === null) return;
    event.stopPropagation();
    onSelectStop?.(stopId);
  };
  return (
    <>
      <GeoJSONSource id={`${id}-legs`} data={legs}>
        <Layer
          id={`${id}-leg-casing`}
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': casing,
            'line-width': casingWidth,
            'line-opacity': ['case', ['==', ['get', 'mode'], 'boat'], 0.85, 0.95],
          }}
        />
        <Layer
          id={`${id}-leg`}
          type="line"
          filter={['!=', ['get', 'mode'], 'walk']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{
            'line-color': ['case', ['==', ['get', 'mode'], 'boat'], BOAT_BLUE, ['get', 'color']],
            'line-width': width,
            // A boat leg is dotted (1 on, 9 off at the design's width).
            'line-dasharray': ['case', ['==', ['get', 'mode'], 'boat'], ['literal', [0.2, 2]], ['literal', [1, 0]]],
          }}
        />
        <Layer
          id={`${id}-leg-walk`}
          type="line"
          filter={['==', ['get', 'mode'], 'walk']}
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': ['get', 'color'], 'line-width': width, 'line-dasharray': [0.2, 1.8] }}
        />
      </GeoJSONSource>
      <GeoJSONSource id={`${id}-pins`} data={pins} onPress={onPress}>
        <Layer
          id={`${id}-pin-shadow`}
          type="circle"
          filter={['==', ['get', 'kind'], 'pin']}
          paint={{
            'circle-radius': radius + 2,
            'circle-color': 'rgba(20,22,40,0.25)',
            'circle-blur': 0.6,
            'circle-translate': [0, 3],
            'circle-opacity': opacity,
          }}
        />
        <Layer
          id={`${id}-pin`}
          type="circle"
          paint={{
            'circle-radius': ['case', ['==', ['get', 'kind'], 'dot'], 5, radius - 2.5],
            'circle-color': ['get', 'color'],
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': ['case', ['==', ['get', 'kind'], 'dot'], 2, 2.5],
            'circle-opacity': opacity,
            'circle-stroke-opacity': opacity,
          }}
        />
        <Layer
          id={`${id}-pin-number`}
          type="symbol"
          filter={['==', ['get', 'kind'], 'pin']}
          layout={{
            'text-field': ['get', 'label'],
            'text-font': FONT,
            'text-size': NUMERAL[size],
            'text-allow-overlap': true,
            'text-ignore-placement': true,
          }}
          paint={{ 'text-color': '#ffffff', 'text-opacity': opacity }}
        />
      </GeoJSONSource>
    </>
  );
}
