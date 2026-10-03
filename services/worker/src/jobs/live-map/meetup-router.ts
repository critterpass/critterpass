/**
 * The ETA matrix the meet-up recount runs on: one call per travel mode, every sharing member as a
 * source, the meet-up as the one target. Valhalla `sources_to_targets` when `VALHALLA_URL` is set;
 * without it, or when it fails, every cell is a straight-line estimate labelled "about".
 */
import { estimateStraightLineEta, type TravelMode } from '@cp/domain';
import { createValhallaClient, type FetchLike, type ValhallaCosting } from '@cp/suppliers';

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

const COSTING: Readonly<Record<TravelMode, ValhallaCosting>> = {
  pedestrian: 'pedestrian',
  motor_scooter: 'motor_scooter',
  auto: 'auto',
  // Valhalla's multimodal needs transit tiles we do not build; walk instead.
  multimodal: 'pedestrian',
};

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

/**
 * Valhalla (the shared client: deadline, circuit breaker, off-graph points left out) with a
 * straight-line fallback per call (timeout, HTTP error, router down) and per unroutable cell. Live
 * surfaces don't retry: a second attempt would only make the "about" answer later.
 */
export function valhallaRouter(options: {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
  readonly fetch?: FetchLike;
  readonly onError?: (error: unknown) => void;
}): MeetupRouter {
  const client = createValhallaClient({
    baseUrl: options.baseUrl,
    matrixTimeoutMs: options.timeoutMs ?? 3000,
    retries: 0,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  return {
    async matrix(mode, sources, target) {
      if (sources.length === 0) return [];
      try {
        const cells = await client.matrix(sources, [target], COSTING[mode]);
        return sources.map((source, index) => {
          const seconds = cells.seconds[index]?.[0];
          const meters = cells.meters[index]?.[0];
          if (seconds == null || meters == null) return straightLine(mode, source, target);
          return {
            minutes: Math.max(0, Math.round(seconds / 60)),
            distanceM: meters,
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
