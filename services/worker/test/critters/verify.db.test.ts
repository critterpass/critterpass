/**
 * `critter.verify` and `reward.fanout` against a migrated Postgres: clean evidence (also with no
 * attestation) becomes a permanent, named entry announced once to the crew; a mock location, a bad
 * device-key signature or a 900 km/h hop with no flight between is revoked and its pending entry
 * removed; a flight landing between makes the same hop fine.
 */
import { createHash, createSign, generateKeyPairSync, type KeyObject } from 'node:crypto';

import { evidenceSigningPayload, MOCK_FLAG_SIMULATED, type EvidenceBundle } from '@cp/domain';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { verifyEncounter } from '../../src/jobs/critters/verify';
import {
  fanOutReward,
  registerRewardHandler,
  resetRewardHandlersForTests,
  type RewardGrant,
} from '../../src/jobs/rewards';
import { cleanEvidence, startCritterWorld, type CritterWorld } from './critters-world';

let world: CritterWorld;
const T0 = new Date('2026-10-03T03:00:00Z');
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

beforeAll(async () => {
  world = await startCritterWorld(3);
}, 240_000);

afterEach(() => resetRewardHandlersForTests());

afterAll(async () => {
  await world?.stop();
});

async function entry(encounterId: string) {
  return world.q<{ verification: string; critter_name: string | null }>(
    'SELECT verification, critter_name FROM collection_entries WHERE encounter_id = $1',
    [encounterId],
  );
}

/** A CBOR map {signature, authenticatorData} as App Attest's generateAssertion returns it. */
function cborAssertion(signature: Buffer, authenticatorData: Buffer): Buffer {
  const text = (s: string) => Buffer.concat([Buffer.from([0x60 + s.length]), Buffer.from(s)]);
  const bytes = (b: Buffer) => Buffer.concat([Buffer.from([0x58, b.length]), b]);
  return Buffer.concat([
    Buffer.from([0xa2]),
    text('signature'),
    bytes(signature),
    text('authenticatorData'),
    bytes(authenticatorData),
  ]);
}

function appAttestSign(privateKey: KeyObject, payload: string): string {
  const authenticatorData = Buffer.alloc(37, 1);
  const clientDataHash = createHash('sha256').update(payload).digest();
  const nonce = createHash('sha256')
    .update(Buffer.concat([authenticatorData, clientDataHash]))
    .digest();
  const signature = createSign('SHA256').update(nonce).sign(privateKey);
  return cborAssertion(signature, authenticatorData).toString('base64');
}

