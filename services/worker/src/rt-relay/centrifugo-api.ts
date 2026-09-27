/**
 * Client for Centrifugo's HTTP server API (docs/api-contracts.md §5.7 "Server API (outbound)"):
 * `POST /api/<method>` with `X-API-Key`, answering `{result}` or `{error: {code, message}}`.
 * Only the four calls the outbox relay makes.
 */

/** Server API error codes that no retry can fix: unknown namespace, denied, limit, bad request. */
const PERMANENT_CODES = new Set([102, 103, 106, 107]);

/**
 * Application disconnect code in Centrifugo's reconnect range (4000–4499): the user's other devices
 * reconnect with a fresh token; the revoked one cannot get one.
 */
export const DISCONNECT_RECONNECT_CODE = 4000;

export class CentrifugoApiError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'CentrifugoApiError';
  }
}

export interface CentrifugoApiOptions {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly timeoutMs?: number;
}

interface ApiError {
  readonly code: number;
  readonly message: string;
}

interface ApiReply<T> {
  readonly result?: T;
  readonly error?: ApiError;
}

export interface BroadcastOutcome {
  /** One entry per requested channel, in order; `null` = published. */
  readonly errors: readonly (CentrifugoApiError | null)[];
}

export interface CentrifugoApi {
  publish(channel: string, data: unknown, idempotencyKey: string): Promise<void>;
  broadcast(
    channels: readonly string[],
    data: unknown,
    idempotencyKey: string,
  ): Promise<BroadcastOutcome>;
  unsubscribe(user: string, channel: string): Promise<void>;
  disconnect(user: string, reason: string): Promise<void>;
}

function toError(method: string, error: ApiError): CentrifugoApiError {
  return new CentrifugoApiError(
    `centrifugo ${method} failed: ${error.code} ${error.message}`,
    !PERMANENT_CODES.has(error.code),
  );
}

export function createCentrifugoApi(options: CentrifugoApiOptions): CentrifugoApi {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const timeoutMs = options.timeoutMs ?? 5000;

  async function call<T>(method: string, body: Record<string, unknown>): Promise<T | undefined> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/${method}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': options.apiKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new CentrifugoApiError(`centrifugo ${method} unreachable: ${reason}`, true);
    }
    if (!response.ok) {
      throw new CentrifugoApiError(
        `centrifugo ${method} failed: HTTP ${response.status}`,
        response.status >= 500 || response.status === 429 || response.status === 401,
      );
    }
    const reply = (await response.json()) as ApiReply<T>;
    if (reply.error !== undefined) throw toError(method, reply.error);
    return reply.result;
  }

  return {
    async publish(channel, data, idempotencyKey) {
      await call('publish', { channel, data, idempotency_key: idempotencyKey });
    },

    async broadcast(channels, data, idempotencyKey) {
      const result = await call<{ responses?: readonly ApiReply<unknown>[] }>('broadcast', {
        channels,
        data,
        idempotency_key: idempotencyKey,
      });
      const responses = result?.responses ?? [];
      return {
        errors: channels.map((_, index) => {
          const reply = responses[index];
          if (reply === undefined) {
            return new CentrifugoApiError('centrifugo broadcast: missing channel response', true);
          }
          return reply.error !== undefined ? toError('broadcast', reply.error) : null;
        }),
      };
    },

    async unsubscribe(user, channel) {
      await call('unsubscribe', { user, channel });
    },

    async disconnect(user, reason) {
      await call('disconnect', { user, disconnect: { code: DISCONNECT_RECONNECT_CODE, reason } });
    },
  };
}
