import { describe, expect, it } from 'vitest';

import { demoCrewPlan, seedDemoCrew, seedUuid, type SeedState } from './seed-demo-crew';
import { apiBaseIssue, assertSeedable, supplierModeIssue } from './seed-guard';

const CREW = '0199c0de-0000-7000-8000-00000000c4e3';
const TRIP = '0199c0de-0000-7000-8000-0000000074a9';

/** An api at the network boundary: answers sign-in, health and commands, and keeps what it saw. */
function fakeApi(health: unknown) {
  const applied = new Map<string, { cmd: string; payload: Record<string, unknown> }>();
  let signIns = 0;
  const fetcher = ((url: string, init?: { readonly body?: string }) => {
    const json = (body: unknown, headers: Record<string, string> = {}) =>
      Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers }));
    if (url.endsWith('/health')) return json(health);
    if (url.endsWith('/api/auth/sign-in/anonymous')) {
      signIns += 1;
      const id = seedUuid('fake-api', `user:${String(signIns)}`);
      return json(
        { user: { id } },
        { 'set-cookie': `better-auth.session_token=t${String(signIns)}; Path=/` },
      );
    }
    const body = JSON.parse(init?.body ?? '{}') as {
      op_id: string;
      cmd: string;
      payload: Record<string, unknown>;
    };
    const duplicate = applied.has(body.op_id);
    applied.set(body.op_id, { cmd: body.cmd, payload: body.payload });
    const result = body.cmd === 'accept_invite' ? { crew_id: CREW, trip_id: TRIP } : {};
    return json({ op_id: body.op_id, status: duplicate ? 'duplicate' : 'applied', result });
  }) as unknown as typeof fetch;
  return { fetcher, applied, signIns: () => signIns };
}

describe('demo crew seed guard', () => {
  it('seeds only a local or staging api', () => {
    expect(apiBaseIssue('http://localhost:8787')).toBeUndefined();
    expect(apiBaseIssue('https://api-staging-de92.up.railway.app')).toBeUndefined();
    expect(apiBaseIssue('https://api.staging.critterpass.app')).toBeUndefined();
    expect(apiBaseIssue('https://api.critterpass.app')).toBe(
      'api.critterpass.app is not a staging api',
    );
    expect(apiBaseIssue('https://apistaging.example.com')).toMatch(/not a staging api/u);
    expect(apiBaseIssue('http://api-staging-de92.up.railway.app')).toMatch(/must be https/u);
    expect(apiBaseIssue('staging')).toMatch(/not a url/u);
  });

  it('seeds only when every supplier adapter is sandboxed', () => {
    expect(supplierModeIssue({ suppliers: { viator: 'sandbox', duffel: 'sandbox' } })).toBe(
      undefined,
    );
    expect(supplierModeIssue({ suppliers: { viator: 'sandbox', duffel: 'production' } })).toBe(
      'not in sandbox mode: duffel',
    );
    expect(supplierModeIssue({ status: 'ok' })).toMatch(/does not report/u);
    expect(supplierModeIssue({ suppliers: {} })).toMatch(/no supplier adapters/u);
  });

  it('refuses a production api before it asks it anything', async () => {
    const api = fakeApi({ suppliers: { viator: 'sandbox' } });
    await expect(assertSeedable('https://api.critterpass.app', api.fetcher)).rejects.toThrow(
      /not a staging api/u,
    );
    await expect(
      assertSeedable(
        'http://localhost:8787',
        fakeApi({ suppliers: { viator: 'production' } }).fetcher,
      ),
    ).rejects.toThrow(/not in sandbox mode: viator/u);
    await expect(assertSeedable('http://localhost:8787', api.fetcher)).resolves.toBeUndefined();
  });
});

describe('demo crew seed', () => {
  const options = { seed: 'store', code: 'K7M2QX', currency: 'VND' };

  it('sends the same commands with the same ids on a second run', async () => {
    const api = fakeApi({});
    const client = { baseUrl: 'http://localhost:8787', fetch: api.fetcher };
    const state: SeedState = { travellers: {} };
    const first = await seedDemoCrew(client, options, state);
    const sent = api.applied.size;
    const second = await seedDemoCrew(client, options, state);
    expect(api.signIns()).toBe(first.members.length);
    expect(api.applied.size).toBe(sent);
    expect(second).toEqual(first);
    expect(first.expenses).toBe(demoCrewPlan(options.seed).expenses.length);
  });

  it('splits each expense across the whole demo crew, paid by one of them', async () => {
    const api = fakeApi({});
    const state: SeedState = { travellers: {} };
    const seeded = await seedDemoCrew(
      { baseUrl: 'http://localhost:8787', fetch: api.fetcher },
      options,
      state,
    );
    const uids = seeded.members.map((member) => member.uid).sort();
    const expenses = [...api.applied.values()].filter((sent) => sent.cmd === 'add_expense');
    expect(expenses.length).toBeGreaterThan(0);
    for (const { payload } of expenses) {
      const split = payload['split'] as { mode: string; shares: { user_id: string }[] };
      expect(split.shares.map((share) => share.user_id).sort()).toEqual(uids);
      expect(uids).toContain(payload['payer_uid']);
      expect(payload['trip_id']).toBe(TRIP);
    }
  });

  it('derives ids from the seed name alone', () => {
    expect(seedUuid('store', 'pass:Maya')).toBe(seedUuid('store', 'pass:Maya'));
    expect(seedUuid('store', 'pass:Maya')).not.toBe(seedUuid('other', 'pass:Maya'));
    expect(seedUuid('store', 'pass:Maya')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u,
    );
  });
});
