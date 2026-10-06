/**
 * Sharing the plan with a driver on the real stack: a member makes a link, the page answers with
 * the driver's view only, a reply becomes a vote of the crew (never an edit), a later reply
 * replaces it until the first ballot, links and bad forms are refused, the reply limit holds per
 * link, and a revoked link answers switched off on the very next request.
 */
import { randomBytes } from 'node:crypto';

import { withSystem } from '@cp/db';
import type { DriverPlanPage, DriverPlanShare } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerChangesetCommands } from '../../src/commands/changesets';
import { registerDriverPlanShares } from '../../src/commands/driver-plan-shares';
import { REPLY_PER_TOKEN_RULE } from '../../src/routes/public-driver-plans';
import { seedCurrentPlan, tokyo, type SeededPlan } from '../plan/plan-fixture';
import {
  buildSetupCrew,
  errorOf,
  resultOf,
  startSetupHarness,
  type SetupCrew,
  type SetupHarness,
  type SignedIn,
} from '../setup/setup-harness';

let harness: SetupHarness;
let crew: SetupCrew;
let plan: SeededPlan;
let organiser: SignedIn;
let member: SignedIn;

const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };
const tokenOf = (share: DriverPlanShare) => (share.url ?? '').split('/t/')[1] as string;
const page = (token: string) => harness.request(`/v1/public/driver-plans/${token}`);
const reply = (token: string, body: unknown) =>
  harness.request(`/v1/public/driver-plans/${token}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
const share = async (driver: string, days = [1, 2]) =>
  resultOf<DriverPlanShare>(
    await harness.run(member, 'create_driver_plan_share', {
      trip_id: crew.tripId,
      driver_name: driver,
      day_nos: days,
    }),
  );

beforeAll(async () => {
  harness = await startSetupHarness(registerChangesetCommands, (app, deps) =>
    registerDriverPlanShares({
      app,
      doors: deps,
      keyring,
      appEnv: 'staging',
      webProxySecret: undefined,
    }),
  );
  crew = await buildSetupCrew(harness, 3);
  [organiser, member] = crew.members as [SignedIn, SignedIn];
  plan = await seedCurrentPlan(harness.pool, crew.tripId);
  await withSystem(harness.pool, async (tx) => {
    await tx.query(
      `UPDATE plan_items SET custom_place = jsonb_build_object('name', category, 'lat', 35.6, 'lng', 139.7),
              notes = 'Budget cap 900 USD' WHERE version_id = $1`,
      [plan.versionId],
    );
    await tx.query("UPDATE users SET display_name = 'Maya Kusumawardhani' WHERE id = $1", [
      member.uid,
    ]);
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('driver plan shares', () => {
  it('lets only the crew make a link, and keeps one live link per driver', async () => {
    const outsider = await harness.signIn();
    const refused = await harness.run(outsider, 'create_driver_plan_share', {
      trip_id: crew.tripId,
      driver_name: 'Made',
      day_nos: [1],
    });
    expect(errorOf(refused).code).toBe('NOT_FOUND');

    const first = await share('Made');
    const second = await share('Made');
    expect(first.url).toMatch(/^https:\/\/.+\/t\/[A-Za-z0-9_-]{16,}$/);
    expect((await page(tokenOf(first))).status).toBe(410);
    expect((await page(tokenOf(second))).status).toBe(200);

    const list = await harness.request(`/v1/trips/${crew.tripId}/driver-plan-shares`, {
      headers: { cookie: organiser.cookie },
    });
    const { shares } = (await list.json()) as { shares: DriverPlanShare[] };
    expect(shares.filter((s) => s.url !== null).map((s) => s.id)).toEqual([second.id]);
    expect(
      (
        await harness.request(`/v1/trips/${crew.tripId}/driver-plan-shares`, {
          headers: { cookie: outsider.cookie },
        })
      ).status,
    ).toBe(404);
  });

  it('serves the driver view without budgets, notes or last names, uncached, counting opens', async () => {
    const made = await share('Wayan', [1]);
    const response = await page(tokenOf(made));
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    const text = await response.text();
    const body = JSON.parse(text) as DriverPlanPage;
    expect(body.view.sharer_first_name).toBe('Maya');
    expect(body.view.days.map((d) => d.day_no)).toEqual([1]);
    expect(body.view.days[0]?.stops.map((s) => s.name)).toEqual(['walk', 'dinner']);
    for (const leak of [
      'Kusumawardhani',
      'Budget cap',
      'amount_minor',
      'USD',
      'museum',
      member.uid,
    ]) {
      expect(text).not.toContain(leak);
    }
    expect((await page('not-a-real-token-0000')).status).toBe(404);
  });

  it('turns a reply into a crew vote, replaces it until the first ballot, and never edits the plan', async () => {
    const made = await share('Ketut');
    const token = tokenOf(made);
    const date = plan.dates[0] as string;
    const suggestion = (at: string) => ({
      quote: { price_per_day_minor: 700000, currency: 'IDR', includes: ['petrol'] },
      days: [{ day_no: 1, order: [], retime: [{ ref: plan.walk, at }], note: 'Beat the buses.' }],
      tips: [{ text: 'Bring cash for parking.' }],
    });
    expect((await reply(token, { tips: [{ text: 'See www.spam.example.com' }] })).status).toBe(422);
    expect((await reply(token, {})).status).toBe(422);

    const sent = await reply(token, suggestion('08:00'));
    const sentText = await sent.text();
    expect(sent.status, `${sentText} ${harness.logs.slice(-3).join(' ')}`).toBe(200);
    const first = JSON.parse(sentText) as { change_set_id: string; replaced: boolean };
    expect(first.replaced).toBe(false);
    const second = (await (await reply(token, suggestion('07:00'))).json()) as {
      change_set_id: string;
      replaced: boolean;
    };
    expect(second.replaced).toBe(true);

    const { rows: sets } = await harness.pool.query<{
      id: string;
      status: string;
      author_kind: string;
      ops: { target: string; after: { starts_at: string } }[];
    }>(
      `SELECT id, status, author_kind, ops FROM change_sets
        WHERE trip_id = $1 AND trigger = 'driver' AND id = ANY($2::uuid[]) ORDER BY created_at`,
      [crew.tripId, [first.change_set_id, second.change_set_id]],
    );
    expect(sets.map((s) => [s.status, s.author_kind])).toEqual([
      ['rejected', 'provider'],
      ['voting', 'provider'],
    ]);
    expect(sets[1]?.ops[0]).toMatchObject({
      target: plan.walk,
      after: { starts_at: new Date(`${date}T07:00:00+09:00`).toISOString() },
    });
    // The plan itself is untouched until the crew says yes.
    const { rows: items } = await harness.pool.query<{ starts_at: Date }>(
      `SELECT i.starts_at FROM plan_items i JOIN trips t ON t.current_version_id = i.version_id
        WHERE t.id = $1 AND i.stable_id = $2`,
      [crew.tripId, plan.walk],
    );
    expect(items[0]?.starts_at.toISOString()).toBe(tokyo(date, 9));

    // Once a member has voted, the driver cannot swap the reply under them.
    await harness.run(organiser, 'approve_changeset', {
      changeset_id: second.change_set_id,
      decision: 'yes',
    });
    const { rows: after } = await harness.pool.query<{ status: string }>(
      'SELECT status FROM change_sets WHERE id = $1',
      [second.change_set_id],
    );
    if (after[0]?.status === 'voting') {
      expect((await reply(token, suggestion('06:30'))).status).toBe(409);
    }
  });

  it('limits replies per link and switches off at once when revoked', async () => {
    const made = await share('Nyoman');
    const token = tokenOf(made);
    const statuses: number[] = [];
    for (let i = 0; i <= REPLY_PER_TOKEN_RULE.max; i += 1) {
      statuses.push((await reply(token, { tips: [{ text: `Tip ${i}` }] })).status);
    }
    expect(statuses.slice(0, REPLY_PER_TOKEN_RULE.max).every((s) => s === 200)).toBe(true);
    expect(statuses.at(-1)).toBe(429);

    await harness.run(organiser, 'revoke_driver_plan_share', { share_id: made.id });
    const off = await page(token);
    expect(off.status).toBe(410);
    const body = (await off.json()) as {
      error: { code: string; detail: { sharer_first_name: string; reply_at: string | null } };
    };
    expect(body.error.code).toBe('SHARE_REVOKED');
    expect(body.error.detail.sharer_first_name).toBe('Maya');
    expect(body.error.detail.reply_at).not.toBeNull();
    expect(JSON.stringify(body)).not.toContain('walk');
  });
});
