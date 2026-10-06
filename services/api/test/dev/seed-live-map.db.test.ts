/**
 * `POST /v1/dev/seed-live-map` on a real database: the caller organises a new crew with a boosted
 * and an unboosted trip in their trip days, sees both through RLS, and a second account brought in
 * with the answered code joins the crew and the boosted trip the way the live map simulator does.
 */
import { withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerInviteCommands } from '../../src/commands/invites';
import { registerOnboardingCommands } from '../../src/commands/onboarding';
import type { SeedLiveMapResult } from '../../src/dev/demo-live-map';
import { registerDevRoutes } from '../../src/dev/routes';
import { testInviteDeps } from '../crews/invite-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
const logger = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => {
      registerOnboardingCommands(registry);
      registerInviteCommands(registry, testInviteDeps);
    },
    (app, deps) => registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function seed(who: SignedIn): Promise<SeedLiveMapResult> {
  const response = await harness.request('/v1/dev/seed-live-map', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: '{}',
  });
  const body = await response.text();
  expect(response.status, body).toBe(200);
  return JSON.parse(body) as SeedLiveMapResult;
}

async function send(who: SignedIn, cmd: string, payload: unknown) {
  const response = await harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(envelope(cmd, payload, { actor: { uid: who.uid, via: 'app' } })),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

function tripsSeenBy(uid: string) {
  return withUser(harness.pool, uid, 'device-1', async (tx) => {
    const { rows } = await tx.query<{ id: string; status: string; live_map: boolean | null }>(
      `SELECT t.id, t.status, e.live_map
         FROM trips t
         JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = $1
         LEFT JOIN trip_entitlements e ON e.trip_id = t.id
        ORDER BY t.created_at`,
      [uid],
    );
    return rows;
  });
}

describe('POST /v1/dev/seed-live-map', { timeout: 60_000 }, () => {
  it('gives the caller a boosted and an unboosted trip that are on, and a live crew code', async () => {
    const caller = await harness.signInAnonymously();
    const seeded = await seed(caller);
    expect(seeded.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(await tripsSeenBy(caller.uid)).toEqual([
      { id: seeded.trip_id, status: 'in_trip', live_map: true },
      { id: seeded.unboosted_trip_id, status: 'in_trip', live_map: false },
    ]);

    // Each call is a fresh crew, so a rerun never inherits the last run's crewmates.
    const again = await seed(caller);
    expect(again.crew_id).not.toBe(seeded.crew_id);
  });

  it('lets a simulated crewmate join with the code and take a seat on the boosted trip', async () => {
    const caller = await harness.signInAnonymously();
    const seeded = await seed(caller);
    const mate = await harness.signInAnonymously();
    const passId = generateUuidV7();
    expect((await send(mate, 'start_pass', { pass_id: passId })).status).toBe(200);
    const issued = await send(mate, 'issue_pass', {
      pass_id: passId,
      given_name: 'Maya Sim',
      avatar: { kind: 'initials' },
      taste_answers: [],
      home_iata: 'SGN',
    });
    expect(issued.status).toBe(200);
    expect((await send(mate, 'accept_invite', { code: seeded.code })).status).toBe(200);
    // The code may already have seated them; join_trip then has nothing left to do.
    await send(mate, 'join_trip', { trip_id: seeded.trip_id });
    expect((await tripsSeenBy(mate.uid)).map((trip) => trip.id)).toContain(seeded.trip_id);
  });
});
