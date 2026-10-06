/**
 * Postcards through the real `/v1/cmd` door against a migrated Postgres: a traveller makes a
 * postcard and only they change or send it; a sent postcard reaches each recipient's inbox
 * fan-out; a printed mailing is Pass+ only, one per trip per payer (a mailing whose every order
 * failed gives it back), goes only to crewmates with a sealed address the printer reaches and asks
 * the rest for one; the printer's callback needs the path token and can only ask for a re-read.
 */
import { randomUUID } from 'node:crypto';

import { crypto as dbCrypto, withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerPostcardCommands } from '../../src/commands/postcards';
import { registerMailingAddressRoute } from '../../src/commands/postcards/address-route';
import { startJobProducer } from '../../src/jobs/producer';
import { createKillSwitches } from '../../src/ops/kill-switches';
import { registerPrintWebhook } from '../../src/routes/webhooks/print';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const keyring = { activeKeyId: 'k1', keys: { k1: Buffer.alloc(32, 9) } };
const TOKEN = 'p'.repeat(40);

let harness: CommandDoorsHarness;
let producer: PgBoss;
let anna: SignedIn;
let ben: SignedIn;
let cleo: SignedIn;
let outsider: SignedIn;
let tripId: string;
let photoId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function jobs(name: string): Promise<unknown[]> {
  const { rows } = await harness.pool.query<{ data: unknown }>(
    'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
    [name],
  );
  return rows.map((row) => row.data);
}

const create = (person: SignedIn, postcardId: string, note = 'Summit at 06:02.') =>
  runCommand(harness, person, 'create_postcard', {
    postcard_id: postcardId,
    trip_id: tripId,
    format: 'classic',
    photo_id: photoId,
    note,
  });

const address = (country: string) => ({
  name: 'Ben Tran',
  line1: '12 Lê Lợi',
  city: 'Đà Nẵng',
  postal_code: '550000',
  country,
});

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) =>
      registerPostcardCommands(registry, {
        switches: { assertOn: (key) => createKillSwitches(harness.pool).assertOn(key) },
        keyring,
      }),
    (app, deps) => {
      registerMailingAddressRoute(app, deps);
      registerPrintWebhook(app, { pool: deps.pool, token: TOKEN });
    },
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  [anna, ben, cleo, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  const [crew] = await q<{ id: string }>(
    "INSERT INTO crews (name, created_by) VALUES ('Postcards', $1) RETURNING id",
    [anna.uid],
  );
  const [trip] = await q<{ id: string }>(
    `INSERT INTO trips (crew_id, status, tz) VALUES ($1, 'active', 'Asia/Ho_Chi_Minh') RETURNING id`,
    [crew!.id],
  );
  tripId = trip!.id;
  for (const [person, role] of [
    [anna, 'organiser'],
    [ben, 'member'],
    [cleo, 'member'],
  ] as const) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crew!.id,
      person.uid,
      role,
    ]);
    await q(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')`,
      [tripId, person.uid, role],
    );
  }
  photoId = randomUUID();
  await q(
    `INSERT INTO photos (id, trip_id, uploader_id, media_key, sha256)
     VALUES ($1, $2, $3, 'u/x/photo/1', repeat('a', 64))`,
    [photoId, tripId, ben.uid],
  );
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

describe('create, edit and send', () => {
  const postcardId = randomUUID();

  it('lets a traveller make a postcard, and nobody else', async () => {
    expect((await create(anna, postcardId)).status).toBe(200);
    expect((await create(outsider, randomUUID())).status).toBe(404);
    expect((await create(anna, randomUUID(), 'x'.repeat(181))).status).toBe(422);
    // Someone else's postcard id is never taken over.
    expect((await create(ben, postcardId)).status).toBe(404);
  });

  it('only the maker edits it', async () => {
    const edit = (person: SignedIn) =>
      runCommand(harness, person, 'edit_postcard', {
        postcard_id: postcardId,
        patch: { format: 'story', note: 'Same time next year?' },
      });
    expect((await edit(ben)).status).toBe(403);
    expect((await edit(anna)).status).toBe(200);
    expect(
      await q('SELECT format, note, version FROM postcards WHERE id = $1', [postcardId]),
    ).toEqual([{ format: 'story', note: 'Same time next year?', version: 2 }]);
  });

  it("reaches each recipient's inbox, and only crewmates", async () => {
    const send = (to: string[]) =>
      runCommand(harness, anna, 'send_postcard', { postcard_id: postcardId, to_uids: to });
    expect((await send([outsider.uid])).status).toBe(422);
    const sent = await send([ben.uid, cleo.uid]);
    expect(sent.body).toMatchObject({ result: { sent_to: [ben.uid, cleo.uid] } });
    const [event] = await q<{ id: string; payload: { to_uids: string[] } }>(
      "SELECT id, payload FROM domain_events WHERE type = 'postcard.sent' AND trip_id = $1",
      [tripId],
    );
    expect(event?.payload.to_uids).toEqual([ben.uid, cleo.uid]);
    expect(await jobs('inbox.fanout')).toContainEqual({ event_id: event?.id });
    const [row] = await q<{ sent: boolean }>(
      'SELECT sent_at IS NOT NULL AS sent FROM postcards WHERE id = $1',
      [postcardId],
    );
    expect(row?.sent).toBe(true);
  });
});

