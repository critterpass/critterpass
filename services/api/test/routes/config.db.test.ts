/**
 * `GET /v1/config/bootstrap` on the real stack (Postgres, Redis, Better Auth sessions): the flags
 * an account gets, evaluated from PostHog's definitions. PostHog is the network boundary, answered
 * through posthog-node's `fetch` option with the recorded local-evaluation reply.
 */
import { readFileSync } from 'node:fs';

import { resolveFlags } from '@cp/domain';
import { pino } from 'pino';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app';
import type { CommandDoorDeps } from '../../src/commands/_framework/doors';
import { createFlagService } from '../../src/obs/flags';
import { registerConfigRoutes, type ConfigRouteDeps } from '../../src/routes/config';
import { startCommandDoors, type CommandDoorsHarness } from './command-doors-harness';

const definitions = readFileSync(
  new URL('../fixtures/posthog/flags-definitions.json', import.meta.url),
  'utf8',
);
const DEFAULTS = resolveFlags(undefined);
const PID_SALT = 'test-analytics-pid-salt';

type Fetch = NonNullable<Parameters<typeof createFlagService>[0]['fetch']>;

const response = (status: number, body: string) =>
  Promise.resolve({
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
    headers: { get: () => null },
  }) as unknown as ReturnType<Fetch>;

let harness: CommandDoorsHarness;
let doors: CommandDoorDeps;

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (_app, deps) => {
      doors = deps;
    },
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

const services: ConfigRouteDeps['flags'][] = [];
afterEach(async () => {
  await Promise.all(services.splice(0).map((service) => service.shutdown()));
});

/** The route over the harness's sessions and Redis, on a flag service that has just started. */
function bootstrapWith(
  posthog: Fetch,
  options: Pick<ConfigRouteDeps, 'pidSalt' | 'readyTimeoutMs'>,
) {
  const flags = createFlagService({
    projectApiKey: 'phc_test',
    flagsSecretKey: 'phs_test',
    fetch: posthog,
  });
  services.push(flags);
  const app = createApp({
    service: 'api',
    version: 'test',
    commit: 'test',
    logger: pino({ level: 'silent' }),
    readiness: {},
    exposeDocs: false,
  });
  registerConfigRoutes(app, { sessions: doors.sessions, redis: doors.redis, flags, ...options });
  return (cookie?: string) =>
    Promise.resolve(
      app.request('http://localhost:8787/v1/config/bootstrap', {
        headers: cookie === undefined ? {} : { cookie },
      }),
    );
}

describe('GET /v1/config/bootstrap', () => {
  it("answers an anonymous session's flags, waiting out a fresh process's first load", async () => {
    const urls: string[] = [];
    const bootstrap = bootstrapWith(
      async (url) => {
        urls.push(url);
        // Slower than the flag service's own wait: the route's longer one covers a deploy.
        await new Promise((resolve) => setTimeout(resolve, 700));
        return response(200, definitions);
      },
      { pidSalt: PID_SALT },
    );
    const session = await harness.signInAnonymously();

    const answered = await bootstrap(session.cookie);

    expect(answered.status).toBe(200);
    expect(answered.headers.get('cache-control')).toBe('private, no-store');
    expect(await answered.json()).toEqual({ flags: { ...DEFAULTS, 'money.receipts': true } });
    // Definitions only: nothing about the caller is sent to PostHog.
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes('/flags/definitions'))).toBe(true);
    expect(urls.some((url) => url.includes(session.uid))).toBe(false);
  });

  it('answers the catalog defaults with a 200 when PostHog is failing', async () => {
    const session = await harness.signInAnonymously();
    const down = bootstrapWith(() => Promise.reject(new Error('ECONNREFUSED')), {
      pidSalt: PID_SALT,
      readyTimeoutMs: 300,
    });
    const erroring = bootstrapWith(() => response(503, '{"detail":"unavailable"}'), {
      pidSalt: PID_SALT,
      readyTimeoutMs: 300,
    });

    for (const bootstrap of [down, erroring]) {
      const answered = await bootstrap(session.cookie);
      expect(answered.status).toBe(200);
      expect(await answered.json()).toEqual({ flags: DEFAULTS });
    }
  });

  it('answers the catalog defaults when the api has no pseudonymous id salt', async () => {
    const bootstrap = bootstrapWith(() => response(200, definitions), { pidSalt: undefined });
    const session = await harness.signInAnonymously();

    const answered = await bootstrap(session.cookie);

    expect(answered.status).toBe(200);
    expect(await answered.json()).toEqual({ flags: DEFAULTS });
  });

  it('refuses a request without a session', async () => {
    const bootstrap = bootstrapWith(() => response(200, definitions), { pidSalt: PID_SALT });

    const answered = await bootstrap();

    expect(answered.status).toBe(401);
    expect(await answered.json()).toMatchObject({ error: { code: 'AUTH_REQUIRED' } });
  });
});
