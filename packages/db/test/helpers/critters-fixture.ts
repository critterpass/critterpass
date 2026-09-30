import type pg from 'pg';

/**
 * Critter rows on the fixture trip, using the fixture's probe form and spawn rule: the organiser's
 * and the member's eggs (the member's hatched), the organiser's befriended encounter with its
 * evidence and one sample, a verified collection entry (which fills the organiser's crew counts
 * through the trigger) and a guide skin.
 */
export async function seedCritterRows(
  tx: pg.PoolClient,
  f: { tripId: string; organiser: string; member: string },
): Promise<void> {
  const { rows } = await tx.query<{ form_id: string; critter_id: string; rule_id: string }>(
    `SELECT f.id AS form_id, f.critter_id, r.id AS rule_id
       FROM critter_forms f JOIN spawn_rules r ON r.form_id = f.id
      WHERE f.key = 'cp-999:legendary'`,
  );
  const probe = rows[0]!;
  await tx.query(
    `INSERT INTO eggs (user_id, trip_id, form_id, hatched_at, trigger)
     VALUES ($1, $3, $4, NULL, NULL), ($2, $3, $4, now(), 'landed')`,
    [f.organiser, f.member, f.tripId, probe.form_id],
  );
  const encounterId = '01920000-0000-7000-8000-00000000c0de';
  await tx.query(
    `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, state, dwell_s,
       started_at, ready_at, resolved_at, verification, verified_at)
     VALUES ($1, $2, $3, $4, $5, 'befriended', 300, now() - interval '6 minutes',
       now() - interval '1 minute', now(), 'verified', now())`,
    [encounterId, f.organiser, f.tripId, probe.rule_id, probe.form_id],
  );
  await tx.query(
    `INSERT INTO encounter_evidence (encounter_id, user_id, evidence, attestation)
     VALUES ($1, $2, '{"mock_flags": 0}', '{"status": "unavailable"}')`,
    [encounterId, f.organiser],
  );
  await tx.query(
    `INSERT INTO encounter_samples (encounter_id, user_id, at, distance_band, accuracy_m, speed_mps)
     VALUES ($1, $2, now(), '0_10', 8, 0.4)`,
    [encounterId, f.organiser],
  );
  await tx.query(
    `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
       encounter_id, verification, critter_name)
     VALUES ($1, $2, $3, now(), $4, 'encounter', $5, 'verified', 'Probe')`,
    [f.organiser, probe.form_id, probe.critter_id, f.tripId, encounterId],
  );
  await tx.query(
    `INSERT INTO guide_skins (user_id, guide_id, form_id)
     SELECT $1, id, $2 FROM guides WHERE slug = 'matrix-probe-guide'`,
    [f.organiser, probe.form_id],
  );
}
