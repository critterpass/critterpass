/**
 * The Developer tools seed: it sends the scenario with the session headers, waits on the real
 * local database until the seeded crew, trip and inbox items have synced, reports when they have
 * not arrived in time, and surfaces the api's refusal. The api is a recorded response at the
 * network boundary.
 */
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '../../powersync/test-support/local-first-fixture';
import { removeDir } from '../../powersync/test-support/open-node-database';
import { seedDemoData, type SeedDemoDeps } from '../seed-demo';

const SEEDED = {
  crew_id: '01920000-0000-7000-8000-000000000001',
  trip_id: '01920000-0000-7000-8000-000000000002',
  scenario: 'inbox',
  created: true,
  inbox_item_ids: ['01920000-0000-7000-8000-000000000003'],
};

let local: TestLocalFirst;
let requests: { url: string; init: RequestInit }[];

beforeEach(async () => {
  local = await openTestLocalFirst();
  requests = [];
});

afterEach(async () => {
  await local.close();
  removeDir(local.dir);
});

function deps(status: number, body: unknown): SeedDemoDeps {
  return {
    baseUrl: 'https://api.example.test',
    sessionHeaders: () => Promise.resolve({ cookie: 'session=1' }),
    db: local.db,
    fetch: (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      requests.push({ url, init: init ?? {} });
      return Promise.resolve(new Response(JSON.stringify(body), { status }));
    },
    syncTimeoutMs: 300,
    pollMs: 50,
  };
}

async function deliver(): Promise<void> {
  await local.db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [
    SEEDED.crew_id,
    'Bali Demo Crew',
  ]);
  await local.db.execute('INSERT INTO trips (id, crew_id, status) VALUES (?, ?, ?)', [
    SEEDED.trip_id,
    SEEDED.crew_id,
    'confirmed',
  ]);
  await local.db.execute('INSERT INTO inbox_items (id, user_id, kind) VALUES (?, ?, ?)', [
    SEEDED.inbox_item_ids[0],
    local.uid,
    'nudge.received',
  ]);
}

describe('seedDemoData', () => {
  it('asks for the scenario with the session and waits until sync delivers it', async () => {
    const pending = seedDemoData(deps(200, SEEDED), 'inbox');
    setTimeout(() => void deliver(), 100);
    await expect(pending).resolves.toEqual({
      crewId: SEEDED.crew_id,
      tripId: SEEDED.trip_id,
      code: null,
      created: true,
      synced: true,
    });
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe('https://api.example.test/v1/dev/seed-demo');
    expect(requests[0]?.init.headers).toMatchObject({ cookie: 'session=1' });
    expect(JSON.parse(requests[0]?.init.body as string)).toEqual({ scenario: 'inbox' });
  });

  it('waits for the destination vote as well when a vote scenario opened one', async () => {
    const poll = '01920000-0000-7000-8000-000000000004';
    await deliver();
    const withVote = deps(200, { ...SEEDED, scenario: 'vote', poll_id: poll });
    await expect(seedDemoData(withVote, 'vote')).resolves.toMatchObject({ synced: false });
    await local.db.execute('INSERT INTO polls (id, crew_id, kind) VALUES (?, ?, ?)', [
      poll,
      SEEDED.crew_id,
      'destination',
    ]);
    await expect(seedDemoData(withVote, 'vote')).resolves.toMatchObject({ synced: true });
  });

  it('waits for the crew alone when the scenario has no trip, and answers its join code', async () => {
    const crewOnly = {
      crew_id: SEEDED.crew_id,
      scenario: 'crew_with_code',
      created: true,
      inbox_item_ids: [],
      code: 'K7M2QX',
    };
    await local.db.execute('INSERT INTO crews (id, name) VALUES (?, ?)', [
      SEEDED.crew_id,
      'Code Crew',
    ]);
    await expect(seedDemoData(deps(200, crewOnly), 'crew_with_code')).resolves.toEqual({
      crewId: SEEDED.crew_id,
      tripId: null,
      code: 'K7M2QX',
      created: true,
      synced: true,
    });
  });

  it('reports rows that have not synced in time', async () => {
    await expect(seedDemoData(deps(200, SEEDED))).resolves.toMatchObject({ synced: false });
  });

  it('surfaces the api refusal', async () => {
    const refused = { error: { code: 'NOT_FOUND', message: 'Not found', retryable: false } };
    await expect(seedDemoData(deps(404, refused))).rejects.toThrow(
      'seed-demo failed: HTTP 404 NOT_FOUND',
    );
    const noPlaces = {
      error: {
        code: 'STATE_INVALID',
        message: 'State invalid',
        retryable: false,
        detail: { reason: 'no_editorial_places' },
      },
    };
    await expect(seedDemoData(deps(409, noPlaces), 'trip_today')).rejects.toMatchObject({
      status: 409,
      code: 'STATE_INVALID',
      reason: 'no_editorial_places',
    });
  });
});
