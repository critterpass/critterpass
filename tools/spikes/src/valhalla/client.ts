import { z } from 'zod';

import type { LatLng } from './cities';

export type Costing = 'pedestrian' | 'auto';

const routeResponseSchema = z.object({
  trip: z.object({
    summary: z.object({
      time: z.number(),
      length: z.number(),
    }),
  }),
});

export interface RouteResult {
  readonly durationSeconds: number;
  readonly lengthKm: number;
}

/** Validates a `/route` response at the network boundary; throws on an unexpected shape. */
export function parseRouteResponse(json: unknown): RouteResult {
  const parsed = routeResponseSchema.parse(json);
  return { durationSeconds: parsed.trip.summary.time, lengthKm: parsed.trip.summary.length };
}

const matrixCellSchema = z.object({
  time: z.number().nullable(),
  distance: z.number().nullable(),
});

const matrixResponseSchema = z.object({
  sources_to_targets: z.array(z.array(matrixCellSchema)),
});

export type MatrixCell = z.infer<typeof matrixCellSchema>;

/** Validates a `/sources_to_targets` response at the network boundary. */
export function parseMatrixResponse(json: unknown): MatrixCell[][] {
  return matrixResponseSchema.parse(json).sources_to_targets;
}

function toValhallaLocation(point: LatLng): { lat: number; lon: number } {
  return { lat: point.lat, lon: point.lon };
}

export interface ValhallaClientOptions {
  readonly baseUrl: string;
  readonly timeoutMs?: number;
}

export interface ValhallaClient {
  route(locations: readonly [LatLng, LatLng], costing: Costing): Promise<RouteResult>;
  matrix(
    sources: readonly LatLng[],
    targets: readonly LatLng[],
    costing: Costing,
  ): Promise<MatrixCell[][]>;
  status(): Promise<boolean>;
}

/** Thin client over a Valhalla `valhalla_service` HTTP API (default port 8002). */
export function createValhallaClient(options: ValhallaClientOptions): ValhallaClient {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const baseUrl = options.baseUrl.replace(/\/$/, '');

  async function postJson(path: string, body: unknown): Promise<unknown> {
    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '<unreadable body>');
      throw new Error(`valhalla ${path} responded ${response.status}: ${text.slice(0, 300)}`);
    }
    return response.json();
  }

  return {
    async route(locations, costing) {
      const json = await postJson('/route', {
        locations: locations.map(toValhallaLocation),
        costing,
      });
      return parseRouteResponse(json);
    },
    async matrix(sources, targets, costing) {
      const json = await postJson('/sources_to_targets', {
        sources: sources.map(toValhallaLocation),
        targets: targets.map(toValhallaLocation),
        costing,
      });
      return parseMatrixResponse(json);
    },
    async status() {
      try {
        const response = await fetch(`${baseUrl}/status`, {
          signal: AbortSignal.timeout(timeoutMs),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
  };
}
