/** Turns Valhalla's route summaries and leg shapes into the client's units and points. */
import { decodePolyline, type LngLat } from '@cp/domain';

export interface ValhallaLeg {
  readonly seconds: number;
  readonly meters: number;
}

export interface ValhallaRouteLeg extends ValhallaLeg {
  /** The road the leg follows, `[lng, lat]` from start to end, when the router sent it. */
  readonly shape?: readonly LngLat[];
}

/** Valhalla encodes route shapes at precision 6. */
const SHAPE_PRECISION = 6;

export const toMeters = (km: number) => Math.round(km * 1000);

export const toLeg = (summary: { time: number; length: number }): ValhallaLeg => ({
  seconds: summary.time,
  meters: toMeters(summary.length),
});

export const toRouteLeg = (leg: {
  summary: { time: number; length: number };
  shape?: string | undefined;
}): ValhallaRouteLeg =>
  leg.shape === undefined
    ? toLeg(leg.summary)
    : { ...toLeg(leg.summary), shape: decodePolyline(leg.shape, SHAPE_PRECISION) };
