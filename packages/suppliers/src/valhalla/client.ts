/**
 * One Valhalla client for the api and the worker: `/route`, `/sources_to_targets` (chunked to
 * 25 × 25), `/optimized_route`, `/locate` and `/status`. Each call has its own deadline (route
 * 2 s, matrix 6 s), gets one retry when the router timed out or was unavailable, and goes through
 * a circuit breaker so a dead router costs callers nothing while it is down. Every failure is a
 * `ValhallaError` with a kind; callers turn any of them into a straight-line estimate.
 *
 * Valhalla is our own service built from OpenStreetMap (ODbL), so its answers may be stored and
 * synced, unlike a Navigation API result.
 */
import type { z } from 'zod';

import { fetchWithEgress, SupplierTimeoutError, type FetchLike } from '../core/egress';
import { createCircuitBreaker, type CircuitBreaker, type CircuitBreakerOptions } from './breaker';
import { isRetryable, kindForValhallaCode, ValhallaError } from './errors';
import { emptyCells, runChunkedMatrix, runSkippingOffGraph, type MatrixCells } from './matrix';
import { toLeg, toMeters, toRouteLeg, type ValhallaLeg, type ValhallaRouteLeg } from './route-legs';
import {
  errorBodySchema,
  locateResponseSchema,
  matrixResponseSchema,
  routeResponseSchema,
} from './schemas';

export type ValhallaCosting = 'auto' | 'pedestrian' | 'motor_scooter';

export type { ValhallaLeg, ValhallaRouteLeg } from './route-legs';

export interface ValhallaPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface ValhallaRoute extends ValhallaLeg {
  readonly legs: readonly ValhallaRouteLeg[];
}

export interface ValhallaOptimizedRoute extends ValhallaRoute {
  /** Input indexes in visiting order; the first and last points stay where they were. */
  readonly order: readonly number[];
}

export interface ValhallaMatrix extends MatrixCells {
  /** Upstream requests made (one per 25 × 25 block). */
  readonly requests: number;
}

export interface ValhallaLocation {
  readonly onGraph: boolean;
  /** Where the point meets the nearest road, when it does. */
  readonly snapped?: ValhallaPoint;
}

export interface ValhallaClient {
  route(points: readonly ValhallaPoint[], costing: ValhallaCosting): Promise<ValhallaRoute>;
  matrix(
    sources: readonly ValhallaPoint[],
    destinations: readonly ValhallaPoint[],
    costing: ValhallaCosting,
  ): Promise<ValhallaMatrix>;
  optimizedRoute(
    points: readonly ValhallaPoint[],
    costing: ValhallaCosting,
  ): Promise<ValhallaOptimizedRoute>;
  locate(points: readonly ValhallaPoint[], costing: ValhallaCosting): Promise<ValhallaLocation[]>;
  /** True when the router answers `/status`; never throws. */
  status(): Promise<boolean>;
}

export interface ValhallaClientOptions {
  readonly baseUrl: string;
  readonly fetch?: FetchLike;
  readonly routeTimeoutMs?: number;
  readonly matrixTimeoutMs?: number;
  /** Extra attempts after a timeout or an unavailable router; default 1. */
  readonly retries?: number;
  readonly breaker?: CircuitBreaker | CircuitBreakerOptions;
  /** Largest block side for `/sources_to_targets`; default 25. */
  readonly maxMatrixSide?: number;
  readonly matrixConcurrency?: number;
}

export const VALHALLA_MAX_MATRIX_SIDE = 25;

const toLocation = (point: ValhallaPoint) => ({ lat: point.lat, lon: point.lng });

function isBreaker(value: ValhallaClientOptions['breaker']): value is CircuitBreaker {
  return value !== undefined && 'allow' in value;
}

async function errorFromResponse(path: string, response: Response): Promise<ValhallaError> {
  const status = response.status;
  if (status === 429 || status >= 500) {
    return new ValhallaError('unavailable', `valhalla ${path} answered ${status}`, { status });
  }
  const parsed = errorBodySchema.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    return new ValhallaError('rejected', `valhalla ${path} answered ${status}`, { status });
  }
  const code = parsed.data.error_code;
  return new ValhallaError(
    kindForValhallaCode(code),
    `valhalla ${path} answered ${status} (${code}${parsed.data.error === undefined ? '' : `: ${parsed.data.error}`})`,
    { status, valhallaCode: code },
  );
}

