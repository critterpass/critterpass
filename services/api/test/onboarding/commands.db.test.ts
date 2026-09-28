/**
 * The onboarding and avatar commands through the real doors (`/v1/cmd`, `/sync/upload`) against a
 * migrated Postgres, plus `GET /v1/geo/hint` over the recorded MaxMind test database: one pass per
 * user however the issue arrives, the profile written in the same transaction, owned forms only,
 * and photo avatars queued for moderation.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { moderationKind } from '../../src/admin/moderation-intake';
import { registerAvatarCommands } from '../../src/commands/avatar';
import { registerOnboardingCommands } from '../../src/commands/onboarding';
import { startJobProducer } from '../../src/jobs/producer';
import { createR2Client } from '../../src/media/r2';
import { authorizeReads } from '../../src/media/read-access';
import { registerMediaUploadCommand } from '../../src/media/register-media-upload';
import { mediaSigningConfigFromEnv } from '../../src/media/sign';
import { mmdbGeoLookup, registerGeoRoutes } from '../../src/routes/geo';
import { registerMediaRoutes } from '../../src/routes/media';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const GEO_DB = new URL('../fixtures/geo/GeoLite2-City-Test.mmdb', import.meta.url);

let harness: CommandDoorsHarness;
let producer: PgBoss;

beforeAll(async () => {
  const geo = mmdbGeoLookup(readFileSync(GEO_DB));
  harness = await startCommandDoors(
    (registry) => {
      registerOnboardingCommands(registry);
      registerAvatarCommands(registry);
      registry.register(registerMediaUploadCommand);
    },
    (app, deps) => {
      registerGeoRoutes(app, { ...deps, geo: () => geo });
      // Presigning is local signing only: the object store is never called by these tests.
      registerMediaRoutes(app, {
        ...deps,
        r2: createR2Client({
          endpoint: 'https://r2.example.test',
          bucket: 'cp-media-test',
          accessKeyId: 'test-access',
          secretAccessKey: 'test-secret',
        }),
        signing: mediaSigningConfigFromEnv({
          baseUrl: 'https://media.example.test',
          keysJson: JSON.stringify({ k1: 'onboarding-test-hmac-secret-32-chars-long' }),
          activeKeyId: 'k1',
        }),
      });
    },
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
}, 240_000);

afterAll(async () => {
  await producer.stop({ graceful: false });
  await harness.stop();
});

type Body = Record<string, unknown> & {
  result?: Record<string, unknown>;
  error?: { code: string; detail?: Record<string, unknown> };
};

async function cmd(session: SignedIn, name: string, payload: unknown): Promise<[number, Body]> {
  const response = await harness.request(`/v1/cmd/${name}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope(name, payload, { actor: { uid: session.uid, via: 'app' } })),
  });
  return [response.status, (await response.json()) as Body];
}

async function upload(
  session: SignedIn,
  ops: unknown[],
): Promise<{ status: string; code?: string }[]> {
  const response = await harness.request('/sync/upload', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify({ ops }),
  });
  expect(response.status).toBe(200);
  return ((await response.json()) as { results: { status: string; code?: string }[] }).results;
}

function offline(session: SignedIn, name: string, payload: unknown) {
  return envelope(name, payload, { actor: { uid: session.uid, via: 'offline' } });
}

async function rows<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

/** `domain_events` is closed to every service role; the owner connection reads it. */
async function events(type: string, aggregateId: string): Promise<Record<string, unknown>[]> {
  const result = await harness.pool.query<{ payload: Record<string, unknown> }>(
    'SELECT payload FROM domain_events WHERE type = $1 AND aggregate_id = $2',
    [type, aggregateId],
  );
  return result.rows.map((row) => row.payload);
}

const ANSWERS = [
  { q_id: 'food', value: 'left' },
  { q_id: 'pace', value: 'right' },
];

function issuePayload(passId: string, overrides: Record<string, unknown> = {}) {
  return {
    pass_id: passId,
    given_name: '  Mai   Anh ',
    avatar: { kind: 'critter', form_id: 'guide:tokek' },
    taste_answers: ANSWERS,
    home_iata: 'SGN',
    ...overrides,
  };
}

