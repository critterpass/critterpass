/**
 * Valhalla failures as a closed set of kinds the routing callers branch on. A point that snaps to
 * no road is `off_graph`, two points the graph cannot join are `no_route`, a request over the
 * service limits is `limit`; those are answers from a healthy router. `timeout`, `unavailable`
 * and `circuit_open` mean the router itself is not answering, and `bad_response` means it
 * answered with a shape we do not understand. Callers fall back to straight-line estimates for
 * every kind; only the router-down kinds count toward the circuit breaker.
 */
export type ValhallaErrorKind =
  | 'off_graph'
  | 'no_route'
  | 'limit'
  | 'rejected'
  | 'timeout'
  | 'unavailable'
  | 'circuit_open'
  | 'bad_response';

export class ValhallaError extends Error {
  constructor(
    readonly kind: ValhallaErrorKind,
    message: string,
    readonly detail: { readonly status?: number; readonly valhallaCode?: number } = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'ValhallaError';
  }

  /** The router is down or overloaded (as opposed to answering "no"). */
  get routerDown(): boolean {
    return this.kind === 'timeout' || this.kind === 'unavailable' || this.kind === 'circuit_open';
  }
}

/** Kinds worth one more attempt: the next try may land on a free worker. */
export function isRetryable(error: ValhallaError): boolean {
  return error.kind === 'timeout' || error.kind === 'unavailable';
}

/**
 * Maps Valhalla's own `error_code` (docs: valhalla.github.io/valhalla/api/turn-by-turn/api-reference
 * "HTTP status codes and conditions") to a kind: 171 "No suitable edges near location", 170
 * "Locations are in unconnected regions", 442/443 "No path could be found", 150–158 the service
 * limits (too many locations, distance over the limit).
 */
export function kindForValhallaCode(code: number): ValhallaErrorKind {
  if (code === 171) return 'off_graph';
  if (code === 170 || code === 442 || code === 443) return 'no_route';
  if (code >= 150 && code <= 158) return 'limit';
  return 'rejected';
}