describe('mailing addresses', () => {
  it('are sealed, owner-only, and the caller learns only that one is saved', async () => {
    const save = await runCommand(harness, ben, 'save_mailing_address', {
      fields: address('VN'),
    });
    expect(save.body).toMatchObject({ result: { saved: true } });
    const [row] = await q<{ fields_enc: string; country: string }>(
      'SELECT fields_enc, country FROM mailing_addresses WHERE user_id = $1',
      [ben.uid],
    );
    expect(row?.fields_enc).not.toContain('Lê Lợi');
    expect(JSON.parse(dbCrypto.decryptField(row!.fields_enc, keyring))).toMatchObject({
      line1: '12 Lê Lợi',
    });
    const presence = await harness.request('/v1/me/mailing-address', {
      headers: { cookie: ben.cookie },
    });
    expect(await presence.json()).toEqual({ saved: true, country: 'VN' });
    const other = await harness.request('/v1/me/mailing-address', {
      headers: { cookie: cleo.cookie },
    });
    expect(await other.json()).toEqual({ saved: false, country: null });
  });
});

describe('mail_postcard', () => {
  const postcardId = randomUUID();
  const mail = () => runCommand(harness, anna, 'mail_postcard', { postcard_id: postcardId });

  it('needs Pass+', async () => {
    expect((await create(anna, postcardId)).status).toBe(200);
    const refused = await mail();
    expect(refused.status).toBe(402);
    expect(refused.body).toMatchObject({ error: { code: 'ENTITLEMENT_REQUIRED' } });
  });

  it('mails crewmates with an address, asks the rest, and only once per trip', async () => {
    await q(
      `INSERT INTO user_entitlements (user_id, pass_plus, sources) VALUES ($1, true, '[]')
       ON CONFLICT (user_id) DO UPDATE SET pass_plus = true`,
      [anna.uid],
    );
    await runCommand(harness, cleo, 'save_mailing_address', { fields: address('KP') });
    const first = await mail();
    expect(first.status).toBe(200);
    const result = first.body['result'] as {
      mailing_id: string;
      recipient_ids: string[];
      missing_address_ids: string[];
      unsupported_ids: string[];
    };
    expect(result.recipient_ids).toEqual([ben.uid]);
    expect(result.missing_address_ids).toEqual([anna.uid]);
    expect(result.unsupported_ids).toEqual([cleo.uid]);
    expect(await jobs('postcard.fulfil')).toEqual([{ mailing_id: result.mailing_id }]);
    const [requested] = await q<{ payload: { user_ids: string[] } }>(
      "SELECT payload FROM domain_events WHERE type = 'postcard.address_requested'",
    );
    expect(requested?.payload.user_ids).toEqual([anna.uid]);

    const second = await mail();
    expect(second.body).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'already_mailed' } },
    });

    // Every order failed: the trip's mailing is the payer's to use again.
    await q("UPDATE postcard_mailings SET status = 'failed' WHERE id = $1", [result.mailing_id]);
    expect((await mail()).status).toBe(200);
  });
});

describe('print webhook', () => {
  it('refuses a wrong path token', async () => {
    const response = await harness.request(`/webhooks/print/${'x'.repeat(40)}`, {
      method: 'POST',
      body: JSON.stringify({ subject: 'ord_1' }),
    });
    expect(response.status).toBe(404);
  });

  it('only asks for a re-read: a forged body changes no status', async () => {
    const [mailing] = await q<{ id: string }>(
      `UPDATE postcard_mailings
          SET tracking = jsonb_build_object('orders', jsonb_build_object($2::text,
                jsonb_build_object('ref', 'ord_777', 'status', 'sent', 'updated_at', now())))
        WHERE status = 'queued' AND trip_id = $1 RETURNING id`,
      [tripId, ben.uid],
    );
    const response = await harness.request(`/webhooks/print/${TOKEN}`, {
      method: 'POST',
      body: JSON.stringify({
        subject: 'ord_777',
        data: { order: { id: 'ord_777', status: { stage: 'Complete' } } },
      }),
    });
    expect(response.status).toBe(200);
    expect(await q('SELECT status FROM postcard_mailings WHERE id = $1', [mailing!.id])).toEqual([
      { status: 'queued' },
    ]);
    expect(await jobs('postcard.status')).toEqual([{ mailing_id: mailing!.id }]);
  });
});