async function crewOf(a: SignedIn, b: SignedIn): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('Onb', $1) RETURNING id",
      [a.uid],
    );
    const crewId = crew.rows[0]!.id;
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'organiser'), ($1, $3, 'member')`,
      [crewId, a.uid, b.uid],
    );
    return crewId;
  });
}

describe('start_pass and issue_pass', () => {
  it('reserves a number once, and an offline issue replayed after it yields one pass', async () => {
    const traveller = await harness.signInAnonymously();
    const [status, started] = await cmd(traveller, 'start_pass', {});
    expect(status).toBe(200);
    const reserved = started.result as { pass_id: string; number: string };
    expect(reserved.number).toMatch(/^CP-\d{4,}$/);
    expect((await cmd(traveller, 'start_pass', {}))[1].result).toEqual(reserved);

    const issue = offline(traveller, 'issue_pass', issuePayload(generateUuidV7()));
    const replay = offline(traveller, 'issue_pass', issuePayload(generateUuidV7()));
    const results = await upload(traveller, [issue, replay, issue]);
    expect(results.map((r) => r.status)).toEqual(['applied', 'applied', 'duplicate']);

    const passes = await rows<{ id: string; number: string; status: string }>(
      'SELECT id, number, status FROM passes WHERE user_id = $1',
      [traveller.uid],
    );
    expect(passes).toEqual([{ id: reserved.pass_id, number: reserved.number, status: 'issued' }]);
    expect(await events('pass.issued', reserved.pass_id)).toEqual([
      { pass_id: reserved.pass_id, user_id: traveller.uid },
    ]);
  });

  it('writes the profile, home stamp, taste profile and avatar with the pass', async () => {
    const traveller = await harness.signInAnonymously();
    const passId = generateUuidV7();
    const [status, body] = await cmd(traveller, 'issue_pass', issuePayload(passId));
    expect(status).toBe(200);
    expect(body.result).toMatchObject({ pass_id: passId });

    const [user] = await rows<Record<string, unknown>>(
      `SELECT u.display_name, u.home_airport, u.home_country, u.home_currency, a.kind, a.form_id
       FROM users u JOIN avatars a ON a.id = u.avatar_id WHERE u.id = $1`,
      [traveller.uid],
    );
    expect(user).toEqual({
      display_name: 'Mai Anh',
      home_airport: 'SGN',
      home_country: 'VN',
      home_currency: 'VND',
      kind: 'critter',
      form_id: 'guide:tokek',
    });
    expect(
      await rows('SELECT kind, seq_no, iata, country FROM stamps WHERE pass_id = $1', [passId]),
    ).toEqual([{ kind: 'home', seq_no: 1, iata: 'SGN', country: 'VN' }]);
    const [taste] = await rows<{ tags: string[]; tag_sources: Record<string, string> }>(
      'SELECT tags, tag_sources FROM taste_profiles WHERE user_id = $1',
      [traveller.uid],
    );
    expect(taste?.tags).toEqual(expect.arrayContaining(['street_food', 'easy_pace']));
    expect(Object.values(taste?.tag_sources ?? {})).toEqual(expect.arrayContaining(['quiz']));
  });

  it('allocates a number for an offline issue that never saw start_pass', async () => {
    const traveller = await harness.signInAnonymously();
    const passId = generateUuidV7();
    expect(
      (await upload(traveller, [offline(traveller, 'issue_pass', issuePayload(passId))]))[0],
    ).toMatchObject({ status: 'applied' });
    const [pass] = await rows<{ id: string; number: string }>(
      'SELECT id, number FROM passes WHERE user_id = $1',
      [traveller.uid],
    );
    expect(pass?.id).toBe(passId);
    expect(pass?.number).toMatch(/^CP-\d{4,}$/);
  });

  it('rejects a blocked name as CONTENT_REJECTED and an unknown airport as VALIDATION', async () => {
    const traveller = await harness.signInAnonymously();
    const [blocked, blockedBody] = await cmd(
      traveller,
      'issue_pass',
      issuePayload(generateUuidV7(), { given_name: 'fuck' }),
    );
    expect([blocked, blockedBody.error?.code]).toEqual([422, 'CONTENT_REJECTED']);
    const [unknown, unknownBody] = await cmd(
      traveller,
      'issue_pass',
      issuePayload(generateUuidV7(), { home_iata: 'ZZZ' }),
    );
    expect([unknown, unknownBody.error?.code]).toEqual([422, 'VALIDATION']);
    expect(await rows('SELECT 1 FROM passes WHERE user_id = $1', [traveller.uid])).toEqual([]);
  });
});

describe('set_taste and set_home_airport', () => {
  it('overwrites the taste profile on a retake and tells the crew', async () => {
    const traveller = await harness.signInAnonymously();
    const crewmate = await harness.signInAnonymously();
    const crewId = await crewOf(traveller, crewmate);
    await cmd(traveller, 'set_taste', { answers: ANSWERS });
    const [, retake] = await cmd(traveller, 'set_taste', {
      answers: [{ q_id: 'food', value: 'right' }],
      source: 'chips',
    });
    expect(retake.result).toEqual({ tags: ['sit_down_dining', 'splurge'] });
    const [taste] = await rows<{ tags: string[]; tag_sources: Record<string, string> }>(
      'SELECT tags, tag_sources FROM taste_profiles WHERE user_id = $1',
      [traveller.uid],
    );
    expect(taste).toEqual({
      tags: ['sit_down_dining', 'splurge'],
      tag_sources: { sit_down_dining: 'chips', splurge: 'chips' },
    });
    expect(await events('profile.taste_changed', traveller.uid)).toHaveLength(2);
    const hints = await rows<{ payload: Record<string, unknown> }>(
      'SELECT payload FROM rt_outbox WHERE channel = $1',
      [`crew:${crewId}`],
    );
    expect(hints.map((h) => h.payload)).toContainEqual({
      type: 'member.updated',
      user_id: traveller.uid,
      fields: ['taste'],
    });
  });

  it('derives home country and currency, re-inks the home stamp and refuses unknown codes', async () => {
    const traveller = await harness.signInAnonymously();
    await cmd(traveller, 'issue_pass', issuePayload(generateUuidV7()));
    const [status, body] = await cmd(traveller, 'set_home_airport', { iata: 'KUL' });
    expect([status, body.result]).toEqual([200, { iata: 'KUL', country: 'MY', currency: 'MYR' }]);
    expect(
      await rows(
        "SELECT s.iata, s.country, u.home_currency FROM stamps s JOIN users u ON u.id = s.user_id WHERE s.user_id = $1 AND s.kind = 'home'",
        [traveller.uid],
      ),
    ).toEqual([{ iata: 'KUL', country: 'MY', home_currency: 'MYR' }]);
    expect(await events('profile.updated', traveller.uid)).toEqual([
      { user_id: traveller.uid, fields: ['home_airport'] },
    ]);
    expect((await cmd(traveller, 'set_home_airport', { iata: 'QQQ' }))[0]).toBe(422);
  });
});

describe('set_avatar', () => {
  it('refuses a critter form the caller does not own', async () => {
    const traveller = await harness.signInAnonymously();
    const [status, body] = await cmd(traveller, 'set_avatar', {
      avatar_id: generateUuidV7(),
      choice: { kind: 'critter', form_id: 'cp-012:epic' },
    });
    expect([status, body.error?.code]).toEqual([403, 'FORBIDDEN']);
  });

  it("refuses someone else's upload", async () => {
    const traveller = await harness.signInAnonymously();
    const other = await harness.signInAnonymously();
    const [status] = await cmd(traveller, 'set_avatar', {
      avatar_id: generateUuidV7(),
      choice: { kind: 'photo', media_key: `u/${other.uid}/avatar/${generateUuidV7()}` },
    });
    expect(status).toBe(403);
  });

  it('keeps a photo pending, queues its moderation once and makes it current', async () => {
    const traveller = await harness.signInAnonymously();
    const avatarId = generateUuidV7();
    const payload = {
      avatar_id: avatarId,
      choice: { kind: 'photo', media_key: `u/${traveller.uid}/avatar/${generateUuidV7()}` },
    };
    const [status, body] = await cmd(traveller, 'set_avatar', payload);
    expect([status, body.result]).toEqual([
      200,
      { avatar_id: avatarId, moderation_status: 'pending' },
    ]);
    await cmd(traveller, 'set_avatar', payload);

    expect(await rows('SELECT avatar_id FROM users WHERE id = $1', [traveller.uid])).toEqual([
      { avatar_id: avatarId },
    ]);
    const jobs = await harness.pool.query<{ data: unknown }>(
      "SELECT data FROM pgboss.job WHERE name = 'avatar.moderate' AND data->>'avatar_id' = $1",
      [avatarId],
    );
    expect(jobs.rows).toEqual([{ data: { avatar_id: avatarId } }]);
    expect(await events('profile.avatar_changed', traveller.uid)).toEqual([
      { user_id: traveller.uid, avatar_id: avatarId, kind: 'photo' },
    ]);
  });

  it('refuses an avatar id another user already holds', async () => {
    const [first, second] = [await harness.signInAnonymously(), await harness.signInAnonymously()];
    const avatarId = generateUuidV7();
    const choice = { kind: 'critter', form_id: 'guide:pon' };
    expect((await cmd(first, 'set_avatar', { avatar_id: avatarId, choice }))[0]).toBe(200);
    const [status, body] = await cmd(second, 'set_avatar', { avatar_id: avatarId, choice });
    expect([status, body.error?.detail?.['reason']]).toEqual([422, 'avatar_id_taken']);
  });
});

describe('GET /v1/geo/hint', () => {
  async function hint(session: SignedIn | undefined, ip?: string): Promise<[number, unknown]> {
    const headers: Record<string, string> = {};
    if (session !== undefined) headers['cookie'] = session.cookie;
    if (ip !== undefined) headers['x-real-ip'] = ip;
    const response = await harness.request('/v1/geo/hint', { headers });
    return [response.status, await response.json()];
  }

  it("answers the caller's city and nearest airports from their IP", async () => {
    const traveller = await harness.signInAnonymously();
    expect(await hint(traveller, '81.2.69.142')).toEqual([
      200,
      {
        country: 'GB',
        city: 'London',
        point: { lat: 51.5, lng: -0.1 },
        nearest_iata: ['LCY', 'LHR', 'LGW'],
      },
    ]);
  });

  it('answers nulls for an address the database does not know', async () => {
    const traveller = await harness.signInAnonymously();
    expect(await hint(traveller, '10.0.0.1')).toEqual([
      200,
      { country: null, city: null, point: null, nearest_iata: [] },
    ]);
  });

  it('needs a session', async () => {
    expect((await hint(undefined, '81.2.69.142'))[0]).toBe(401);
  });
});

describe('avatar uploads', () => {
  const photo = Buffer.from('avatar-bytes');
  function presign(session: SignedIn, device: string, purpose = 'avatar'): Promise<Response> {
    return harness.request('/v1/media/presign', {
      method: 'POST',
      headers: { cookie: session.cookie, 'x-cp-install-id': device },
      body: JSON.stringify({
        purpose,
        content_type: 'image/png',
        bytes: photo.byteLength,
        sha256: createHash('sha256').update(photo).digest('hex'),
      }),
    });
  }

  it('refuses the sixth avatar presign in an hour for an anonymous uid on one device', async () => {
    const traveller = await harness.signInAnonymously();
    for (let i = 0; i < 5; i += 1) expect((await presign(traveller, 'install-1')).status).toBe(200);
    const refused = await presign(traveller, 'install-1');
    expect(refused.status).toBe(429);
    const body = (await refused.json()) as Body;
    expect(body.error?.code).toBe('RATE_LIMITED');
    expect(body.error?.detail?.['retry_after_s']).toBeGreaterThan(0);
    expect((await presign(traveller, 'install-2')).status).toBe(200);
    expect((await presign(traveller, 'install-1', 'photo')).status).toBe(200);
  });
});

describe('avatar review in the ops console', () => {
  async function pendingPhoto(owner: SignedIn): Promise<{ id: string; key: string }> {
    const id = generateUuidV7();
    const key = `u/${owner.uid}/avatar/${generateUuidV7()}`;
    await cmd(owner, 'set_avatar', { avatar_id: id, choice: { kind: 'photo', media_key: key } });
    await withSystem(harness.pool, (tx) =>
      tx.query(
        `INSERT INTO media_objects (owner_id, r2_key, kind, bytes, sha256, purpose)
         VALUES ($1, $2, 'image/jpeg', 10, repeat('a', 64), 'avatar')`,
        [owner.uid, key],
      ),
    );
    return { id, key };
  }

  it('approving releases the photo, queues its variants and opens it to crewmates only', async () => {
    const owner = await harness.signInAnonymously();
    const crewmate = await harness.signInAnonymously();
    const outsider = await harness.signInAnonymously();
    await crewOf(owner, crewmate);
    const { id, key } = await pendingPhoto(owner);
    const kind = moderationKind('avatar');
    expect(kind?.verdicts).toEqual(['approve', 'remove']);

    expect(await authorizeReads(harness.pool, crewmate.uid, [key])).toBe(false);
    await withSystem(harness.pool, (tx) => kind!.approve!(tx, id));
    expect(await rows('SELECT moderation_status FROM avatars WHERE id = $1', [id])).toEqual([
      { moderation_status: 'approved' },
    ]);
    const jobs = await harness.pool.query(
      "SELECT 1 FROM pgboss.job WHERE name = 'avatar.render' AND data->>'avatar_id' = $1",
      [id],
    );
    expect(jobs.rowCount).toBe(1);
    expect(await authorizeReads(harness.pool, crewmate.uid, [key])).toBe(true);
    expect(await authorizeReads(harness.pool, outsider.uid, [key])).toBe(false);
  });

  it('removing rejects the photo, which stays unreadable to the crew', async () => {
    const owner = await harness.signInAnonymously();
    const crewmate = await harness.signInAnonymously();
    await crewOf(owner, crewmate);
    const { id, key } = await pendingPhoto(owner);
    await withSystem(harness.pool, (tx) => moderationKind('avatar')!.apply!(tx, id, 'remove'));
    expect(
      await rows('SELECT moderation_status, moderation_reason FROM avatars WHERE id = $1', [id]),
    ).toEqual([{ moderation_status: 'rejected', moderation_reason: 'ops_review' }]);
    expect(await authorizeReads(harness.pool, crewmate.uid, [key])).toBe(false);
  });
});
