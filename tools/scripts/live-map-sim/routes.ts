/**
 * GPX tracks through Ubud that the simulated crew follows toward Campuhan Ridge, and the walker
 * that turns a track into one position per tick at a given speed.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { distanceM, type LocationActivity } from '@cp/domain';

export interface TrackPoint {
  readonly lat: number;
  readonly lng: number;
}

export const CAMPUHAN_RIDGE = { lat: -8.5031, lng: 115.2544, name: 'Campuhan Ridge' } as const;

export function parseGpx(xml: string): TrackPoint[] {
  const points: TrackPoint[] = [];
  for (const match of xml.matchAll(/<trkpt\s+lat="([-\d.]+)"\s+lon="([-\d.]+)"/g)) {
    points.push({ lat: Number(match[1]), lng: Number(match[2]) });
  }
  if (points.length < 2) throw new Error('a GPX track needs at least two points');
  return points;
}

export function loadTrack(file: string): TrackPoint[] {
  return parseGpx(readFileSync(path.join(import.meta.dirname, 'routes', file), 'utf8'));
}

function legs(track: readonly TrackPoint[]): (readonly [TrackPoint, TrackPoint])[] {
  return track.slice(1).map((b, i) => [track[i] as TrackPoint, b] as const);
}

/** Position after travelling `metres` along `track` (clamped to its end). */
export function pointAlong(track: readonly TrackPoint[], metres: number): TrackPoint {
  let left = metres;
  for (const [a, b] of legs(track)) {
    const leg = distanceM(a, b);
    if (left <= leg) {
      const t = leg === 0 ? 0 : left / leg;
      return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    }
    left -= leg;
  }
  const last = track.at(-1);
  if (last === undefined) throw new Error('empty track');
  return last;
}

export function trackLength(track: readonly TrackPoint[]): number {
  return legs(track).reduce((total, [a, b]) => total + distanceM(a, b), 0);
}

export interface SimMember {
  readonly name: string;
  readonly track: readonly TrackPoint[];
  readonly activity: LocationActivity;
  /** Metres per second before the sim's time compression. */
  readonly speedMps: number;
}

/** Maya and Rin walk together from Karsa Spa (one bunch), Alex walks, Jordan rides a scooter. */
export function crewMembers(): SimMember[] {
  const karsa = loadTrack('maya-rin-karsa-spa.gpx');
  return [
    { name: 'Maya', track: karsa, activity: 'walking', speedMps: 1.4 },
    {
      name: 'Rin',
      track: karsa.map((p) => ({ lat: p.lat + 0.0001, lng: p.lng })),
      activity: 'walking',
      speedMps: 1.4,
    },
    {
      name: 'Alex',
      track: loadTrack('alex-warung-pondok.gpx'),
      activity: 'walking',
      speedMps: 1.3,
    },
    {
      name: 'Jordan',
      track: loadTrack('jordan-scooter-east.gpx'),
      activity: 'automotive',
      speedMps: 7,
    },
  ];
}
