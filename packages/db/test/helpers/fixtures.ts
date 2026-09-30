/**
 * The comprehensive six-actor permission fixture (docs/system-architecture.md §5 permission
 * contract suite): outsider, ex-member, member, organiser, co-organiser and anonymous, layered
 * with one trip and one crew-visible plan version so every table this phase owns has a real,
 * visible row for packages/db/test/permissions/_matrix.ts to probe. "Anonymous" matches
 * ./actors.ts#anonymousActor: a uid with no backing row anywhere, not an unauthenticated
 * connection — every probe below still runs as the `app_user` role via `withUser`.
 */
import type pg from 'pg';

import { withSystem } from '../../src/tx';
import {
  anonymousActor,
  insertCrew,
  insertCrewMember,
  insertTrip,
  insertTripParticipant,
  insertUser,
  setCrewMemberStatus,
} from './actors';
import { claimOpId, recordCmdResult } from '../../src/events';
import { seedGrowthRows } from './growth-fixture';
import { seedHomeRows } from './home-fixture';
import { seedMoneyRows } from './money-fixture';
import { seedBookingRows } from './bookings-fixture';
import { seedSupplierRows } from './suppliers-fixture';
import { seedBillingRows } from './billing-fixture';
import { seedPollRows } from './poll-fixture';
import { seedGuideChat } from './guide-fixture';
import { seedTripDayRows } from './trip-day-fixture';
import { seedDisruptionRows } from './disruptions-fixture';
import { seedSetupRows } from './setup-fixture';
import {
  insertChangeSet,
  insertItineraryVersion,
  insertPlanDay,
  insertPlanItem,
} from './plan-actors';

export const ACTOR_KINDS = [
  'outsider',
  'exMember',
  'member',
  'organiser',
  'coOrganiser',
  'anonymous',
] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export interface PermissionFixture {
  readonly crewId: string;
  readonly tripId: string;
  readonly versionId: string;
  readonly dayId: string;
  /** Authored by `actors.member` — the natural target for a "does the author own this?" probe. */
  readonly changeSetId: string;
  /** A running `agent_jobs` row the member asked for on the trip. */
  readonly agentJobId: string;
  /** The organiser-only redraft reservation on that job. */
  readonly redraftReservationId: string;
  readonly actors: Readonly<Record<ActorKind, string>>;
}

/**
 * Builds a crew of five real users plus one backing-row-free "anonymous" uid, seats
 * organiser/coOrganiser/member on one trip, and adds one row to every read-all catalogue table
 * (plan version/day/item, change set, activity event, guide action, a member-owned `cmd_results`
 * row, one public `client_config` entry, one `fx_snapshots` row, one trip `price_quotes` row, one trip cost calc) so a table-by-table SELECT sweep
 * always has something real to find or correctly fail to find.
 */
