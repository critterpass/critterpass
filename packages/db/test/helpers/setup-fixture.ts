/**
 * Trip setup rows for the shared permission fixture: the organiser's own calendar source, day,
 * budget max and default, room chips, must-do and consented dietary profile (whose flags derive
 * onto the fixture trip), a private ask to the organiser, and one row of each crew-level setup
 * table on the fixture trip.
 */
import type pg from 'pg';

export interface SetupFixtureInput {
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

export async function seedSetupRows(tx: pg.PoolClient, input: SetupFixtureInput): Promise<void> {
  const { tripId, organiser, member } = input;
  await tx.query(
    `INSERT INTO calendar_sources (user_id, kind, last_sync_at) VALUES ($1, 'device', now())`,
    [organiser],
  );
  await tx.query(
    `INSERT INTO calendar_days (user_id, trip_id, date, state, source)
     VALUES ($1, $2, current_date + 30, 'busy', 'manual')`,
    [organiser, tripId],
  );
  await tx.query(
    `INSERT INTO budget_max_private (trip_id, user_id, amount_minor, currency, amount_trip_minor,
       trip_currency)
     VALUES ($1, $2, 150000, 'USD', 150000, 'USD')`,
    [tripId, organiser],
  );
  await tx.query(
    `INSERT INTO budget_defaults_private (user_id, amount_minor, currency) VALUES ($1, 150000, 'USD')`,
    [organiser],
  );
  await tx.query(
    `INSERT INTO availability_summaries (trip_id, date, free_count, busy_count, unknown_count,
       member_count)
     VALUES ($1, current_date + 30, 1, 1, 1, 3)`,
    [tripId],
  );
  const { rows } = await tx.query<{ id: string }>(
    `INSERT INTO date_window_options (trip_id, position, kind, start_date, end_date, free_count,
       member_count, reason)
     VALUES ($1, 0, 'best', current_date + 30, current_date + 36, 3, 3, 'full_crew') RETURNING id`,
    [tripId],
  );
  await tx.query(
    `INSERT INTO availability_asks (trip_id, target_user_id, requested_by, option_id, block_start,
       block_end, expires_at)
     VALUES ($1, $2, $3, $4, current_date + 30, current_date + 31, now() + interval '48 hours')`,
    [tripId, organiser, member, rows[0]!.id],
  );
  await tx.query(
    `INSERT INTO trip_budget_aggregates (trip_id, currency, maxes_count, member_count)
     VALUES ($1, 'USD', 1, 3)`,
    [tripId],
  );
  await tx.query(
    `INSERT INTO budget_plans (trip_id, target_minor, currency) VALUES ($1, 120000, 'USD')`,
    [tripId],
  );
  await tx.query(
    `INSERT INTO room_plans (trip_id, rooms, currency, nights)
     VALUES ($1, '[{"stay_key":"main","key":"a","capacity":2,"nightly_minor":12000}]', 'USD', 7)`,
    [tripId],
  );
  await tx.query(
    `INSERT INTO room_assignments (trip_id, room_key, user_id, trait_label)
     VALUES ($1, 'a', $2, 'early_risers')`,
    [tripId, organiser],
  );
  await tx.query(
    `INSERT INTO room_prefs (trip_id, user_id, chips) VALUES ($1, $2, '{early_bird}')`,
    [tripId, organiser],
  );
  await tx.query(
    `INSERT INTO must_dos (trip_id, owner_id, title, freeform) VALUES ($1, $2, 'Fushimi Inari', true)`,
    [tripId, organiser],
  );
  await tx.query(
    `INSERT INTO dietary_profiles (user_id, diet, allergies, visibility, consent_at)
     VALUES ($1, 'vegetarian', '{peanuts}', 'crew_flags', now())`,
    [organiser],
  );
}