describe('critter.verify', () => {
  it('verifies clean evidence with no attestation and names the entry', async () => {
    const [maya] = world.members as [string];
    const id = await world.befriended({ uid: maya, rule: 'bridge', at: T0 });
    const result = await verifyEncounter(world.harness.pool, id, T0);
    expect(result).toMatchObject({
      outcome: 'verified',
      score: { soft: ['attestation_unavailable'] },
    });
    expect(await entry(id)).toEqual([{ verification: 'verified', critter_name: 'Critter802' }]);
    expect(await world.jobs('reward.fanout')).toHaveLength(1);
    expect(await verifyEncounter(world.harness.pool, id, T0)).toEqual({ outcome: 'skipped' });
  });

  it('revokes a simulated location and removes the pending entry', async () => {
    const [, rin] = world.members as [string, string];
    const id = await world.befriended({
      uid: rin,
      rule: 'bridge',
      at: T0,
      evidence: { mock_flags: MOCK_FLAG_SIMULATED },
    });
    expect(await verifyEncounter(world.harness.pool, id, T0)).toMatchObject({
      outcome: 'revoked',
      score: { hard: ['mock_location'] },
    });
    expect(await entry(id)).toEqual([]);
    const [row] = await world.q<{ verification: string }>(
      'SELECT verification FROM encounters WHERE id = $1',
      [id],
    );
    expect(row?.verification).toBe('revoked');
    const revoked = await world.harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'critter.revoked' AND aggregate_id = $1",
      [id],
    );
    expect(revoked.rowCount).toBe(1);
  });

  it('checks the App Attest signature against the key registered at install', async () => {
    const [, rin] = world.members as [string, string];
    const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    const other = generateKeyPairSync('ec', { namedCurve: 'P-256' });
    await world.q(
      `INSERT INTO device_attestations (install_id, platform, key_id, public_key, verdict)
       VALUES (gen_random_uuid(), 'ios', 'key-rin', $1, 'ok')`,
      [publicKey.export({ type: 'spki', format: 'pem' })],
    );
    const sign = async (key: typeof privateKey, at: Date) => {
      const probe = await world.befriended({ uid: rin, rule: 'bridge', at });
      const [row] = await world.q<{ evidence: EvidenceBundle }>(
        'SELECT evidence FROM encounter_evidence WHERE encounter_id = $1',
        [probe],
      );
      const signature = appAttestSign(
        key,
        evidenceSigningPayload(probe, row?.evidence ?? cleanEvidence(at)),
      );
      await world.q('UPDATE encounter_evidence SET attestation = $2 WHERE encounter_id = $1', [
        probe,
        { status: 'signed', kind: 'app_attest', key_id: 'key-rin', signature },
      ]);
      return probe;
    };
    const forged = await sign(other.privateKey, minutes(5));
    expect(await verifyEncounter(world.harness.pool, forged, minutes(5))).toMatchObject({
      outcome: 'revoked',
      score: { hard: ['bad_signature'] },
    });
    const genuine = await sign(privateKey, minutes(10));
    expect(await verifyEncounter(world.harness.pool, genuine, minutes(10))).toMatchObject({
      outcome: 'verified',
      score: { soft: [] },
    });
  });

  it('revokes a 900 km/h hop, and accepts it when a flight landed in between', async () => {
    const [, , dev] = world.members as [string, string, string];
    const first = await world.befriended({ uid: dev, rule: 'bridge', at: T0 });
    expect((await verifyEncounter(world.harness.pool, first, T0)).outcome).toBe('verified');
    // Da Nang to Hanoi is ~630 km: 42 minutes later is ~900 km/h.
    const hop = await world.befriended({ uid: dev, rule: 'hanoi', at: minutes(42) });
    const revoked = await verifyEncounter(world.harness.pool, hop, minutes(42));
    expect(revoked).toMatchObject({ outcome: 'revoked', score: { hard: ['impossible_speed'] } });
    expect(revoked.score?.hop_kmh).toBeGreaterThan(850);

    await world.q("UPDATE encounters SET verification = 'revoked' WHERE id = $1", [first]);
    const again = await world.befriended({ uid: dev, rule: 'bridge', at: minutes(100) });
    await verifyEncounter(world.harness.pool, again, minutes(100));
    const [booking] = await world.q<{ id: string }>(
      `INSERT INTO bookings (trip_id, owner_id, type, title, visibility, supplier, traveller_ids)
       VALUES ($1, $2, 'flight', 'VN 120 · DAD → HAN', 'personal', 'airline', ARRAY[$2]::uuid[])
       RETURNING id`,
      [world.tripId, dev],
    );
    await world.q(
      `INSERT INTO flight_segments (booking_id, trip_id, owner_id, crew_visible, carrier, flight_no,
         dep_airport, arr_airport, sched_dep_at, sched_arr_at)
       VALUES ($1, $2, $3, true, 'VN', '120', 'DAD', 'HAN', $4, $5)`,
      [booking?.id, world.tripId, dev, minutes(110), minutes(125)],
    );
    const flown = await world.befriended({ uid: dev, rule: 'hanoi', at: minutes(142) });
    expect((await verifyEncounter(world.harness.pool, flown, minutes(142))).outcome).toBe(
      'verified',
    );
  });
});

describe('reward.fanout', () => {
  it('announces a verified find once, to the crew, with first spotter and one grant time', async () => {
    const [maya] = world.members as [string];
    const grants: RewardGrant[] = [];
    registerRewardHandler('probe', (_tx, grant) => {
      grants.push(grant);
      return Promise.resolve();
    });
    // A critter nobody else in the crew has: maya is its first spotter.
    const [row] = await world.q<{ id: string }>(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
         verification)
       VALUES ($1, $2, $3, $4, $5, 'hatch', 'verified') RETURNING id`,
      [maya, world.ids['form_common'], world.ids['critter_801'], T0, world.tripId],
    );
    const job = {
      kind: 'critter_found' as const,
      entry_ids: [row?.id as string],
      granted_at: T0.toISOString(),
    };
    expect(await fanOutReward(world.harness.pool, job)).toEqual({ announced: 1 });
    expect(await fanOutReward(world.harness.pool, job)).toEqual({ announced: 0 });
    expect(grants).toHaveLength(1);
    expect(grants[0]?.grantedAt.toISOString()).toBe(T0.toISOString());
    expect(grants[0]?.entries[0]).toMatchObject({ user_id: maya, xp: 25 });
    const hints = await world.q<{ type: string; data: Record<string, unknown> }>(
      `SELECT payload->>'type' AS type, payload->'data' AS data FROM rt_outbox
        WHERE channel = 'crew_collection:' || $1 ORDER BY id`,
      [world.crewId],
    );
    expect(hints.map((h) => h.type)).toEqual(['critter.befriended', 'first_spotter']);
    expect(JSON.stringify(hints)).not.toMatch(/lat|lng/);
    const counts = await world.q<{ critters: number }>(
      'SELECT critters FROM crew_collection_counts WHERE user_id = $1',
      [maya],
    );
    expect(counts).toEqual([{ critters: 2 }]);
  });
});
