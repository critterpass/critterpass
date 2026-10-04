/**
 * Tokek's dots gathered into count bubbles until street zoom (7c-1): the biggest place first takes
 * every unclaimed place within `radiusPx` of it on screen at this zoom, so the dots left on their
 * own are at least that far from each other and never gather again in the map's own clustering.
 * The bubbles are drawn as views (their counts read on every map style), the lone dots as a layer.
 */
import { STREET_ZOOM, type PlaceDot } from '@/ui/map/planning/place-dots';

/** Wider than the planning layer's own cluster radius, so a lone dot never clusters there. */
export const GATHER_PX = 56;

export interface DotCluster {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly count: number;
  /** Every dot in it is outside the active filter. */
  readonly dimmed: boolean;
  /** The bounds of its dots: a tap fits them. */
  readonly bounds: readonly [number, number, number, number];
}

/** Screen position in points at `zoom` (Web Mercator over a 512-point world, as MapLibre draws). */
function project(lat: number, lng: number, zoom: number): [number, number] {
  const world = 512 * 2 ** zoom;
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return [
    ((lng + 180) / 360) * world,
    (0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI)) * world,
  ];
}

export interface Gathered {
  readonly clusters: readonly DotCluster[];
  /** Dots drawn on their own (saved icons, lone suggestions, every suggestion at street zoom). */
  readonly dots: readonly PlaceDot[];
}

export function gatherDots(
  dots: readonly PlaceDot[],
  zoom: number,
  radiusPx = GATHER_PX,
): Gathered {
  const saved = dots.filter((dot) => dot.tier === 'saved');
  const suggested = dots.filter((dot) => dot.tier === 'suggested');
  if (zoom >= STREET_ZOOM) return { clusters: [], dots: [...saved, ...suggested] };
  const z = Math.floor(zoom);
  const points = [...suggested]
    .sort((a, b) => b.relevance - a.relevance || a.id.localeCompare(b.id))
    .map((dot) => ({ dot, at: project(dot.lat, dot.lng, z) }));
  const claimed = new Set<string>();
  const clusters: DotCluster[] = [];
  const lone: PlaceDot[] = [];
  for (const point of points) {
    if (claimed.has(point.dot.id)) continue;
    claimed.add(point.dot.id);
    const members = [point.dot];
    for (const other of points) {
      if (claimed.has(other.dot.id)) continue;
      const dx = other.at[0] - point.at[0];
      const dy = other.at[1] - point.at[1];
      if (dx * dx + dy * dy <= radiusPx * radiusPx) {
        claimed.add(other.dot.id);
        members.push(other.dot);
      }
    }
    if (members.length === 1) {
      lone.push(point.dot);
      continue;
    }
    const lats = members.map((member) => member.lat);
    const lngs = members.map((member) => member.lng);
    clusters.push({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a cluster key, never copy.
      id: `cluster-${point.dot.id}`,
      lat: lats.reduce((sum, lat) => sum + lat, 0) / members.length,
      lng: lngs.reduce((sum, lng) => sum + lng, 0) / members.length,
      count: members.length,
      dimmed: members.every((member) => member.dimmed === true),
      bounds: [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)],
    });
  }
  return { clusters, dots: [...saved, ...lone] };
}
