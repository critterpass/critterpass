/**
 * The first run end to end on the server: a pass started online and issued from the offline queue
 * (replayed) is one pass with the reserved number; a crewmate reads its pass, home stamp, taste
 * tags (until they are hidden) and avatar through the RLS the `crew_people` stream mirrors; and a
 * returning user who links into an account that already has a pass keeps exactly that one pass.
 */
import { withSystem, withUser } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createAuthModule, type AuthModule } from '../../src/auth';
import { executeMerge } from '../../src/auth/merge/execute';
import { registerAvatarCommands } from '../../src/commands/avatar';
import { registerOnboardingCommands } from '../../src/commands/onboarding';
import { startJobProducer } from '../../src/jobs/producer';
import { disabledAttestationConfig } from '../auth/test-attestation-config';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let auth: AuthModule;

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerOnboardingCommands(registry);
    registerAvatarCommands(registry);
  });
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  auth = createAuthModule({
    appPool: harness.pool,
    authDatabaseUrl: connectionString,
    redis: harness.redis,
    secret: 'test-secret-at-least-32-characters-long',
    baseUrl: 'http://localhost:8787/api/auth',
    trustedOrigins: ['app.critterpass://'],
    otpAdapters: {},
    attestation: disabledAttestationConfig(),
  });
}, 240_000);

afterAll(async () => {
  await auth.close();
  await producer.stop({ graceful: false });
  await harness.stop();
});

function op(session: SignedIn, cmd: string, payload: unknown, via = 'offline') {
  return envelope(cmd, payload, { actor: { uid: session.uid, via } });
}

async function send(session: SignedIn, ops: unknown[]): Promise<string[]> {
  const response = await harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
  expect(response.status).toBe(200);
  const body = (await response.json()) as { results: { status: string }[] };
  return body.results.map((result) => result.status);
}

async function startPass(session: SignedIn, passId: string): Promise<string> {
  const response = await harness.request('/v1/cmd/start_pass', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(op(session, 'start_pass', { pass_id: passId }, 'app')),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { result: { number: string } }).result.number;
}

function issue(session: SignedIn, passId: string, name: string) {
  return op(session, 'issue_pass', {
    pass_id: passId,
    given_name: name,
    avatar: { kind: 'critter', form_id: 'guide:lundi' },
    taste_answers: [{ q_id: 'food', value: 'left' }],
    home_iata: 'SIN',
  });
}

async function passesOf(uid: string): Promise<{ id: string; number: string }[]> {
  const { rows } = await harness.pool.query<{ id: string; number: string }>(
    'SELECT id, number FROM passes WHERE user_id = $1',
    [uid],
  );
  return rows;
}

/** What `viewer` can read of `subject`'s onboarding rows (the stream filters mirror this RLS). */
async function seenBy(viewer: string, subject: string) {
  return withUser(harness.pool, viewer, 'test', async (tx) => {
    const count = async (sql: string) => (await tx.query(sql, [subject])).rowCount ?? 0;
    return {
      pass: await count("SELECT 1 FROM passes WHERE user_id = $1 AND status = 'issued'"),
      home: await count("SELECT 1 FROM stamps WHERE user_id = $1 AND kind = 'home'"),
      taste: await count('SELECT 1 FROM taste_profiles WHERE user_id = $1'),
      avatar: await count(
        'SELECT 1 FROM avatars a JOIN users u ON u.avatar_id = a.id WHERE u.id = $1',
      ),
    };
  });
}

describe('first run', () => {
  it('issues one pass with the reserved number however often the offline issue replays', async () => {
    const traveller = await harness.signInAnonymously();
    const passId = generateUuidV7();
    const number = await startPass(traveller, passId);
    const queued = issue(traveller, passId, 'Lan');
    expect(await send(traveller, [queued])).toEqual(['applied']);
    expect(await send(traveller, [queued, issue(traveller, passId, 'Lan')])).toEqual([
      'duplicate',
      'applied',
    ]);
    expect(await passesOf(traveller.uid)).toEqual([{ id: passId, number }]);
  });

  it('shows a crewmate the pass, home stamp, taste tags and avatar, and hides hidden tags', async () => {
    const traveller = await harness.signInAnonymously();
    const crewmate = await harness.signInAnonymously();
    const outsider = await harness.signInAnonymously();
    expect(await send(traveller, [issue(traveller, generateUuidV7(), 'Ben')])).toEqual(['applied']);
    await withSystem(harness.pool, async (tx) => {
      const crew = await tx.query<{ id: string }>(
        "INSERT INTO crews (name, created_by) VALUES ('First run', $1) RETURNING id",
        [crewmate.uid],
      );
      await tx.query(
        `INSERT INTO crew_members (crew_id, user_id, role)
         VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
        [crew.rows[0]!.id, crewmate.uid, traveller.uid],
      );
    });

    expect(await seenBy(crewmate.uid, traveller.uid)).toEqual({
      pass: 1,
      home: 1,
      taste: 1,
      avatar: 1,
    });
    expect(await seenBy(outsider.uid, traveller.uid)).toEqual({
      pass: 0,
      home: 0,
      taste: 0,
      avatar: 0,
    });

    await withUser(harness.pool, traveller.uid, 'test', (tx) =>
      tx.query(
        `INSERT INTO user_settings (user_id, hide_taste_tags) VALUES ($1, true)
         ON CONFLICT (user_id) DO UPDATE SET hide_taste_tags = true`,
        [traveller.uid],
      ),
    );
    expect((await seenBy(crewmate.uid, traveller.uid)).taste).toBe(0);
    expect((await seenBy(traveller.uid, traveller.uid)).taste).toBe(1);
  });

  it('keeps the existing pass when a returning user links into their account', async () => {
    const existing = await harness.signInAnonymously();
    const fresh = await harness.signInAnonymously();
    const existingPass = generateUuidV7();
    expect(await send(existing, [issue(existing, existingPass, 'Ada')])).toEqual(['applied']);
    expect(await send(fresh, [issue(fresh, generateUuidV7(), 'Ada')])).toEqual(['applied']);
    const [kept] = await passesOf(existing.uid);

    await executeMerge(fresh.uid, existing.uid, { appPool: harness.pool, auth: auth.auth });

    expect(await passesOf(existing.uid)).toEqual([kept]);
    expect(kept?.id).toBe(existingPass);
    expect(await passesOf(fresh.uid)).toEqual([]);
    const { rows } = await harness.pool.query(
      "SELECT 1 FROM stamps WHERE user_id = $1 AND kind = 'home'",
      [existing.uid],
    );
    expect(rows).toHaveLength(1);
  });
});