export async function buildPermissionFixture(pool: pg.Pool): Promise<PermissionFixture> {
  const anonymousUid = anonymousActor().uid;

  const built = await withSystem(pool, async (tx) => {
    const organiser = await insertUser(tx);
    const coOrganiser = await insertUser(tx);
    const member = await insertUser(tx);
    const exMember = await insertUser(tx);
    const outsider = await insertUser(tx);

    // Self-owned rows (RLS class O): only their own owner can ever select these, so the fixture
    // needs a real row on the organiser specifically for that probe to mean anything.
    await tx.query('INSERT INTO user_settings (user_id) VALUES ($1)', [organiser]);
    await tx.query("INSERT INTO consents (user_id, purpose) VALUES ($1, 'analytics')", [organiser]);
    await tx.query('INSERT INTO user_private (user_id) VALUES ($1)', [organiser]);
    const organiserDevice = crypto.randomUUID();
    await tx.query(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.0.0', 'en', 'Asia/Singapore')`,
      [organiserDevice, organiser],
    );
    await tx.query(
      `INSERT INTO push_tokens (device_id, kind, token, env) VALUES ($1, 'apns_alert', $2, 'sandbox')`,
      [organiserDevice, `matrix-probe-${organiserDevice}`],
    );
    await tx.query(
      `INSERT INTO device_action_keys (key_id, device_id, user_id, secret_enc, scopes, expires_at)
       VALUES ($1, $2, $3, 'matrix-probe', ARRAY['ballot'], now() + interval '30 days')`,
      [crypto.randomUUID(), organiserDevice, organiser],
    );
    const { rows: notificationRows } = await tx.query<{ id: string }>(
      `INSERT INTO notifications (user_id, key, category, class, sender, template_id, title, body,
         dedupe_key, local_date)
       VALUES ($1, 'matrix_probe', 'cp.generic', 'budgeted', '{"kind":"system"}', 'matrix_probe',
         'Probe', 'Probe', 'matrix-probe', CURRENT_DATE)
       RETURNING id`,
      [organiser],
    );
    await tx.query('INSERT INTO notification_prefs (user_id) VALUES ($1)', [organiser]);
    await tx.query('INSERT INTO ping_ledger (user_id, local_date) VALUES ($1, CURRENT_DATE)', [
      organiser,
    ]);
    await tx.query(
      "INSERT INTO roundups (user_id, local_date, tz) VALUES ($1, CURRENT_DATE, 'Asia/Singapore')",
      [organiser],
    );
    await tx.query(
      "INSERT INTO inbox_items (user_id, kind, notification_id) VALUES ($1, 'matrix_probe', $2)",
      [organiser, notificationRows[0]?.id],
    );
    await tx.query(
      `INSERT INTO scheduled_deliveries (user_id, kind, target_ref, send_at_local, tz, due_at)
       VALUES ($1, 'resend', 'matrix-probe', '2026-09-28T09:00', 'Asia/Singapore', now())`,
      [organiser],
    );
    await tx.query(
      `INSERT INTO account_deletions (user_id, purge_at, source) VALUES ($1, now() + interval '30 days', 'app')`,
      [organiser],
    );

    // Catalogue content (RLS class R, read-all authenticated): the table must not be empty or a
    // probe cannot tell "denied" apart from "table has nothing in it yet".
    const { rows: destinationRows } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name) VALUES ('matrix-probe-destination', 'Matrix Probe')
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
    );
    const matrixProbeDestinationId = destinationRows[0]!.id;
    await tx.query(
      "INSERT INTO guides (slug, name, colour) VALUES ('matrix-probe-guide', 'Matrix Probe', 'yellow') ON CONFLICT (slug) DO NOTHING",
    );
    await tx.query(
      `INSERT INTO fx_snapshots (base, quote, rate, as_of, source)
       VALUES ('EUR', 'SGD', 1.4571, '2026-09-25', 'matrix-probe')
       ON CONFLICT (base, quote, as_of, source) DO NOTHING`,
    );

    // Places catalogue (same RLS class R rule as destinations/guides above).
    const { rows: poiRows } = await tx.query<{ id: string }>(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, 'Matrix Probe POI', 'other', 0, 0)
       RETURNING id`,
      [matrixProbeDestinationId],
    );
    const matrixProbePoiId = poiRows[0]!.id;
    await tx.query('INSERT INTO poi_live_checks (poi_id, is_open_now) VALUES ($1, true)', [
      matrixProbePoiId,
    ]);
    await tx.query(
      `INSERT INTO map_regions (destination_id, pmtiles_key, bytes, version)
       VALUES ($1, 'matrix-probe.pmtiles', 1, 'matrix-probe')`,
      [matrixProbeDestinationId],
    );
    await tx.query(
      "INSERT INTO cities (name, country, lat, lng) VALUES ('Matrix Probe City', 'XX', 0, 0)",
    );

    // Content catalogue (RLS R while the row's release is the published one).
    const { rows: releaseRows } = await tx.query<{ id: string }>(
      `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
         item_count, approved_by, approved_at, published_at)
       VALUES ('forms', 1, 'matrix-probe', 'Matrix probe', 'published', 'publish', repeat('0', 64), '{}',
         0, $1, now(), now()) RETURNING id`,
      [organiser],
    );
    const release = releaseRows[0]!.id;
    const { rows: setRows } = await tx.query<{ id: string }>(
      `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
         hero_critter_key, month_hints, release_id)
       VALUES ('zz', 'Matrix Probe', 'ZZ', 3, 'Asia/Singapore', 'SGD', '{en}', 'guest', 'cp-999', '[]', $1)
       RETURNING id`,
      [release],
    );
    const { rows: critterRows } = await tx.query<{ id: string }>(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ('cp-999', $1, 999, 'Probe City', 'Probe', '{}', 7, 'Probe.', $2) RETURNING id`,
      [setRows[0]!.id, release],
    );
    const { rows: formRows } = await tx.query<{ id: string }>(
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
       VALUES ('cp-999:legendary', $1, 'legendary', '{}', 'legendary', 'Probe.', 'Probe', 150, $2) RETURNING id`,
      [critterRows[0]!.id, release],
    );
    await tx.query(
      `INSERT INTO critter_names (critter_id, locale, name, release_id) VALUES ($1, 'en', 'Probe', $2)`,
      [critterRows[0]!.id, release],
    );
    const { rows: windowRows } = await tx.query<{ id: string }>(
      `INSERT INTO legendary_windows (key, form_id, place_line, rule, months, challenge, release_id)
       VALUES ('matrix-probe', $1, 'Probe', '{"type":"any_day"}', '{1}', 'Probe', $2) RETURNING id`,
      [formRows[0]!.id, release],
    );
    await tx.query(
      `INSERT INTO spawn_rules (key, form_id, kind, set_id, destination_id, window_id, copy, release_id)
       VALUES ('cp-999:legendary#1', $1, 'window', $2, $3, $4, 'Probe', $5)`,
      [formRows[0]!.id, setRows[0]!.id, matrixProbeDestinationId, windowRows[0]!.id, release],
    );
    await tx.query(
      `INSERT INTO phrase_cards (key, language, context, text, gloss, audio_status, release_id)
       VALUES ('en:greetings:hello', 'en', 'greetings', 'Hello', 'Hello', 'pending', $1)`,
      [release],
    );
    await tx.query(
      `INSERT INTO emergency_numbers (country, numbers, source_url, retrieved_on, verified_at, release_id)
       VALUES ('ZZ', '[]', 'https://example.org', '2026-09-28', now(), $1)`,
      [release],
    );
    await tx.query(
      `INSERT INTO facilities (key, destination_id, kind, name, lat, lng, address, source_url, retrieved_on,
         verified_at, release_id)
       VALUES ('matrix-probe', $1, 'pharmacy', 'Probe', 0, 0, 'Probe', 'https://example.org', '2026-09-28', now(), $2)`,
      [matrixProbeDestinationId, release],
    );
    await tx.query(
      `INSERT INTO help_articles (slug, locale, category, title, summary, body_md, release_id)
       VALUES ('matrix-probe', 'en', 'getting_started', 'Probe', 'Probe', 'Probe', $1)`,
      [release],
    );
    await tx.query(
      `INSERT INTO poi_hours_proposals (poi_id, hours, source_url, fetched_at, batch_key)
       VALUES ($1, '{"weekly":{}}', 'https://example.org', now(), 'matrix-probe')`,
      [matrixProbePoiId],
    );

    const crewId = await insertCrew(tx, { createdBy: organiser });
    await insertCrewMember(tx, { crewId, userId: organiser, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: coOrganiser, role: 'organiser' });
    await insertCrewMember(tx, { crewId, userId: member, role: 'member' });
    // A real "used to be a member" row: joins active, then is removed — the same two-step
    // packages/db/test/permissions/crew_members.test.ts uses to prove the epoch/unsubscribe path.
    await insertCrewMember(tx, { crewId, userId: exMember, role: 'member' });
    await setCrewMemberStatus(tx, { crewId, userId: exMember, status: 'removed' });

    await tx.query(
      `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by)
       VALUES ('M4TR9X', 'crew', $1, $1, $2)`,
      [crewId, organiser],
    );
    const tripId = await insertTrip(tx, { crewId, status: 'voting' });
    await insertTripParticipant(tx, { tripId, userId: organiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: coOrganiser, role: 'organiser' });
    await insertTripParticipant(tx, { tripId, userId: member, role: 'member' });
    // A trip-scoped frozen quote (RLS class T): only the trip's crew members may read it.
    await tx.query(
      `INSERT INTO price_quotes (trip_id, kind, origin, destination_id, amount_minor, currency, source, fetched_at, frozen_at)
       VALUES ($1, 'flight', 'SIN', $2, 13900, 'USD', 'travelpayouts', now(), now())`,
      [tripId, matrixProbeDestinationId],
    );
    // The trip's cost calc: a crew-visible component and total, and the organiser's own share.
    await tx.query(
      `INSERT INTO cost_components (trip_id, calc_version, component_key, kind, unit, is_shared, amount_minor, currency, source, seen_at)
       VALUES ($1, 'cv_matrix', 'food', 'food', 'person', false, 1000, 'USD', 'editorial', now())`,
      [tripId],
    );
    await tx.query(
      `INSERT INTO trip_share_totals (trip_id, user_id, total_minor, currency, calc_version)
       VALUES ($1, $2, 1000, 'USD', 'cv_matrix')`,
      [tripId, organiser],
    );
    await tx.query(
      `INSERT INTO share_calcs (trip_id, user_id, version, components, total_minor, currency)
       VALUES ($1, $2, 'cv_matrix', '[]', 1000, 'USD')`,
      [tripId, organiser],
    );
    // The organiser's Help share with one fix, an ETA, and one manual POI visit.
    const { rows: shareRows } = await tx.query<{ id: string }>(
      `INSERT INTO location_shares (trip_id, user_id, reason) VALUES ($1, $2, 'help') RETURNING id`,
      [tripId, organiser],
    );
    await tx.query(
      `INSERT INTO location_fixes (user_id, trip_id, share_id, lat, lng, accuracy_m, at)
       VALUES ($1, $2, $3, 0, 0, 10, now())`,
      [organiser, tripId, shareRows[0]!.id],
    );
    await tx.query(`INSERT INTO member_etas (trip_id, user_id, sharing) VALUES ($1, $2, 'live')`, [
      tripId,
      organiser,
    ]);
    await tx.query(
      `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at)
       VALUES (uuidv7(), $1, $2, $3, 'manual', now())`,
      [organiser, tripId, matrixProbePoiId],
    );
    // The organiser's issued pass with its home stamp, taste profile and guide avatar (all C1:
    // the owner and active crewmates read them).
    const { rows: passRows } = await tx.query<{ id: string }>(
      `INSERT INTO passes (user_id, status, number, issued_at)
       VALUES ($1, 'issued', app.format_pass_number(nextval('pass_number_seq')), now()) RETURNING id`,
      [organiser],
    );
    await tx.query(
      `INSERT INTO stamps (pass_id, user_id, kind, seq_no, iata, country, stamped_at)
       VALUES ($1, $2, 'home', 1, 'SIN', 'SG', now())`,
      [passRows[0]!.id, organiser],
    );
    await tx.query("INSERT INTO taste_profiles (user_id, tags) VALUES ($1, '{SUNRISE}')", [
      organiser,
    ]);
    await tx.query(
      "INSERT INTO avatars (user_id, kind, form_id) VALUES ($1, 'critter', 'guide:tokek')",
      [organiser],
    );

    await seedGrowthRows(tx, { crewId, tripId, organiser, member });
    await seedHomeRows(tx, {
      crewId,
      tripId,
      destinationId: matrixProbeDestinationId,
      organiser,
      member,
    });
    await seedPollRows(tx, {
      crewId,
      tripId,
      destinationId: matrixProbeDestinationId,
      organiser,
      member,
    });
    await seedSetupRows(tx, { tripId, organiser, member });
    await seedMoneyRows(tx, { crewId, tripId, organiser, member });
    await seedBookingRows(tx, { crewId, tripId, organiser, member });
    await seedSupplierRows(tx, { tripId, organiser, member });
    await seedBillingRows(tx, { crewId, tripId, organiser, member });

    const versionId = await insertItineraryVersion(tx, {
      tripId,
      visibility: 'crew',
      status: 'current',
    });
    const dayId = await insertPlanDay(tx, { versionId, tripId, dayNo: 1 });
    await insertPlanItem(tx, { versionId, dayId, tripId, category: 'breakfast' });
    const changeSetId = await insertChangeSet(tx, {
      tripId,
      baseVersionId: versionId,
      authorId: member,
      ops: [],
    });
    // Plan collaboration: the organiser's comment (with the member's +1), personal ops and feed token.
    const { rows: commentRows } = await tx.query<{ id: string }>(
      `INSERT INTO comments (trip_id, anchor_kind, anchor_id, author_id, body)
       VALUES ($1, 'day', '1', $2, 'Matrix probe') RETURNING id`,
      [tripId, organiser],
    );
    await tx.query('INSERT INTO comment_plus_ones (comment_id, user_id) VALUES ($1, $2)', [
      commentRows[0]?.id,
      member,
    ]);
    await tx.query(
      `INSERT INTO personal_plan_ops (trip_id, user_id, base_version_id, ops) VALUES ($1, $2, $3, '[]')`,
      [tripId, organiser, versionId],
    );
    await tx.query(
      `INSERT INTO calendar_feed_tokens (trip_id, user_id, token_hash)
       VALUES ($1, $2, sha256('matrix-probe'::bytea))`,
      [tripId, organiser],
    );

    await tx.query(
      `INSERT INTO activity_events (id, trip_id, crew_id, actor_kind, verb, object_kind, text)
       VALUES (uuidv7(), $1, $2, 'user', 'joined', 'crew_member', 'activity.joined')`,
      [tripId, crewId],
    );
    await tx.query("INSERT INTO guide_actions (trip_id, kind) VALUES ($1, 'suggest_restaurant')", [
      tripId,
    ]);
    await tx.query(
      `INSERT INTO ops.ops_config (key, value, is_public) VALUES ('matrix.probe', '1'::jsonb, true)
       ON CONFLICT (key) DO UPDATE SET is_public = true`,
    );
    await tx.query(
      `INSERT INTO products (key, type, grants) VALUES ('boost_trip', 'consumable', '[]'::jsonb)
       ON CONFLICT (key) DO NOTHING`,
    );
    await tx.query(
      `INSERT INTO perks (key, tier, copy_key) VALUES ('boost_live_map', 'boost', 'monetize.perks.boost_live_map')
       ON CONFLICT (key) DO NOTHING`,
    );

    // Materialised-only tables (RLS class O/T): one real row each so a select probe has something
    // to find or correctly fail to find, matching how every other catalogue row above is seeded.
    await tx.query(
      `INSERT INTO user_entitlements (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [organiser],
    );
    await tx.query(
      `INSERT INTO trip_entitlements (trip_id) VALUES ($1) ON CONFLICT (trip_id) DO NOTHING`,
      [tripId],
    );

    // AI tables: a job the member asked for on this trip, an open guide offer the member claimed,
    // and one approved persona pack (no app_user grant at all, so every actor must still see nothing).
    const { rows: jobRows } = await tx.query<{ id: string }>(
      "INSERT INTO agent_jobs (trip_id, user_id, kind, status) VALUES ($1, $2, 'draft', 'running') RETURNING id",
      [tripId, member],
    );
    const agentJobId = jobRows[0]!.id;
    // A redraft reservation on the trip: organiser-only, like the drafts it meters.
    const { rows: reservationRows } = await tx.query<{ id: string }>(
      'INSERT INTO redraft_reservations (trip_id, agent_job_id) VALUES ($1, $2) RETURNING id',
      [tripId, agentJobId],
    );
    const redraftReservationId = reservationRows[0]!.id;
    const { rows: offerRows } = await tx.query<{ id: string }>(
      "INSERT INTO guide_offers (trip_id, kind, slots_total) VALUES ($1, 'join_activity', 3) RETURNING id",
      [tripId],
    );
    await tx.query(
      'INSERT INTO guide_offer_claims (offer_id, trip_id, user_id) VALUES ($1, $2, $3)',
      [offerRows[0]!.id, tripId, member],
    );
    await tx.query(
      `INSERT INTO persona_packs (guide_id, version, status, approved_at)
       SELECT id, 'matrix-probe', 'approved', now() FROM guides WHERE slug = 'matrix-probe-guide'
       ON CONFLICT (guide_id, version) DO NOTHING`,
    );
    await seedGuideChat(tx, { tripId, crewId, organiser });
    await seedTripDayRows(tx, { tripId, organiser, member });
    await seedDisruptionRows(tx, { tripId, organiser });

    const opId = crypto.randomUUID();
    await claimOpId(tx, { opId, uid: member, cmd: 'matrix_probe', payloadHash: 'h' });
    await recordCmdResult(tx, { opId, uid: member, cmd: 'matrix_probe', status: 'applied' });

    return {
      crewId,
      tripId,
      versionId,
      dayId,
      changeSetId,
      agentJobId,
      redraftReservationId,
      organiser,
      coOrganiser,
      member,
      exMember,
      outsider,
    };
  });

  // usage_counters has no app_system (or app_user) write grant at all — only app.consume_quota/
  // app.release_quota may touch it (packages/db/test/permissions/usage_counters.test.ts) — so this
  // one row is seeded as app_owner directly (the raw pool connection, which bypasses RLS), not
  // through withSystem.
  await pool.query(
    `INSERT INTO usage_counters (subject_kind, subject_id, metric, period_key, limit_at_time, reset_at)
     VALUES ('trip', $1, 'redrafts', 'matrix-probe', 3, now() + interval '1 day')
     ON CONFLICT (subject_kind, subject_id, metric, period_key) DO NOTHING`,
    [built.tripId],
  );

  return {
    crewId: built.crewId,
    tripId: built.tripId,
    versionId: built.versionId,
    dayId: built.dayId,
    changeSetId: built.changeSetId,
    agentJobId: built.agentJobId,
    redraftReservationId: built.redraftReservationId,
    actors: {
      outsider: built.outsider,
      exMember: built.exMember,
      member: built.member,
      organiser: built.organiser,
      coOrganiser: built.coOrganiser,
      anonymous: anonymousUid,
    },
  };
}
