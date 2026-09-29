/**
 * The ETA matrix the meet-up recount runs on: one call per travel mode, every sharing member as a
 * source, the meet-up as the one target. Valhalla `sources_to_targets` when `VALHALLA_URL` is set;
 * without it, or when it fails, every cell is a straight-line estimate labelled "about".
 */
import { estimateStraightLineEta, type TravelMode } from '@cp/domain';
import { z } from 'zod';

export interface RoutePoint {
  readonly lat: number;
  readonly lng: number;
}

export interface MatrixCell {
  readonly minutes: number;
  readonly distanceM: number;
  readonly estimate: boolean;
}

export interface MeetupRouter {
  matrix(
    mode: TravelMode,
    sources: readonly RoutePoint[],
    target: RoutePoint,
  ): Promise<readonly MatrixCell[]>;
}

const COSTING: Readonly<Record<TravelMode, string>> = {
  pedestrian: 'pedestrian',
  motor_scooter: 'motor_scooter',
  auto: 'auto',
  // Valhalla's multimodal needs transit tiles we do not build; walk instead.
  multimodal: 'pedestrian',
};

const valhallaMatrixSchema = z.object({
  sources_to_targets: z.array(
    z.array(z.object({ time: z.number().nullable(), distance: z.number().nullable() })),
  ),
});

function straightLine(mode: TravelMode, source: RoutePoint, target: RoutePoint): MatrixCell {
  const eta = estimateStraightLineEta(
    {
      originLat: source.lat,
      originLng: source.lng,
      destLat: target.lat,
      destLng: target.lng,
      mode,
    },
    'provider_unavailable',
  );
  return { minutes: eta.minutes, distanceM: eta.distanceM, estimate: true };
}

export const straightLineRouter: MeetupRouter = {
  matrix: (mode, sources, target) =>
    Promise.resolve(sources.map((source) => straightLine(mode, source, target))),
};

/** Valhalla with a straight-line fallback per call (timeout, HTTP error, unroutable cell). */
export function valhallaRouter(options: {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: typeof fetch;
  readonly onError?: (error: unknown) => void;
}): MeetupRouter {
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;
  return {
    async matrix(mode, sources, target) {
      if (sources.length === 0) return [];
      try {
        const response = await doFetch(`${base}/sources_to_targets`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            sources: sources.map((p) => ({ lat: p.lat, lon: p.lng })),
            targets: [{ lat: target.lat, lon: target.lng }],
            costing: COSTING[mode],
            units: 'kilometers',
          }),
          signal: AbortSignal.timeout(options.timeoutMs ?? 3000),
        });
        if (!response.ok) throw new Error(`valhalla sources_to_targets: HTTP ${response.status}`);
        const rows = valhallaMatrixSchema.parse(await response.json()).sources_to_targets;
        return sources.map((source, index) => {
          const cell = rows[index]?.[0];
          if (cell?.time == null || cell.distance == null) {
            return straightLine(mode, source, target);
          }
          return {
            minutes: Math.max(0, Math.round(cell.time / 60)),
            distanceM: Math.round(cell.distance * 1000),
            estimate: false,
          };
        });
      } catch (error) {
        options.onError?.(error);
        return sources.map((source) => straightLine(mode, source, target));
      }
    },
  };
}
