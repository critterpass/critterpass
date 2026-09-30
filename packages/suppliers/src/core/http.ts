/**
 * Supplier HTTP client on top of the egress door: every attempt is audited, and only idempotent
 * reads (GET) are retried, on network errors, timeouts, 429 and 5xx, with exponential backoff
 * (docs/api-contracts.md §7: "retries only on idempotent reads"). A write is sent exactly once.
 */
import type { z } from 'zod';

import type { SupplierCallAudit, SupplierCallOutcome } from './audit';
import { fetchWithEgress, SupplierTimeoutError, type FetchLike } from './egress';

export interface SupplierRequest {
  readonly supplier: string;
  /** Fixed label for the audit row (`prices_for_dates`), never a URL. */
  readonly endpoint: string;
  readonly url: string | URL;
  readonly method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string;
  readonly timeoutMs?: number;
  /** Extra attempts after the first for GET; ignored for writes. Default 2. */
  readonly retries?: number;
  /** Units the supplier bills per call (quota accounting); default 1. */
  readonly costUnits?: number;
  readonly signal?: AbortSignal;
}

export interface SupplierResponse {
  readonly status: number;
  readonly body: string;
}

export class SupplierHttpError extends Error {
  constructor(
    message: string,
    readonly supplier: string,
    readonly status: number | null,
    readonly retryable: boolean,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'SupplierHttpError';
  }
}

export interface SupplierHttp {
  request(request: SupplierRequest): Promise<SupplierResponse>;
  /** GET + JSON parse + schema check; a body that fails the schema is a non-retryable error. */
  getJson<T>(request: SupplierRequest, schema: z.ZodType<T>): Promise<T>;
  /** Any method with a JSON body, parsed and checked the same way (writes are never retried). */
  sendJson<T>(request: SupplierRequest, schema: z.ZodType<T>): Promise<T>;
}

export interface SupplierHttpOptions {
  readonly audit: SupplierCallAudit;
  readonly fetch?: FetchLike;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly baseBackoffMs?: number;
}

const DEFAULT_RETRIES = 2;
const DEFAULT_BACKOFF_MS = 250;

function isRetryableStatus(status: number): boolean {
  return status === 429 || status >= 500;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createSupplierHttp(options: SupplierHttpOptions): SupplierHttp {
  const sleep = options.sleep ?? defaultSleep;
  const baseBackoffMs = options.baseBackoffMs ?? DEFAULT_BACKOFF_MS;

  async function attemptOnce(
    request: SupplierRequest,
    attempt: number,
  ): Promise<{ response?: SupplierResponse; error?: SupplierHttpError }> {
    const method = request.method ?? 'GET';
    const startedAt = performance.now();
    let outcome: SupplierCallOutcome = 'ok';
    let status: number | null = null;
    try {
      const response = await fetchWithEgress(
        request.url,
        {
          method,
          ...(request.headers !== undefined ? { headers: request.headers } : {}),
          ...(request.body !== undefined ? { body: request.body } : {}),
        },
        {
          ...(options.fetch !== undefined ? { fetch: options.fetch } : {}),
          ...(request.timeoutMs !== undefined ? { timeoutMs: request.timeoutMs } : {}),
          ...(request.signal !== undefined ? { signal: request.signal } : {}),
        },
      );
      status = response.status;
      const body = await response.text();
      if (!response.ok) {
        outcome = 'http_error';
        return {
          error: new SupplierHttpError(
            `${request.supplier} ${request.endpoint} answered ${response.status}`,
            request.supplier,
            response.status,
            isRetryableStatus(response.status),
          ),
        };
      }
      return { response: { status: response.status, body } };
    } catch (error) {
      outcome = error instanceof SupplierTimeoutError ? 'timeout' : 'network_error';
      return {
        error: new SupplierHttpError(
          `${request.supplier} ${request.endpoint} failed: ${outcome}`,
          request.supplier,
          null,
          request.signal?.aborted !== true,
          { cause: error },
        ),
      };
    } finally {
      await options.audit({
        supplier: request.supplier,
        endpoint: request.endpoint,
        method,
        attempt,
        outcome,
        status,
        latencyMs: performance.now() - startedAt,
        costUnits: request.costUnits ?? 1,
      });
    }
  }

  async function request(request: SupplierRequest): Promise<SupplierResponse> {
    const idempotent = (request.method ?? 'GET') === 'GET';
    const attempts = idempotent ? 1 + Math.max(0, request.retries ?? DEFAULT_RETRIES) : 1;
    let lastError: SupplierHttpError | undefined;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      const result = await attemptOnce(request, attempt);
      if (result.response !== undefined) return result.response;
      lastError = result.error;
      if (lastError === undefined || !lastError.retryable || attempt === attempts) break;
      const backoff = baseBackoffMs * 2 ** (attempt - 1);
      await sleep(backoff + Math.floor(Math.random() * baseBackoffMs));
    }
    throw lastError ?? new Error('supplier request produced no result');
  }

  function parse<T>(req: SupplierRequest, response: SupplierResponse, schema: z.ZodType<T>): T {
    let parsed: unknown;
    try {
      parsed = JSON.parse(response.body);
    } catch (error) {
      throw new SupplierHttpError(
        `${req.supplier} ${req.endpoint} returned a body that is not JSON`,
        req.supplier,
        response.status,
        false,
        { cause: error },
      );
    }
    const result = schema.safeParse(parsed);
    if (!result.success) {
      throw new SupplierHttpError(
        `${req.supplier} ${req.endpoint} returned an unexpected shape`,
        req.supplier,
        response.status,
        false,
        { cause: result.error },
      );
    }
    return result.data;
  }

  return {
    request,
    async getJson(req, schema) {
      return parse(req, await request({ ...req, method: 'GET' }), schema);
    },
    async sendJson(req, schema) {
      const headers = { 'Content-Type': 'application/json', ...req.headers };
      return parse(req, await request({ ...req, headers }), schema);
    },
  };
}
