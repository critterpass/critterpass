/**
 * "Start as": the steps run in order, each failure stops there and says which step failed in one
 * line a screenshot can be read from, and only a full run marks the install onboarded.
 */
import { describe, expect, it } from '@jest/globals';

import { SeedRefusedError, type SeedDemoOutcome } from '../seed-demo';
import {
  failureLine,
  homeFor,
  isNetworkFailure,
  parseStartAsRequest,
  runStartAs,
  type StartAsPorts,
} from '../start-as';

const SEEDED: SeedDemoOutcome = {
  crewId: 'crew-1',
  tripId: 'trip-1',
  code: 'K7M2QX',
  created: true,
  synced: true,
};

interface World {
  readonly calls: string[];
  clock: number;
}

function ports(world: World, over: Partial<StartAsPorts> = {}): StartAsPorts {
  return {
    hasAccount: () => false,
    startSession: () => {
      world.calls.push('session');
      return Promise.resolve();
    },
    setLanguage: (lang) => {
      world.calls.push(`lang:${lang}`);
      return Promise.resolve();
    },
    issuePass: (home) => {
      world.calls.push(`pass:${home}`);
      return Promise.resolve('pass-1');
    },
    passIssued: () => Promise.resolve(true),
    seed: (scenario) => {
      world.calls.push(`seed:${scenario}`);
      return Promise.resolve(SEEDED);
    },
    markOnboarded: () => void world.calls.push('onboarded'),
    wait: (ms) => {
      world.clock += ms;
      return Promise.resolve();
    },
    now: () => world.clock,
    passTimeoutMs: 2000,
    syncTimeoutMs: 3000,
    ...over,
  };
}

const newWorld = (): World => ({ calls: [], clock: 0 });