export function createValhallaClient(options: ValhallaClientOptions): ValhallaClient {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const routeTimeoutMs = options.routeTimeoutMs ?? 2_000;
  const matrixTimeoutMs = options.matrixTimeoutMs ?? 6_000;
  const retries = Math.max(0, options.retries ?? 1);
  const breaker = isBreaker(options.breaker)
    ? options.breaker
    : createCircuitBreaker(options.breaker);
  const maxSide = Math.min(
    options.maxMatrixSide ?? VALHALLA_MAX_MATRIX_SIDE,
    VALHALLA_MAX_MATRIX_SIDE,
  );

  async function attempt<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number) {
    let response: Response;
    try {
      response = await fetchWithEgress(
        `${baseUrl}${path}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        },
        { timeoutMs, ...(options.fetch === undefined ? {} : { fetch: options.fetch }) },
      );
    } catch (error) {
      if (error instanceof SupplierTimeoutError) {
        throw new ValhallaError(
          'timeout',
          `valhalla ${path} timed out after ${timeoutMs} ms`,
          {},
          { cause: error },
        );
      }
      throw new ValhallaError('unavailable', `valhalla ${path} unreachable`, {}, { cause: error });
    }
    if (!response.ok) throw await errorFromResponse(path, response);
    const parsed = schema.safeParse(await response.json().catch(() => undefined));
    if (!parsed.success) {
      throw new ValhallaError('bad_response', `valhalla ${path} returned an unexpected shape`, {
        status: response.status,
      });
    }
    return parsed.data;
  }

  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, timeoutMs: number) {
    if (!breaker.allow()) {
      throw new ValhallaError('circuit_open', `valhalla ${path} skipped: router marked down`);
    }
    for (let tries = 0; ; tries += 1) {
      try {
        const result = await attempt(path, body, schema, timeoutMs);
        breaker.success();
        return result;
      } catch (error) {
        const failure =
          error instanceof ValhallaError
            ? error
            : new ValhallaError('unavailable', `valhalla ${path} failed`, {}, { cause: error });
        if (isRetryable(failure) && tries < retries) continue;
        if (failure.routerDown || failure.kind === 'bad_response') breaker.failure();
        else breaker.success();
        throw failure;
      }
    }
  }

  async function locate(points: readonly ValhallaPoint[], costing: ValhallaCosting) {
    const rows = await post(
      '/locate',
      { locations: points.map(toLocation), costing, verbose: false },
      locateResponseSchema,
      routeTimeoutMs,
    );
    return points.map((_, index): ValhallaLocation => {
      const edge = rows[index]?.edges?.[0];
      return edge === undefined
        ? { onGraph: false }
        : { onGraph: true, snapped: { lat: edge.correlated_lat, lng: edge.correlated_lon } };
    });
  }

  async function matrixBlock(
    sources: readonly ValhallaPoint[],
    destinations: readonly ValhallaPoint[],
    costing: ValhallaCosting,
  ): Promise<MatrixCells> {
    const response = await post(
      '/sources_to_targets',
      {
        sources: sources.map(toLocation),
        targets: destinations.map(toLocation),
        costing,
        units: 'kilometers',
      },
      matrixResponseSchema,
      matrixTimeoutMs,
    );
    const rows = response.sources_to_targets;
    return {
      seconds: sources.map((_, i) => destinations.map((__, j) => rows[i]?.[j]?.time ?? null)),
      meters: sources.map((_, i) =>
        destinations.map((__, j) => {
          const km = rows[i]?.[j]?.distance;
          return km === null || km === undefined ? null : toMeters(km);
        }),
      ),
    };
  }

  return {
    async route(points, costing) {
      const { trip } = await post(
        '/route',
        {
          locations: points.map(toLocation),
          costing,
          units: 'kilometers',
          directions_type: 'none',
        },
        routeResponseSchema,
        routeTimeoutMs,
      );
      return { ...toLeg(trip.summary), legs: trip.legs.map(toRouteLeg) };
    },
    async matrix(sources, destinations, costing) {
      if (sources.length === 0 || destinations.length === 0) {
        return { ...emptyCells(sources.length, destinations.length), requests: 0 };
      }
      return runChunkedMatrix(
        sources,
        destinations,
        (blockSources, blockDestinations) =>
          runSkippingOffGraph(
            blockSources,
            blockDestinations,
            (keptSources, keptDestinations) => matrixBlock(keptSources, keptDestinations, costing),
            (points) => locate(points, costing),
          ),
        { maxSide, concurrency: options.matrixConcurrency ?? 2 },
      );
    },
    async optimizedRoute(points, costing) {
      const { trip } = await post(
        '/optimized_route',
        {
          locations: points.map(toLocation),
          costing,
          units: 'kilometers',
          directions_type: 'none',
        },
        routeResponseSchema,
        matrixTimeoutMs,
      );
      return {
        ...toLeg(trip.summary),
        legs: trip.legs.map(toRouteLeg),
        order: trip.locations.map((location, index) => location.original_index ?? index),
      };
    },
    locate,
    async status() {
      try {
        const response = await fetchWithEgress(
          `${baseUrl}/status`,
          {},
          {
            timeoutMs: routeTimeoutMs,
            ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
          },
        );
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
