/**
 * Frankfurter v2 HTTP client (docs/product-decisions.md's FX rule): timeout, retry-with-backoff on
 * transient failures only, and a typed, non-retryable error for anything else (bad currency code,
 * malformed body). The response's `rate` field is captured via `JSON.parse`'s reviver `source`
 * (ES2025 "JSON.parse source access"), never through the parser's own number coercion, so a rate
 * with more precision than a JS `number` can hold is still passed on exactly as Frankfurter sent it.
 */
import { z } from 'zod';

const DEFAULT_BASE_URL = 'https://api.frankfurter.dev/v2';
const DEFAULT_TIMEOUT_MS = 10_000;
/** Outbound cap for this integration (docs/product-decisions.md's FX rule: "120 s outbound cap"). */
const MAX_TIMEOUT_MS = 120_000;
const DEFAULT_RETRIES = 2;
const BASE_BACKOFF_MS = 100;

export class FrankfurterError extends Error {
  readonly status: number | undefined;
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable: boolean; cause?: unknown }) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'FrankfurterError';
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

const frankfurterRateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be an ISO date'),
  base: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code'),
  quote: z.string().regex(/^[A-Z]{3}$/, 'must be an ISO 4217 code'),
  /** Captured as an exact decimal string; see the reviver in `parseRatesResponse` below. */
  rate: z.string().regex(/^-?\d+(?:\.\d+)?$/, 'must be an exact decimal string'),
});
const frankfurterRatesResponseSchema = z.array(frankfurterRateSchema);

export type FrankfurterRate = z.infer<typeof frankfurterRateSchema>;

export interface FetchFxRatesInput {
  readonly base: string;
  readonly quotes: readonly string[];
  /** Omit for the latest available rates. */
  readonly date?: string;
}

export interface FrankfurterClientOptions {
  readonly baseUrl?: string;
  /** Clamped to [1ms, 120s]. Default 10s. */
  readonly timeoutMs?: number;
  readonly retries?: number;
  /** Test-only network-boundary double (docs/code-standards.md §17: fixtures replace this). */
  readonly fetchImpl?: typeof fetch;
}

function parseRatesResponse(text: string): readonly FrankfurterRate[] {
  let parsed: unknown;
  try {
    // The reviver's third argument (`{ source }`, the raw source text for this value — ES2025
    // "JSON.parse source access") is what lets `rate` survive as an exact string instead of the
    // parser's own number coercion. TypeScript 6.0's lib types do not model it yet even though V8
    // supports it, so the parameter is typed loosely and optionally here rather than left as `any`.
    parsed = JSON.parse(text, (key: string, value: unknown, context?: { source?: string }) =>
      key === 'rate' && typeof context?.source === 'string' ? context.source : value,
    );
  } catch (cause) {
    throw new FrankfurterError('malformed Frankfurter response body', { retryable: false, cause });
  }
  const result = frankfurterRatesResponseSchema.safeParse(parsed);
  if (!result.success) {
    throw new FrankfurterError('unexpected Frankfurter response shape', {
      retryable: false,
      cause: result.error,
    });
  }
  return result.data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchOnce(
  url: string,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<readonly FrankfurterRate[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetchImpl(url, { signal: controller.signal });
  } catch (cause) {
    throw new FrankfurterError('Frankfurter request failed to send', { retryable: true, cause });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const retryable = response.status >= 500 || response.status === 429;
    throw new FrankfurterError(`Frankfurter responded ${response.status}`, {
      status: response.status,
      retryable,
    });
  }
  return parseRatesResponse(await response.text());
}

/**
 * Fetches EUR-base (or any `base`) rates for `quotes`, retrying transient failures (timeout,
 * network error, 5xx, 429) with backoff; a non-retryable failure (bad currency, malformed body)
 * throws immediately on the first attempt.
 */
export async function fetchFxRates(
  input: FetchFxRatesInput,
  options: FrankfurterClientOptions = {},
): Promise<readonly FrankfurterRate[]> {
  const baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
  const timeoutMs = Math.min(Math.max(options.timeoutMs ?? DEFAULT_TIMEOUT_MS, 1), MAX_TIMEOUT_MS);
  const retries = options.retries ?? DEFAULT_RETRIES;
  const fetchImpl = options.fetchImpl ?? fetch;

  // A leading "/" makes this an absolute-path reference: it replaces the whole path of `baseUrl`,
  // keeping only its origin, so this resolves correctly whether or not `baseUrl` already ends in
  // "/v2" (both the real default and a bare-origin override in a test work the same way).
  const url = new URL('/v2/rates', baseUrl);
  url.searchParams.set('base', input.base);
  url.searchParams.set('quotes', input.quotes.join(','));
  if (input.date !== undefined) {
    url.searchParams.set('date', input.date);
  }

  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetchOnce(url.toString(), timeoutMs, fetchImpl);
    } catch (error) {
      if (error instanceof FrankfurterError && !error.retryable) {
        throw error;
      }
      lastError = error;
      if (attempt < retries) {
        await sleep(BASE_BACKOFF_MS * 2 ** attempt);
      }
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new FrankfurterError('Frankfurter request failed', { retryable: true, cause: lastError });
}
