/**
 * "Add to shortlist" on a listed driver, through the real door against a migrated Postgres: the
 * driver becomes one of the trip's own drivers with his name, car and sealed number copied, so the
 * crew keeps them whatever happens to his listing. Only a signed-in member of the trip's crew can
 * add him, and only while he is listed.
 */
import { crypto as dbCrypto, withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerDriverDirectory } from '../../src/commands/driver-directory';
import type { ApiCommandDoors } from '../../src/feature-routes';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

const PHONE = '+6281234567890';
const VEHICLE = { model: 'Toyota Avanza', seats: 6 };
const keyring = {
  activeKeyId: 'k1',
  keys: dbCrypto.parseFieldEncryptionKeys(`k1:${Buffer.alloc(32, 5).toString('base64')}`),
};
const sealedPhone = dbCrypto.encryptField(PHONE, keyring);

let harness: CommandDoorsHarness;
let organiser: SignedIn;
let member: SignedIn;
let guest: SignedIn;
let outsider: SignedIn;
let tripId: string;
let listed: string;
let paused: string;

async function q<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return withSystem(harness.pool, async (tx) => (await tx.query(sql, params)).rows as T[]);
}

async function one(sql: string, params: unknown[] = []): Promise<string> {
  return ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;
}

async function listing(name: string, status: string): Promise<string> {
  const tag = generateUuidV7();
  return one(
    `INSERT INTO driver_listings (display_name, areas, vehicle, seats, phone_e164_enc, phone_hash,
       status, consent_version, consent_at, key_hash)
     VALUES ($1, '{Ubud}', $2, 6, $3, $4, $5, 'v1', now(), $6) RETURNING id`,
    [name, JSON.stringify(VEHICLE), sealedPhone, `phone-${tag}`, status, `key-${tag}`],
  );
}

const tripDrivers = () =>
  q<Record<string, unknown>>(
    `SELECT id, kind, name, contact_enc, vehicle, added_by FROM providers
      WHERE trip_id = $1 ORDER BY created_at`,
    [tripId],
  );

const shortlist = (who: SignedIn, listingId: string) =>
  runCommand(harness, who, 'shortlist_listed_driver', { trip_id: tripId, listing_id: listingId });

const errorOf = (response: { body: Record<string, unknown> }) =>
  (response.body['error'] as { code?: string; detail?: unknown } | undefined) ?? {};

beforeAll(async () => {
  harness = await startCommandDoors(
    () => undefined,
    (app, deps) =>
      registerDriverDirectory(app, deps as unknown as ApiCommandDoors, {
        keyring,
        pepper: 'test-pepper',
        linkEnv: 'staging',
        otp: null,
      }),
  );
  [organiser, member, guest, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  // The guest is in the crew but never made an account.
  for (const person of [organiser, member, outsider]) {
    await harness.promoteToRegistered(person.uid);
  }
  const crewId = await one("INSERT INTO crews (name, created_by) VALUES ('Six', $1) RETURNING id", [
    organiser.uid,
  ]);
  for (const person of [organiser, member, guest]) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      person.uid,
      person === organiser ? 'organiser' : 'member',
    ]);
  }
  tripId = await one("INSERT INTO trips (crew_id, status) VALUES ($1, 'voting') RETURNING id", [
    crewId,
  ]);
  listed = await listing('Made Suarta', 'listed');
  paused = await listing('Ketut Rai', 'paused');
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('shortlist_listed_driver', () => {
  it('needs an account, and a trip the caller’s crew is on', async () => {
    const asGuest = await shortlist(guest, listed);
    expect(errorOf(asGuest)).toMatchObject({
      code: 'AUTH_REQUIRED',
      detail: { reason: 'registered_only' },
    });
    const asOutsider = await shortlist(outsider, listed);
    expect(asOutsider.status).toBe(404);
    expect(errorOf(asOutsider)).toMatchObject({ code: 'NOT_FOUND', detail: { reason: 'trip' } });
    expect(await tripDrivers()).toEqual([]);
  });

  it('refuses a listing that does not exist or is paused', async () => {
    for (const listingId of [generateUuidV7(), paused]) {
      const refused = await shortlist(member, listingId);
      expect(errorOf(refused)).toMatchObject({
        code: 'NOT_FOUND',
        detail: { reason: 'driver_listing' },
      });
    }
    expect(await tripDrivers()).toEqual([]);
  });

  it('copies his name, car and sealed number into the trip’s own drivers', async () => {
    const added = await shortlist(member, listed);
    expect(added.status, JSON.stringify(added.body)).toBe(200);
    const providerId = (added.body['result'] as { provider_id: string }).provider_id;
    const drivers = await tripDrivers();
    expect(drivers).toEqual([
      {
        id: providerId,
        kind: 'driver',
        name: 'Made Suarta',
        contact_enc: sealedPhone,
        vehicle: VEHICLE,
        added_by: member.uid,
      },
    ]);
    expect(dbCrypto.decryptField(String(drivers[0]!['contact_enc']), keyring)).toBe(PHONE);
  });

  it('keeps the trip’s copy once he pauses his listing, and adds him no more', async () => {
    await q("UPDATE driver_listings SET status = 'paused' WHERE id = $1", [listed]);
    const refused = await shortlist(organiser, listed);
    expect(errorOf(refused)).toMatchObject({
      code: 'NOT_FOUND',
      detail: { reason: 'driver_listing' },
    });
    expect(await tripDrivers()).toMatchObject([{ name: 'Made Suarta', contact_enc: sealedPhone }]);
  });
});
