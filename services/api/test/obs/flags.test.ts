import { readFileSync } from 'node:fs';

import { resolveFlags } from '@cp/domain';
import { afterEach, describe, expect, it } from 'vitest';

import { createFlagService, type FlagService } from '../../src/obs/flags';

const definitions = readFileSync(
  new URL('../fixtures/posthog/flags-definitions.json', import.meta.url),
  'utf8',
);

/** Every catalog flag at its default; the fixture's definitions only cover `analytics.replay`. */
const DEFAULTS = resolveFlags(undefined);

type Fetch = NonNullable<Parameters<typeof createFlagService>[0]['fetch']>;

const response = (status: number, body: string) =>
  Promise.resolve({
    status,
    text: () => Promise.resolve(body),
    json: () => Promise.resolve(JSON.parse(body) as unknown),
    headers: { get: () => null },
  }) as unknown as ReturnType<Fetch>;

let service: FlagService<Record<string, never>> | undefined;
afterEach(async () => {
  await service?.shutdown();
});

function serviceWith(fetch: Fetch) {
  const created = createFlagService({
    projectApiKey: 'phc_test',
    flagsSecretKey: 'phs_test',
    fetch,
    readyTimeoutMs: 300,
  });
  service = created as unknown as FlagService<Record<string, never>>;
  return created;
}

describe('server flags', () => {
  it('evaluates locally from the polled definitions', async () => {
    const urls: string[] = [];
    const flags = serviceWith((url) => {
      urls.push(url);
      return response(200, definitions);
    });
    expect(await flags.evaluate({ distinctId: 'pid-1', platform: 'ios' })).toEqual({
      ...DEFAULTS,
      'analytics.replay': true,
    });
    expect(await flags.evaluate({ distinctId: 'pid-2', platform: 'android' })).toEqual({
      ...DEFAULTS,
      'analytics.replay': false,
    });
    expect(urls.every((url) => url.startsWith('https://eu.i.posthog.com/flags/definitions'))).toBe(
      true,
    );
  });

  it('falls back to catalog defaults when PostHog is down', async () => {
    const flags = serviceWith(() => Promise.reject(new Error('ECONNREFUSED')));
    expect(await flags.evaluate({ distinctId: 'pid-1', platform: 'ios' })).toEqual({
      ...DEFAULTS,
      'analytics.replay': false,
    });
  });

  it('falls back to catalog defaults on server errors', async () => {
    const flags = serviceWith(() => response(503, '{"detail":"unavailable"}'));
    expect(await flags.evaluate({ distinctId: 'pid-1', platform: 'ios' })).toEqual({
      ...DEFAULTS,
      'analytics.replay': false,
    });
  });

  it('returns defaults without credentials', async () => {
    const flags = createFlagService({ projectApiKey: undefined, flagsSecretKey: undefined });
    expect(await flags.evaluate({ distinctId: 'pid-1' })).toEqual({
      ...DEFAULTS,
      'analytics.replay': false,
    });
  });
});
