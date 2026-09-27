/**
 * Gateway errors. Every provider failure leaves `packages/ai` as a `GatewayError` carrying one code
 * from `AI_ERROR_CODES` (packages/domain/src/ai/errors.ts), so callers and the SSE encoder never see
 * a raw provider message. `GatewayConfigError` is a programming error (a request the provider would
 * reject with 400 for a known reason) and is never shown to users.
 */
import { APIConnectionError, APIError } from '@anthropic-ai/sdk';
import { AI_ERRORS, type AiErrorCode } from '@cp/domain';

export class GatewayError extends Error {
  readonly code: AiErrorCode;
  readonly retryable: boolean;
  readonly detail: Readonly<Record<string, unknown>> | undefined;

  constructor(
    code: AiErrorCode,
    message: string,
    options: { detail?: Readonly<Record<string, unknown>>; cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'GatewayError';
    this.code = code;
    this.retryable = AI_ERRORS[code].retryable;
    this.detail = options.detail;
  }
}

export class GatewayConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GatewayConfigError';
  }
}

/**
 * HTTP statuses retried with jittered backoff: rate limited (429), server error (500) and
 * overloaded (503, and 529 from Anthropic-format endpoints that use it).
 */
export const RETRYABLE_STATUSES: ReadonlySet<number> = new Set([429, 500, 503, 529]);

export function isRetryableProviderError(error: unknown): boolean {
  return (
    error instanceof APIError &&
    typeof error.status === 'number' &&
    RETRYABLE_STATUSES.has(error.status)
  );
}

/** Maps any provider/transport failure onto the gateway taxonomy. */
export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof APIConnectionError) {
    return new GatewayError('AI_UNAVAILABLE', 'model provider unreachable', { cause: error });
  }
  if (error instanceof APIError) {
    const status = typeof error.status === 'number' ? error.status : undefined;
    const transient = status === undefined || status >= 500 || RETRYABLE_STATUSES.has(status);
    const detail = { status: status ?? null, type: error.type ?? null, transient };
    return new GatewayError('AI_UNAVAILABLE', 'model provider request failed', {
      detail,
      cause: error,
    });
  }
  return new GatewayError('AI_UNAVAILABLE', 'model call failed', { cause: error });
}
