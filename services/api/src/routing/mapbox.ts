/**
 * Thin Mapbox Directions v5 and Matrix v1 client. Every call has a hard timeout; any transport
 * failure, timeout, 429 or 5xx surfaces as `RoutingUnavailableError` so the provider can fall back,
 * while Mapbox's own "no route" answer surfaces as `null` durations / `NoRouteError`.
 * The access token only ever appears in the outgoing URL, never in errors or logs.
 */
import type { MapboxProfile } from './modes';

export interface RoutingHttpClient {
  fetch(input: string, init?: RequestInit): Promise<Response>;
}

export interface MapboxClientConfig {
  readonly accessToken: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly http?: RoutingHttpClient;
}

export interface LngLat {
  readonly lng: number;
  readonly lat: number;
}

export class RoutingUnavailableError extends Error {
  constructor(
    readonly reason: 'timeout' | 'network' | 'rate_limited' | 'upstream_error' | 'unauthorized',
    readonly status?: number,
  ) {
    super(`routing provider unavailable: ${reason}${status !== undefined ? ` (${status})` : ''}`);
    this.name = 'RoutingUnavailableError';
  }
}

export class NoRouteError extends Error {
  constructor(readonly code: string) {
    super(`no route: ${code}`);
    this.name = 'NoRouteError';
  }
}

export interface DirectionsRoute {
  readonly durationS: number;
  readonly distanceM: number;
  /** `driving-traffic` only: the same route under typical traffic. */
  readonly durationTypicalS?: number;
  /** GeoJSON LineString coordinates, `[lng, lat]`. */
  readonly geometry: readonly (readonly [number, number])[];
}

export interface DirectionsRequest {
  readonly profile: MapboxProfile;
  readonly origin: LngLat;
  readonly dest: LngLat;
  readonly departAt?: Date;
  readonly excludePoints?: readonly LngLat[];
}

export interface MatrixRequest {
  readonly profile: MapboxProfile;
  /** Unique coordinates for this request; `sources`/`destinations` index into it. */
  readonly coordinates: readonly LngLat[];
  readonly sources: readonly number[];
  readonly destinations: readonly number[];
  readonly departAt?: Date;
}

export interface MatrixResponse {
  /** Row per source, column per destination; `null` where Mapbox found no route. */
  readonly durationsS: readonly (readonly (number | null)[])[];
  readonly distancesM: readonly (readonly (number | null)[])[];
}

const DEFAULT_BASE_URL = 'https://api.mapbox.com';
/** Single-route p95 budget is 300 ms; 3 s leaves room for a slow hop before falling back. */
export const DEFAULT_ROUTING_TIMEOUT_MS = 3_000;

/** Six decimals is ~0.1 m: finer precision only lengthens URLs. */
function formatCoordinate(point: LngLat): string {
  return `${point.lng.toFixed(6)},${point.lat.toFixed(6)}`;
}

/** Mapbox takes `YYYY-MM-DDThh:mm:ssZ`; it rejects fractional seconds. */
export function formatDepartAt(date: Date): string {
  return `${date.toISOString().slice(0, 19)}Z`;
}

export class MapboxRoutingClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly http: RoutingHttpClient;

  constructor(private readonly config: MapboxClientConfig) {
    this.baseUrl = config.baseUrl ?? DEFAULT_BASE_URL;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_ROUTING_TIMEOUT_MS;
    this.http = config.http ?? globalThis;
  }

  async directions(request: DirectionsRequest): Promise<DirectionsRoute> {
    const params = new URLSearchParams({
      alternatives: 'false',
      geometries: 'geojson',
      overview: 'simplified',
      steps: 'false',
    });
    if (request.departAt !== undefined) params.set('depart_at', formatDepartAt(request.departAt));
    if (request.excludePoints !== undefined && request.excludePoints.length > 0) {
      params.set(
        'exclude',
        request.excludePoints
          .map((point) => `point(${point.lng.toFixed(6)} ${point.lat.toFixed(6)})`)
          .join(','),
      );
    }
    const path =
      `/directions/v5/mapbox/${request.profile}/` +
      `${formatCoordinate(request.origin)};${formatCoordinate(request.dest)}`;
    const body = await this.get(path, params);
    const route = (body as DirectionsBody).routes?.[0];
    if (body.code !== 'Ok' || route === undefined) throw new NoRouteError(body.code);
    return {
      durationS: route.duration,
      distanceM: route.distance,
      ...(route.duration_typical !== undefined ? { durationTypicalS: route.duration_typical } : {}),
      geometry: route.geometry.coordinates,
    };
  }

  async matrix(request: MatrixRequest): Promise<MatrixResponse> {
    const params = new URLSearchParams({
      annotations: 'duration,distance',
      sources: request.sources.join(';'),
      destinations: request.destinations.join(';'),
    });
    if (request.departAt !== undefined) params.set('depart_at', formatDepartAt(request.departAt));
    const path =
      `/directions-matrix/v1/mapbox/${request.profile}/` +
      request.coordinates.map(formatCoordinate).join(';');
    const body = (await this.get(path, params)) as MatrixBody;
    if (body.code !== 'Ok' || body.durations === undefined || body.distances === undefined) {
      throw new NoRouteError(body.code);
    }
    return { durationsS: body.durations, distancesM: body.distances };
  }

  private async get(path: string, params: URLSearchParams): Promise<{ code: string }> {
    params.set('access_token', this.config.accessToken);
    let response: Response;
    try {
      response = await this.http.fetch(`${this.baseUrl}${path}?${params.toString()}`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (error) {
      const name = (error as { name?: unknown }).name;
      throw new RoutingUnavailableError(
        name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network',
      );
    }
    if (response.status === 401 || response.status === 403) {
      throw new RoutingUnavailableError('unauthorized', response.status);
    }
    if (response.status === 429) throw new RoutingUnavailableError('rate_limited', 429);
    if (response.status >= 500) {
      throw new RoutingUnavailableError('upstream_error', response.status);
    }
    const body = (await response.json()) as { code?: string; message?: string };
    // 4xx other than auth/rate limits are Mapbox rejecting the input (e.g. NoSegment, InvalidInput).
    return { ...body, code: body.code ?? `http_${response.status}` };
  }
}

interface DirectionsBody {
  readonly code: string;
  readonly routes?: readonly {
    readonly duration: number;
    readonly distance: number;
    readonly duration_typical?: number;
    readonly geometry: { readonly coordinates: readonly (readonly [number, number])[] };
  }[];
}

interface MatrixBody {
  readonly code: string;
  readonly durations?: readonly (readonly (number | null)[])[];
  readonly distances?: readonly (readonly (number | null)[])[];
}
