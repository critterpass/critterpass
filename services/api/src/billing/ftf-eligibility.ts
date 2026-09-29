/**
 * First trip free (docs/product-decisions.md §3): when a crew's first trip enters setup with at
 * least two seated members, every member gets Boost on it and Pass+ until its end + 7 days. Once
 * per crew, and once per organiser: the organiser's account, verified phone and attested device
 * are each remembered (hashed) forever, so a second attempt through any of them gets nothing. A
 * seated member set that already had a first trip free in another crew is granted but flagged for
 * ops review.
 */
import { createHash } from 'node:crypto';

import { emitEvent, scheduleEvent } from '@cp/db';
import { BILLING_QUEUES, FTF_MIN_SEATED } from '@cp/domain';
import { ftfEligible } from '@cp/entitlements';
import type pg from 'pg';

import { recomputeTrip, recomputeUser } from '../entitlements';
import { seatedAmong } from './boost-split';

const sha = (value: string) => createHash('sha256').update(value).digest('hex');

export type FtfOutcome =
  | { readonly granted: true; readonly grant_id: string; readonly review: boolean }
  | { readonly granted: false; readonly reason: string };

interface TripRow {
  readonly crew_id: string;
  readonly status: string;
  readonly is_solo: boolean;
  readonly earlier: number;
  readonly organiser_id: string | null;
}

/** The organiser's abuse keys: account, verified phone, attested devices. */
async function abuseKeys(tx: pg.PoolClient, organiserId: string) {
  const keys: { kind: 'account' | 'phone' | 'device'; hash: string }[] = [
    { kind: 'account', hash: sha(`account:${organiserId}`) },
  ];
  const phone = await tx.query<{ phone_hash: string | null }>(
    'SELECT phone_hash FROM user_private WHERE user_id = $1',
    [organiserId],
  );
  const phoneHash = phone.rows[0]?.phone_hash;
  if (phoneHash) keys.push({ kind: 'phone', hash: sha(`phone:${phoneHash}`) });
  const devices = await tx.query<{ key_id: string }>(
    `SELECT a.key_id FROM device_attestations a JOIN devices d ON d.id = a.install_id
      WHERE d.user_id = $1`,
    [organiserId],
  );
  for (const device of devices.rows)
    keys.push({ kind: 'device', hash: sha(`device:${device.key_id}`) });
  return keys;
}

/** Grants the crew's first trip free on `tripId` when it qualifies (idempotent; runs as server). */
export async function grantFirstTripFree(
  tx: pg.PoolClient,
  tripId: string,
  now: Date,
): Promise<FtfOutcome> {
  const { rows } = await tx.query<TripRow>(
    `SELECT t.crew_id, t.status, t.is_solo,
            (SELECT count(*)::int FROM trips e WHERE e.crew_id = t.crew_id AND e.id <> t.id
              AND e.status <> 'cancelled' AND NOT e.is_solo AND e.created_at < t.created_at) AS earlier,
            (SELECT p.user_id FROM trip_participants p WHERE p.trip_id = t.id
              AND p.role = 'organiser' ORDER BY p.created_at LIMIT 1) AS organiser_id
       FROM trips t WHERE t.id = $1 FOR UPDATE OF t`,
    [tripId],
  );
  const trip = rows[0];
  if (trip === undefined) return { granted: false, reason: 'no_trip' };
  await tx.query('SELECT 1 FROM crews WHERE id = $1 FOR UPDATE', [trip.crew_id]);
  const existing = await tx.query('SELECT 1 FROM ftf_grants WHERE crew_id = $1', [trip.crew_id]);
  if ((existing.rowCount ?? 0) > 0) return { granted: false, reason: 'crew_already_had_one' };
  if (trip.status === 'cancelled' || trip.organiser_id === null) {
    return { granted: false, reason: 'not_eligible' };
  }
  if (!ftfEligible({ isSolo: trip.is_solo, earlierCrewTrips: trip.earlier })) {
    return { granted: false, reason: 'not_first_crew_trip' };
  }
  const { rows: people } = await tx.query<{ user_id: string }>(
    "SELECT user_id FROM trip_participants WHERE trip_id = $1 AND rsvp <> 'out'",
    [tripId],
  );
  const seated = await seatedAmong(
    tx,
    tripId,
    people.map((p) => p.user_id),
  );
  if (seated.length < FTF_MIN_SEATED) return { granted: false, reason: 'too_few_seated' };
  const keys = await abuseKeys(tx, trip.organiser_id);
  const used = await tx.query(
    'SELECT 1 FROM ops.ftf_abuse_keys WHERE (kind, key_hash) IN (SELECT * FROM unnest($1::text[], $2::text[]))',
    [keys.map((k) => k.kind), keys.map((k) => k.hash)],
  );
  if ((used.rowCount ?? 0) > 0) return { granted: false, reason: 'organiser_already_had_one' };
  const overlap = sha([...seated].sort().join(','));
  const seen = await tx.query('SELECT 1 FROM ftf_grants WHERE member_overlap_hash = $1', [overlap]);
  const review = (seen.rowCount ?? 0) > 0;
  const { rows: grants } = await tx.query<{ id: string; ends_at: Date }>(
    `INSERT INTO ftf_grants (crew_id, trip_id, organiser_id, starts_at, ends_at,
       member_overlap_hash, abuse_decision)
     VALUES ($1, $2, $3, $4, greatest(app.boost_window_end($2, $4), $4 + interval '1 day'), $5, $6)
     RETURNING id, ends_at`,
    [trip.crew_id, tripId, trip.organiser_id, now, overlap, review ? 'review' : 'allowed'],
  );
  const grant = grants[0];
  if (grant === undefined) throw new Error('ftf grant insert returned no row');
  for (const key of keys) {
    await tx.query(
      'INSERT INTO ops.ftf_abuse_keys (grant_id, kind, key_hash) VALUES ($1, $2, $3)',
      [grant.id, key.kind, key.hash],
    );
  }
  // The window's close recomputes everyone's perks; the boost expiry step knows grants too.
  await scheduleEvent(tx, {
    kind: BILLING_QUEUES.boostExpire,
    refId: grant.id,
    tz: 'UTC',
    at: grant.ends_at,
  });
  await emitEvent(tx, {
    type: 'ftf.granted',
    aggregateKind: 'ftf_grant',
    aggregateId: grant.id,
    actorKind: 'system',
    actorId: null,
    crewId: trip.crew_id,
    tripId,
    payload: { crew_id: trip.crew_id, trip_id: tripId, grant_id: grant.id },
  });
  const clock = { now: () => now };
  await recomputeTrip(tx, tripId, clock);
  for (const uid of seated) await recomputeUser(tx, uid, clock);
  return { granted: true, grant_id: grant.id, review };
}

/** At a first-trip-free window's close: recompute the trip and everyone on it. */
export async function closeFirstTripFree(tx: pg.PoolClient, grantId: string, now: Date) {
  const { rows } = await tx.query<{ trip_id: string; ends_at: Date }>(
    'SELECT trip_id, ends_at FROM ftf_grants WHERE id = $1',
    [grantId],
  );
  const grant = rows[0];
  if (grant === undefined || grant.ends_at > now) return false;
  const clock = { now: () => now };
  await recomputeTrip(tx, grant.trip_id, clock);
  const { rows: people } = await tx.query<{ user_id: string }>(
    'SELECT user_id FROM trip_participants WHERE trip_id = $1',
    [grant.trip_id],
  );
  for (const person of people) await recomputeUser(tx, person.user_id, clock);
  return true;
}