describe('runStartAs', () => {
  it('signs in, issues the pass from the scenario home, seeds, then marks onboarding done', async () => {
    const world = newWorld();
    const steps: string[] = [];
    const result = await runStartAs(ports(world), { scenario: 'trip_today', lang: 'vi' }, (step) =>
      steps.push(step),
    );
    expect(result).toEqual({
      kind: 'ready',
      request: { scenario: 'trip_today', lang: 'vi' },
      crewId: 'crew-1',
      tripId: 'trip-1',
      code: 'K7M2QX',
    });
    expect(world.calls).toEqual(['session', 'lang:vi', 'pass:SGN', 'seed:trip_today', 'onboarded']);
    expect(steps).toEqual(['request', 'account', 'pass', 'seed', 'sync']);
  });

  it('waits for the pass to come back before it seeds', async () => {
    const world = newWorld();
    let checks = 0;
    const result = await runStartAs(
      ports(world, { passIssued: () => Promise.resolve((checks += 1) >= 3) }),
      { scenario: 'inbox', lang: undefined },
    );
    expect(result.kind).toBe('ready');
    expect(checks).toBe(3);
    expect(world.calls).toEqual(['session', 'lang:en', 'pass:SIN', 'seed:inbox', 'onboarded']);
  });

  it('stops at an unknown scenario or language before touching the account', async () => {
    const world = newWorld();
    const scenario = await runStartAs(ports(world), { scenario: 'trip_next_week', lang: 'en' });
    const lang = await runStartAs(ports(world), { scenario: 'inbox', lang: 'fr' });
    expect(scenario).toMatchObject({ kind: 'failed', failure: { step: 'request' } });
    expect(scenario.kind === 'failed' && scenario.line).toContain(
      'Unknown scenario "trip_next_week"',
    );
    expect(lang.kind === 'failed' && lang.line).toContain('Unknown language "fr"');
    expect(world.calls).toEqual([]);
  });

  it('refuses an install that already has an account', async () => {
    const world = newWorld();
    const result = await runStartAs(ports(world, { hasAccount: () => true }), {
      scenario: 'inbox',
      lang: 'en',
    });
    expect(result.kind === 'failed' && result.line).toBe(
      'This install already has an account: clear the app data and launch again.',
    );
    expect(world.calls).toEqual([]);
  });

  it('names the network when the session cannot start, and never issues a pass', async () => {
    const world = newWorld();
    const result = await runStartAs(
      ports(world, {
        startSession: () =>
          Promise.reject(
            new Error('java.net.UnknownHostException: Unable to resolve host "api.example.test"'),
          ),
      }),
      { scenario: 'everyday', lang: 'en' },
    );
    expect(result).toMatchObject({ kind: 'failed', failure: { step: 'account' } });
    expect(result.kind === 'failed' && result.line).toMatch(/^Network: the api cannot be reached/);
    expect(world.calls).toEqual([]);
  });

  it('fails on the pass after its wait, without seeding', async () => {
    const world = newWorld();
    const result = await runStartAs(ports(world, { passIssued: () => Promise.resolve(false) }), {
      scenario: 'everyday',
      lang: 'en',
    });
    expect(result.kind === 'failed' && result.line).toBe(
      'Pass not issued: its row did not come back after 2 s.',
    );
    expect(world.clock).toBeGreaterThanOrEqual(2000);
    expect(world.calls).toEqual(['session', 'lang:en', 'pass:SIN']);
  });

  it('says why the api refused the seed, and that an old api does not know the scenario', async () => {
    const refused = async (error: SeedRefusedError) => {
      const world = newWorld();
      const result = await runStartAs(ports(world, { seed: () => Promise.reject(error) }), {
        scenario: 'trip_today',
        lang: 'en',
      });
      expect(world.calls).not.toContain('onboarded');
      return result.kind === 'failed' ? result.line : '';
    };
    expect(await refused(new SeedRefusedError(409, 'STATE_INVALID', 'no_editorial_places'))).toBe(
      'Seed refused (HTTP 409 STATE_INVALID no_editorial_places).',
    );
    expect(await refused(new SeedRefusedError(400, 'VALIDATION', null))).toBe(
      'Seed refused (HTTP 400 VALIDATION): this api does not know the scenario yet.',
    );
    expect(await refused(new SeedRefusedError(404, null, null))).toBe(
      'Seed refused (HTTP 404): this api has no dev seed mounted.',
    );
  });

  it('tells a seed request that never reached the api from one that failed', async () => {
    const world = newWorld();
    const result = await runStartAs(
      ports(world, { seed: () => Promise.reject(new TypeError('Network request failed')) }),
      { scenario: 'everyday', lang: 'en' },
    );
    expect(result.kind === 'failed' && result.line).toBe(
      'Network: the seed request did not reach the api (Network request failed).',
    );
  });

  it('fails on sync when the rows did not arrive, leaving onboarding open', async () => {
    const world = newWorld();
    const result = await runStartAs(
      ports(world, { seed: () => Promise.resolve({ ...SEEDED, synced: false }) }),
      { scenario: 'everyday', lang: 'en' },
    );
    expect(result).toMatchObject({ kind: 'failed', failure: { step: 'sync', seconds: 3 } });
    expect(result.kind === 'failed' && result.line).toContain('Rows not synced after 3 s');
    expect(world.calls).not.toContain('onboarded');
  });
});

describe('start-as requests and lines', () => {
  it('defaults the language to English and trims what a launch argument carried', () => {
    expect(parseStartAsRequest(' crew_with_code ', undefined)).toEqual({
      scenario: 'crew_with_code',
      lang: 'en',
    });
    expect(parseStartAsRequest(undefined, 'vi')).toMatchObject({ why: 'unknown_scenario' });
  });

  it('issues the pass from Singapore for the demo world and Ho Chi Minh City for the rest', () => {
    expect(homeFor('vote_final')).toBe('SIN');
    expect(homeFor('draft_ready')).toBe('SGN');
  });

  it('recognises the ways a platform says the network is gone', () => {
    expect(isNetworkFailure('Network request failed')).toBe(true);
    expect(isNetworkFailure('fetch failed: connect ECONNREFUSED')).toBe(true);
    expect(isNetworkFailure('anonymous sign-in failed: HTTP 500')).toBe(false);
    expect(failureLine({ step: 'account', message: 'anonymous sign-in failed: HTTP 500' })).toBe(
      'No account: the session did not start (anonymous sign-in failed: HTTP 500).',
    );
  });
});
