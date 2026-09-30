/**
 * `critter.verify`: server truth for one befriended encounter. Scores the stored evidence (mock
 * flags, device-key signature, speed since the traveller's previous verified find unless a flight
 * of theirs landed between, dwell and accuracy, clock skew and upload delay) with the thresholds in
 * `ops.ops_config` `critters.verify`. Revoked: the pending entry goes and `critter.revoked` tells the
 * app ("This one slipped away"). Verified: the entry becomes permanent with its names and is
 * announced through `reward.fanout` — except a co-presence spawn, which waits for the crew, and an
 * any-of spawn, which waits for its n-th place.
 */
import { appendDomainEvent, sendInTx, withSystem } from '@cp/db';
import {
  attestationClaimSchema,
  CRITTER_QUEUES,
  distanceM,
  evidenceBundleSchema,
  evidenceSigningPayload,
  placesNeeded,
  resolveVerifyConfig,
  scoreEvidence,
  VERIFY_CONFIG_KEY,
  verifyJobSchema,
  type EvidenceScore,
  type LatLng,
  type SpawnKind,
} from '@cp/domain';
import type pg from 'pg';

import { defineJob, type AnyJobDefinition } from '../../boss/define-job';
import { checkEvidenceSignature } from './signature';

interface EncounterRow {
  readonly id: string;
  readonly user_id: string;
  readonly trip_id: string | null;
  readonly spawn_rule_id: string;
  readonly form_id: string;
  readonly poi_id: string | null;
  readonly resolved_at: Date;
  readonly verification: string | null;
  readonly evidence: unknown;
  readonly attestation: unknown;
  readonly skew_ms: string;
  readonly received_at: Date;
  readonly kind: SpawnKind;
  readonly n: number | null;
  readonly dwell_s: number;
  readonly spot: LatLng | null;
}

const SPOT = `coalesce(
  (SELECT json_build_object('lat', p.lat, 'lng', p.lng) FROM pois p WHERE p.id = e.poi_id),
  (SELECT json_build_object('lat', (g->>'lat')::float8, 'lng', (g->>'lng')::float8)
     FROM spawn_rules r2, jsonb_array_elements(r2.geofences) g WHERE r2.id = e.spawn_rule_id LIMIT 1))`;

async function load(tx: pg.PoolClient, id: string): Promise<EncounterRow | undefined> {
  const { rows } = await tx.query<EncounterRow>(
    `SELECT e.id, e.user_id, e.trip_id, e.spawn_rule_id, e.form_id, e.poi_id, e.resolved_at,
            e.verification, v.evidence, v.attestation, v.skew_ms, v.received_at,
            r.kind, r.n, r.dwell_s, ${SPOT} AS spot
       FROM encounters e
       JOIN encounter_evidence v ON v.encounter_id = e.id
       JOIN spawn_rules r ON r.id = e.spawn_rule_id
      WHERE e.id = $1
      FOR UPDATE OF e`,
    [id],
  );
  return rows[0];
}

/** Travel since the previous verified find with a known spot, and whether a flight landed between. */
async function previousHop(tx: pg.PoolClient, row: EncounterRow) {
  if (row.spot === null) return null;
  const { rows } = await tx.query<{ spot: LatLng | null; resolved_at: Date }>(
    `SELECT ${SPOT} AS spot, e.resolved_at FROM encounters e
      WHERE e.user_id = $1 AND e.id <> $2 AND e.verification = 'verified' AND e.resolved_at <= $3
      ORDER BY e.resolved_at DESC LIMIT 1`,
    [row.user_id, row.id, row.resolved_at],
  );
  const prev = rows[0];
  if (prev?.spot === null || prev === undefined) return null;
  const { rows: flights } = await tx.query(
    `SELECT 1 FROM flight_segments s JOIN bookings b ON b.id = s.booking_id
      WHERE (s.owner_id = $1 OR $1 = ANY (b.traveller_ids))
        AND coalesce(s.act_arr_at, s.est_arr_at, s.sched_arr_at) BETWEEN $2 AND $3
      LIMIT 1`,
    [row.user_id, prev.resolved_at, row.resolved_at],
  );
  return {
    distance_m: distanceM(prev.spot, row.spot),
    seconds: (row.resolved_at.getTime() - prev.resolved_at.getTime()) / 1000,
    flightBetween: flights.length > 0,
  };
}

async function score(tx: pg.PoolClient, row: EncounterRow): Promise<EvidenceScore> {
  const config = resolveVerifyConfig(
    (
      await tx.query<{ value: unknown }>('SELECT value FROM ops.ops_config WHERE key = $1', [
        VERIFY_CONFIG_KEY,
      ])
    ).rows[0]?.value,
  );
  const bundle = evidenceBundleSchema.parse(row.evidence);
  const claim = attestationClaimSchema.parse(row.attestation);
  const signature = await checkEvidenceSignature(tx, claim, evidenceSigningPayload(row.id, bundle));
  const captured = Date.parse(bundle.device_ts);
  return scoreEvidence(
    {
      bundle,
      signature,
      dwellTargetS: row.dwell_s,
      skewS: Number(row.skew_ms) / 1000,
      uploadDelayH: Math.max(0, row.received_at.getTime() - captured) / 3_600_000,
      hop: await previousHop(tx, row),
    },
    config,
  );
}

