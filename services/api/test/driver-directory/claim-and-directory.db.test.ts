/**
 * Drivers our crews used, through the real doors against a migrated Postgres and Redis: a crew rates
 * its driver once the trip ended (verified phones only), invites him with a single-use link bound to
 * his number, nudges once and can cancel; he confirms only with the WhatsApp code sent to that
 * number, after which other crews find him in the directory; every change rotates his key; removing
 * the listing deletes it with its stats and tips in one request, and the directory stops returning
 * him. Only the WhatsApp send is a double (the network boundary).
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDriverDirectory } from '../../src/commands/driver-directory';
import type { ApiCommandDoors } from '../../src/feature-routes';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const PHONE = '+6281234567890';
const keyring = {
  activeKeyId: 'k1',
  keys: dbCrypto.parseFieldEncryptionKeys(`k1:${Buffer.alloc(32, 5).toString('base64')}`),
};
const sent: { phone: string; code: string }[] = [];

let harness: CommandDoorsHarness;
let producer: PgBoss;
let anna: SignedIn;
let ben: SignedIn;
let outsider: SignedIn;
let tripId: string;
let providerId: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  return ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;
}

async function api(path: string, init: RequestInit = {}, who?: SignedIn) {
  const headers = new Headers(init.headers);
  if (who !== undefined) headers.set('cookie', who.cookie);
  const response = await harness.request(path, { ...init, headers });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const claim = (key: string, suffix = '', init: RequestInit = {}) =>
  api(`/v1/public/driver-claims/${key}${suffix}`, init);

const json = (method: string, body: unknown): RequestInit => ({
  method,
  body: JSON.stringify(body),
});

const details = {
  display_name: 'Made Suarta',
  areas: ['Ubud', 'Jatiluwih'],
  languages: ['English', 'Bahasa Indonesia'],
  vehicle_model: 'Toyota Avanza',
  seats: 6,
  day_trips: true,
};

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) =>
      registerDriverDirectory(app, deps as unknown as ApiCommandDoors, {
        keyring,
        pepper: 'test-pepper',
        linkEnv: 'staging',
        otp: {
          send: (phone, code) => {
            sent.push({ phone, code });
            return Promise.resolve();
          },
          fixedCode: () => undefined,
        },
      }),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  // A tip queues its automated check in the same transaction.
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  [anna, ben, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  for (const person of [anna, ben, outsider]) {
    await harness.promoteToRegistered(person.uid);
  }
  // Anna verified her phone; Ben did not.
  await q('INSERT INTO user_private (user_id, phone_hash) VALUES ($1, $2)', [anna.uid, 'anna']);
  const crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Six', $1) RETURNING id", [
    anna.uid,
  ]);
  for (const person of [anna, ben]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      person.uid,
      person === anna ? 'organiser' : 'member',
    ]);
  }
  tripId = await one(
    `INSERT INTO trips (crew_id, status, start_date, end_date)
     VALUES ($1, 'voting', '2026-10-14', '2026-10-18') RETURNING id`,
    [crewId],
  );
  // The status guard only allows the trip's own steps.
  for (const status of [
    'won',
    'setup',
    'drafting',
    'draft_review',
    'proposed',
    'confirmed',
    'pre_trip',
    'in_trip',
  ]) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  providerId = await one(
    `INSERT INTO providers (trip_id, kind, name, contact_enc, vehicle, added_by)
     VALUES ($1, 'driver', 'Made', $2, '{"model":"Toyota Avanza","seats":6}', $3) RETURNING id`,
    [tripId, dbCrypto.encryptField(PHONE, keyring), anna.uid],
  );
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness.stop();
});

describe('drivers our crews used', () => {
  it('opens the rate card only after the trip and only to verified phones', async () => {
    const answer = {
      trip_id: tripId,
      provider_id: providerId,
      verdict: 'loved',
      tags: ['on_time'],
    };
    const early = await runCommand(harness, anna, 'rate_driver', answer);
    expect(JSON.stringify(early.body)).toContain('NOT_ELIGIBLE');

    await q("UPDATE trips SET status = 'post_trip' WHERE id = $1", [tripId]);
    const unverified = await runCommand(harness, ben, 'rate_driver', answer);
    expect(JSON.stringify(unverified.body)).toContain('phone_unverified');

    const rated = await runCommand(harness, anna, 'rate_driver', {
      ...answer,
      tip: 'Ask for the upper car park at Jatiluwih.',
    });
    expect(rated.body.status, JSON.stringify([rated.body, harness.logs.slice(-3)])).toBe('applied');
    const tips = await q<{ status: string }>('SELECT status FROM driver_tips');
    expect(tips).toEqual([{ status: 'pending' }]);
  });

  let key = '';
  let inviteId = '';

  it('invites with a single-use link bound to his number; nudges once; cancel kills it', async () => {
    const first = await runCommand(harness, anna, 'invite_driver', {
      trip_id: tripId,
      provider_id: providerId,
    });
    const firstUrl = String((first.body.result as { url: string }).url);
    expect(firstUrl).toMatch(/^https:\/\/staging\.critterpass\.app\/d\/made-[a-z0-9]+$/);
    const firstInvite = String((first.body.result as { invite_id: string }).invite_id);

    const outsiderNudge = await runCommand(harness, outsider, 'nudge_driver_invite', {
      invite_id: firstInvite,
    });
    expect(JSON.stringify(outsiderNudge.body)).toContain('NOT_FOUND');
    const nudged = await runCommand(harness, ben, 'nudge_driver_invite', {
      invite_id: firstInvite,
    });
    expect(nudged.body.status).toBe('applied');
    const again = await runCommand(harness, ben, 'nudge_driver_invite', { invite_id: firstInvite });
    expect(JSON.stringify(again.body)).toContain('NUDGE_TOO_SOON');

    await runCommand(harness, anna, 'cancel_driver_invite', { invite_id: firstInvite });
    const cancelled = await claim(firstUrl.split('/d/')[1] ?? '');
    expect(cancelled.body.state).toBe('invalid');

    const second = await runCommand(harness, anna, 'invite_driver', {
      trip_id: tripId,
      provider_id: providerId,
    });
    key = String((second.body.result as { url: string }).url).split('/d/')[1] ?? '';
    inviteId = String((second.body.result as { invite_id: string }).invite_id);
    const opened = await claim(key);
    expect(opened.body.state).toBe('invited');
    expect(opened.body.masked_phone).toBe('+62 812 •••• 7890');
    const ours = await api(`/v1/trips/${tripId}/drivers`, {}, ben);
    const driver = (ours.body.drivers as { invite: { status: string } }[])[0];
    expect(driver?.invite.status).toBe('opened');
  });

  it('lists him only after the WhatsApp code to the invited number', async () => {
    const hidden = await api('/v1/driver-directory?area=ubud', {}, outsider);
    expect(hidden.body.drivers).toEqual([]);

    await claim(key, '/otp', { method: 'POST' });
    const code = sent.at(-1);
    expect(code?.phone).toBe(PHONE);
    const wrong = await claim(key, '/confirm', json('POST', { code: '000000', details }));
    expect(wrong.status).toBeGreaterThanOrEqual(400);

    const listed = await claim(
      key,
      '/confirm',
      json('POST', { code: code?.code, details, lang: 'id' }),
    );
    expect(listed.body.state).toBe('listed');
    const listing = await q<{ consent_version: string; status: string }>(
      'SELECT consent_version, status FROM driver_listings',
    );
    expect(listing[0]?.consent_version).toMatch(/:id$/);
    const invite = await q<{ status: string }>('SELECT status FROM driver_invites WHERE id = $1', [
      inviteId,
    ]);
    expect(invite[0]?.status).toBe('claimed');

    const directory = await api('/v1/driver-directory?area=ubud', {}, outsider);
    const cards = directory.body.drivers as { id: string; crews_loved: number }[];
    expect(cards).toHaveLength(1);
    expect(cards[0]?.crews_loved).toBe(1);
    const detail = await api(`/v1/driver-directory/${cards[0]?.id}`, {}, outsider);
    expect(detail.body.phone_e164).toBe(PHONE);

    // The used invite link no longer opens the claim form.
    expect((await claim(key)).body.state).toBe('used');
    key = String(listed.body.next_key);
  });

  it('rotates the key on every change, pauses out of the directory and removes completely', async () => {
    const paused = await claim(key, '/pause', json('POST', { paused: true }));
    expect(paused.body.state).toBe('paused');
    const oldKey = key;
    key = String(paused.body.next_key);
    expect(key).not.toBe(oldKey);
    expect((await claim(oldKey)).body.state).toBe('paused');
    const whilePaused = await api('/v1/driver-directory', {}, outsider);
    expect(whilePaused.body.drivers).toEqual([]);

    const resumed = await claim(key, '/pause', json('POST', { paused: false }));
    key = String(resumed.body.next_key);
    const listingId = (await q<{ id: string }>('SELECT id FROM driver_listings'))[0]?.id;
    await q("UPDATE driver_tips SET status = 'visible'");

    const removed = await claim(key, '/listing', { method: 'DELETE' });
    expect(removed.body.state).toBe('removed');
    expect(await q('SELECT 1 FROM driver_listings')).toHaveLength(0);
    expect(await q('SELECT 1 FROM driver_listing_stats')).toHaveLength(0);
    expect(await q('SELECT 1 FROM driver_tips WHERE listing_id = $1', [listingId])).toHaveLength(0);
    expect(await q('SELECT 1 FROM driver_ratings WHERE listing_id IS NULL')).toHaveLength(1);
    const after = await api('/v1/driver-directory', {}, outsider);
    expect(after.body.drivers).toEqual([]);
    expect((await claim(key)).body.state).toBe('invalid');
    // The crew keeps its driver and his number.
    expect(
      await q('SELECT 1 FROM providers WHERE id = $1 AND contact_enc IS NOT NULL', [providerId]),
    ).toHaveLength(1);
  });
});
