/**
 * The one outbound door for supplier traffic (docs/system-architecture.md §10: outbound timeouts,
 * fixed IP). Railway's static outbound IP applies to every connection the service opens, so the
 * address partners allow-list needs no per-request setup; what this door guarantees is the timeout:
 * every call is aborted at its own deadline, never later than the 120 s supplier cap, and a caller's
 * own abort signal still cancels it early.
 */

/** The hard cap on any single supplier request (docs/api-contracts.md §7). */
export const SUPPLIER_TIMEOUT_CAP_MS = 120_000;
export const DEFAULT_SUPPLIER_TIMEOUT_MS = 30_000;

export type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export interface EgressOptions {
  readonly fetch?: FetchLike;
  /** Clamped to [1 ms, 120 s]; default 30 s. */
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export function clampTimeout(timeoutMs: number | undefined): number {
  const value = timeoutMs ?? DEFAULT_SUPPLIER_TIMEOUT_MS;
  return Math.min(Math.max(1, Math.floor(value)), SUPPLIER_TIMEOUT_CAP_MS);
}

/** Raised when the deadline, not the caller, aborted the request. */
export class SupplierTimeoutError extends Error {
  constructor(readonly timeoutMs: number) {
    super(`supplier request timed out after ${timeoutMs} ms`);
    this.name = 'SupplierTimeoutError';
  }
}

export async function fetchWithEgress(
  url: string | URL,
  init: RequestInit = {},
  options: EgressOptions = {},
): Promise<Response> {
  const timeoutMs = clampTimeout(options.timeoutMs);
  const deadline = AbortSignal.timeout(timeoutMs);
  const signal =
    options.signal === undefined ? deadline : AbortSignal.any([deadline, options.signal]);
  const doFetch = options.fetch ?? globalThis.fetch;
  try {
    return await doFetch(url, { ...init, signal });
  } catch (error) {
    if (deadline.aborted && options.signal?.aborted !== true) {
      throw new SupplierTimeoutError(timeoutMs);
    }
    throw error;
  }
}