async function revoke(tx: pg.PoolClient, row: EncounterRow, now: Date): Promise<void> {
  await tx.query("UPDATE encounters SET verification = 'revoked', verified_at = $2 WHERE id = $1", [
    row.id,
    now,
  ]);
  await tx.query(
    "DELETE FROM collection_entries WHERE encounter_id = $1 AND verification = 'pending'",
    [row.id],
  );
  if (row.trip_id === null) return;
  await appendDomainEvent(tx, {
    type: 'critter.revoked',
    aggregateKind: 'encounter',
    aggregateId: row.id,
    actorKind: 'system',
    actorId: null,
    tripId: row.trip_id,
    payload: {
      trip_id: row.trip_id,
      user_id: row.user_id,
      encounter_id: row.id,
      form_id: row.form_id,
    },
  });
}

/** Makes the traveller's pending entry for this form permanent, with its names. */
export async function confirmEntry(
  tx: pg.PoolClient,
  userId: string,
  formId: string,
): Promise<string | undefined> {
  const { rows } = await tx.query<{ id: string }>(
    `UPDATE collection_entries c
        SET verification = 'verified',
            critter_name = (SELECT cn.name FROM critter_names cn
                             WHERE cn.critter_id = c.critter_id AND cn.form_id IS NULL
                               AND cn.locale = 'en' LIMIT 1),
            form_name = (SELECT cn.name FROM critter_names cn
                          WHERE cn.form_id = c.form_id AND cn.locale = 'en' LIMIT 1)
      WHERE c.user_id = $1 AND c.form_id = $2 AND c.verification = 'pending'
      RETURNING c.id`,
    [userId, formId],
  );
  return rows[0]?.id;
}

async function placesDone(tx: pg.PoolClient, row: EncounterRow): Promise<number> {
  const { rows } = await tx.query<{ n: number }>(
    `SELECT count(DISTINCT coalesce(poi_id::text, id::text))::int AS n FROM encounters
      WHERE user_id = $1 AND spawn_rule_id = $2 AND verification = 'verified'`,
    [row.user_id, row.spawn_rule_id],
  );
  return rows[0]?.n ?? 0;
}

export type VerifyOutcome = 'verified' | 'revoked' | 'skipped';

export async function verifyEncounter(
  pool: pg.Pool,
  encounterId: string,
  now: Date = new Date(),
): Promise<{ readonly outcome: VerifyOutcome; readonly score?: EvidenceScore }> {
  return withSystem(pool, async (tx) => {
    const row = await load(tx, encounterId);
    if (row?.verification !== 'pending') return { outcome: 'skipped' };
    const result = await score(tx, row);
    await tx.query('UPDATE encounter_evidence SET score = $2 WHERE encounter_id = $1', [
      row.id,
      JSON.stringify(result),
    ]);
    if (result.verdict === 'revoked') {
      await revoke(tx, row, now);
      return { outcome: 'revoked', score: result };
    }
    await tx.query(
      "UPDATE encounters SET verification = 'verified', verified_at = $2 WHERE id = $1",
      [row.id, now],
    );
    if (row.kind === 'co_presence') {
      if (row.trip_id !== null) {
        await sendInTx(
          tx,
          CRITTER_QUEUES.copresence,
          { trip_id: row.trip_id, spawn_rule_id: row.spawn_rule_id },
          { singletonKey: `${row.trip_id}:${row.spawn_rule_id}` },
        );
      }
      return { outcome: 'verified', score: result };
    }
    if ((await placesDone(tx, row)) < placesNeeded(row))
      return { outcome: 'verified', score: result };
    const entryId = await confirmEntry(tx, row.user_id, row.form_id);
    if (entryId !== undefined) {
      await sendInTx(
        tx,
        CRITTER_QUEUES.rewardFanout,
        { kind: 'critter_found', entry_ids: [entryId], granted_at: now.toISOString() },
        { singletonKey: entryId },
      );
    }
    return { outcome: 'verified', score: result };
  });
}

export function verifyJob(): AnyJobDefinition {
  return defineJob({
    queue: CRITTER_QUEUES.verify,
    schema: verifyJobSchema,
    singletonKey: (data) => data.encounter_id,
    async handler(data, { pool }) {
      const result = await verifyEncounter(pool, data.encounter_id);
      return { outcome: result.outcome, hard: result.score?.hard, soft: result.score?.soft };
    },
  });
}
