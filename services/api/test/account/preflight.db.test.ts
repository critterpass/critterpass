/**
 * The delete-account preflight against a migrated Postgres and a real Better Auth instance: the
 * page shows the balances the close will snapshot, who takes over each trip the caller organises,
 * the store that still bills them, and whether there is any way back in.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { startAccountHarness, type AccountHarness } from './account-harness';

let h: AccountHarness;

beforeAll(async () => {
  h = await startAccountHarness();
}, 240_000);

afterAll(async () => {
  await h.stop();
});

async function one(sql: string, params: unknown[]): Promise<string> {
  const rows = await h.rows<{ id: string }>(sql, params);
  return rows[0]?.id ?? '';
}

describe('GET /v1/me/deletion/preflight', () => {
  it('shows what is owed both ways, the trip hand-over and the store that bills', async () => {
    const me = await h.registered('+6592100001');
    const friend = await h.registered('+6592100002');
    await h.cmd(friend, 'update_profile', { name: 'Maya' });
    const bali = await one(
      "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
      [me.uid],
    );
    const uni = await one(
      "INSERT INTO crews (name, created_by) VALUES ('Uni housemates', $1) RETURNING id",
      [me.uid],
    );
    await h.rows(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $3, 'organiser'), ($1, $4, 'member'), ($2, $3, 'organiser'), ($2, $4, 'member')`,
      [bali, uni, me.uid, friend.uid],
    );
    const trip = await one(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
      [bali],
    );
    await h.rows(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in')`,
      [trip, me.uid, friend.uid],
    );
    // The Bali Six owe me 186.40 SGD; I owe the housemates 50 000 VND.
    await h.rows(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor,
         currency, source_kind, source_id)
       VALUES ($1, $2, $3, $4, 18640, 'SGD', 'expense', gen_random_uuid()),
              ($5, NULL, $4, $3, 50000, 'VND', 'expense', gen_random_uuid())`,
      [bali, trip, friend.uid, me.uid, uni],
    );
    await h.rows(
      `INSERT INTO subscriptions (user_id, platform, product_key, status, period_end)
       VALUES ($1, 'app_store', 'pass_yearly', 'active', now() + interval '200 days')`,
      [me.uid],
    );

    const [code, body] = await h.get(me, '/v1/me/deletion/preflight');

    expect(code).toBe(200);
    expect(body).toMatchObject({
      instant: false,
      critters: 0,
      active_trip: null,
      subscription: { source: 'app_store' },
      organised_trips: [{ trip_id: trip, transfer_to_name: 'Maya', sole_member: false }],
    });
    expect(body['balances']).toEqual([
      { crew_id: bali, crew_name: 'The Bali Six', currency: 'SGD', net_minor: 18640 },
      { crew_id: uni, crew_name: 'Uni housemates', currency: 'VND', net_minor: -50000 },
    ]);
  });

  it('marks an anonymous pass as instant, with nothing billed and nothing owed', async () => {
    const guest = await h.anonymous();
    const [code, body] = await h.get(guest, '/v1/me/deletion/preflight');
    expect(code).toBe(200);
    expect(body).toMatchObject({
      instant: true,
      balances: [],
      organised_trips: [],
      subscription: null,
    });
  });

  it('needs a session', async () => {
    const [code, body] = await h.get({ cookie: '', uid: '' }, '/v1/me/deletion/preflight');
    expect(code).toBe(401);
    expect(body.error?.code).toBe('AUTH_REQUIRED');
  });
});
