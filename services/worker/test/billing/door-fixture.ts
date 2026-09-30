/**
 * The api's internal billing door as a recorded network boundary: each call is captured and
 * answered from a queue of responses in the api's documented shape.
 */
import type { JobContext } from '../../src/boss';

export interface DoorCall {
  readonly url: string;
  readonly secret: string | null;
  readonly body: unknown;
}

export function recordedDoor(responses: Array<{ status: number; body: unknown }>) {
  const calls: DoorCall[] = [];
  const fetchImpl: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    calls.push({
      url,
      secret: headers.get('x-cp-billing-secret'),
      body: typeof init?.body === 'string' ? JSON.parse(init.body) : null,
    });
    const next = responses.shift();
    if (next === undefined) return Promise.reject(new Error('unexpected door call'));
    return Promise.resolve(new Response(JSON.stringify(next.body), { status: next.status }));
  };
  return { calls, fetch: fetchImpl };
}

export function jobContext(): { ctx: JobContext; warnings: unknown[] } {
  const warnings: unknown[] = [];
  const logger = {
    info: () => undefined,
    warn: (entry: unknown) => {
      warnings.push(entry);
    },
    error: () => undefined,
    debug: () => undefined,
    child: () => logger,
  };
  const ctx = {
    logger,
    pool: undefined,
    boss: undefined,
    job: {
      id: 'job-1',
      queue: 'billing.apply',
      retryCount: 0,
      retryLimit: 5,
      isFinalAttempt: false,
      signal: new AbortController().signal,
    },
  } as unknown as JobContext;
  return { ctx, warnings };
}
