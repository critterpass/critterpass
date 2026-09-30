/**
 * The actor × table × op permission matrix (docs/system-architecture.md §5 permission contract
 * suite). `TABLE_MATRIX` is the single declared source of truth for what each of the six fixture
 * actors (packages/db/test/helpers/fixtures.ts) may `select`/`insert`/`update` on every RLS-enabled
 * `public`-schema table; `delete` is omitted because no migration in this phase grants `app_user`
 * DELETE on anything (verified by `_matrix.test.ts`'s grant-catalog check, not per-row probing).
 *
 * `select` is proven live, table by table, against one shared fixture (read-only, so one fixture
 * safely serves every table). `insert`/`update` are hand-derived from the same RLS policies the
 * per-table files under packages/db/test/permissions/ already prove piecemeal (crews, crew_members,
 * trips, trip_participants, itinerary_versions, plan_days, plan_items, change_sets), and
 * `_matrix.test.ts` spot-checks one live probe per distinct policy shape (self-only, any active
 * crew member, organiser-only, trip-participant self-insert, system-only/no grant) rather than
 * re-running all 21 tables' writes, since that would just re-prove what those files already do.
 *
 * Each table's `select` probe targets one fixed row (documented per entry): usually the
 * organiser's own row, so the matrix reads as "can this actor see what the organiser can".
 */
import type pg from 'pg';

import { withUser } from '../../src/tx';
import type { ActorKind, PermissionFixture } from '../helpers/fixtures';

export interface TableOpExpectation {
  readonly select: boolean;
  readonly insert: boolean;
  readonly update: boolean;
}

export interface SelectProbe {
  readonly sql: string;
  readonly params: (fixture: PermissionFixture) => readonly unknown[];
}

export interface TableMatrixEntry {
  readonly expectations: Readonly<Record<ActorKind, TableOpExpectation>>;
  readonly selectProbe: SelectProbe;
}

function op(select: boolean, insert: boolean, update: boolean): TableOpExpectation {
  return { select, insert, update };
}

const F = op(false, false, false);

/** RLS class O, user-written: anyone may insert their own row; only the organiser's is probed. */
const SELF_ONLY: Readonly<Record<ActorKind, TableOpExpectation>> = {
  outsider: op(false, true, false),
  exMember: op(false, true, false),
  anonymous: op(false, true, false),
  member: op(false, true, false),
  coOrganiser: op(false, true, false),
  organiser: op(true, true, true),
};

/** RLS class O, system-written: the owner may read its own row and nothing else. */
const OWNER_READ: Readonly<Record<ActorKind, TableOpExpectation>> = {
  outsider: F,
  exMember: F,
  anonymous: F,
  member: F,
  coOrganiser: F,
  organiser: op(true, false, false),
};

/** RLS class S: no app_user grant at all; nobody reads or writes through the request role. */
const SYSTEM_ONLY: Readonly<Record<ActorKind, TableOpExpectation>> = {
  outsider: F,
  exMember: F,
  anonymous: F,
  member: F,
  coOrganiser: F,
  organiser: F,
};

/** RLS class R, system-written: every authenticated actor reads, nobody writes. */
const READ_ONLY_ALL: Readonly<Record<ActorKind, TableOpExpectation>> = {
  outsider: op(true, false, false),
  exMember: op(true, false, false),
  anonymous: op(true, false, false),
  member: op(true, false, false),
  coOrganiser: op(true, false, false),
  organiser: op(true, false, false),
};

/** RLS "read shares-crew": the owner and active crewmates read, nobody writes directly. */
const CREW_VISIBLE_READ: Readonly<Record<ActorKind, TableOpExpectation>> = {
  outsider: F,
  exMember: F,
  anonymous: F,
  member: op(true, false, false),
  coOrganiser: op(true, false, false),
  organiser: op(true, false, false),
};

/** Crew-visible read, owner insert (and update where the policy allows it). */
function crewVisibleOwnerWrite(update: boolean): Readonly<Record<ActorKind, TableOpExpectation>> {
  return {
    outsider: op(false, true, false),
    exMember: op(false, true, false),
    anonymous: op(false, true, false),
    member: op(true, true, false),
    coOrganiser: op(true, true, false),
    organiser: op(true, true, update),
  };
}

function ownRowProbe(table: string): SelectProbe {
  return { sql: `SELECT 1 FROM ${table} WHERE user_id = $1`, params: (f) => [f.actors.organiser] };
}

export const TABLE_MATRIX: Readonly<Record<string, TableMatrixEntry>> = {
  passes: { selectProbe: ownRowProbe('passes'), expectations: CREW_VISIBLE_READ },
  stamps: { selectProbe: ownRowProbe('stamps'), expectations: CREW_VISIBLE_READ },
  taste_profiles: {
    selectProbe: ownRowProbe('taste_profiles'),
    expectations: crewVisibleOwnerWrite(true),
  },
  avatars: { selectProbe: ownRowProbe('avatars'), expectations: crewVisibleOwnerWrite(false) },
  users: {
    selectProbe: { sql: 'SELECT 1 FROM users WHERE id = $1', params: (f) => [f.actors.organiser] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, true),
    },
  },
  user_settings: {
    selectProbe: {
      sql: 'SELECT 1 FROM user_settings WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  consents: {
    selectProbe: {
      sql: 'SELECT 1 FROM consents WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  media_objects: {
    selectProbe: {
      sql: 'SELECT 1 FROM media_objects WHERE owner_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  crews: {
    selectProbe: { sql: 'SELECT 1 FROM crews WHERE id = $1', params: (f) => [f.crewId] },
    expectations: {
      outsider: op(false, true, false),
      exMember: F,
      anonymous: op(false, true, false),
      member: op(true, false, true),
      coOrganiser: op(true, false, true),
      organiser: op(true, false, true),
    },
  },
  crew_members: {
    selectProbe: {
      sql: 'SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2',
      params: (f) => [f.crewId, f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(true, true, false),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  rt_outbox: {
    selectProbe: {
      sql: "SELECT 1 FROM rt_outbox WHERE channel LIKE 'crew:%' LIMIT 1",
      params: () => [],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  destinations: {
    selectProbe: { sql: 'SELECT 1 FROM destinations LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  guides: {
    selectProbe: { sql: 'SELECT 1 FROM guides LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  trips: {
    selectProbe: { sql: 'SELECT 1 FROM trips WHERE id = $1', params: (f) => [f.tripId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  trip_participants: {
    selectProbe: {
      sql: 'SELECT 1 FROM trip_participants WHERE trip_id = $1 AND user_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(true, true, false),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  itinerary_versions: {
    selectProbe: {
      sql: 'SELECT 1 FROM itinerary_versions WHERE id = $1',
      params: (f) => [f.versionId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  plan_days: {
    selectProbe: { sql: 'SELECT 1 FROM plan_days WHERE id = $1', params: (f) => [f.dayId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  plan_items: {
    selectProbe: { sql: 'SELECT 1 FROM plan_items WHERE day_id = $1', params: (f) => [f.dayId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  change_sets: {
    selectProbe: { sql: 'SELECT 1 FROM change_sets WHERE id = $1', params: (f) => [f.changeSetId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, true),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  guide_actions: {
    selectProbe: {
      sql: 'SELECT 1 FROM guide_actions WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  cmd_log: {
    selectProbe: { sql: 'SELECT 1 FROM cmd_log LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  cmd_results: {
    // Self-only (RLS class O): the member's own row, not the organiser's — the one table where
    // "member" alone is true and "organiser" is false, on purpose.
    selectProbe: {
      sql: 'SELECT 1 FROM cmd_results WHERE uid = $1 AND cmd = $2',
      params: (f) => [f.actors.member, 'matrix_probe'],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      coOrganiser: F,
      organiser: F,
      member: op(true, false, false),
    },
  },
  domain_events: {
    selectProbe: { sql: 'SELECT 1 FROM domain_events LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  activity_events: {
    selectProbe: {
      sql: 'SELECT 1 FROM activity_events WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  fx_snapshots: {
    selectProbe: { sql: 'SELECT 1 FROM fx_snapshots LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  price_quotes: {
    selectProbe: {
      sql: 'SELECT 1 FROM price_quotes WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Cost tables (RLS "T", system-written): the crew reads components and totals; a member's own
  // share calc (lines and personal option deltas) is readable by that member only.
  ...Object.fromEntries(
    ['cost_components', 'trip_share_totals'].map((table) => [
      table,
      {
        selectProbe: {
          sql: `SELECT 1 FROM ${table} WHERE trip_id = $1`,
          params: (f) => [f.tripId],
        },
        expectations: {
          outsider: F,
          exMember: F,
          anonymous: F,
          member: op(true, false, false),
          coOrganiser: op(true, false, false),
          organiser: op(true, false, false),
        },
      },
    ]),
  ),
  share_calcs: {
    selectProbe: {
      sql: 'SELECT 1 FROM share_calcs WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: OWNER_READ,
  },
  // Location (RLS T for shares and ETAs; fixes have no app_user SELECT at all; visits owner-only).
  location_shares: {
    selectProbe: {
      sql: 'SELECT 1 FROM location_shares WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, true),
    },
  },
  location_fixes: {
    selectProbe: { sql: 'SELECT 1 FROM location_fixes LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: op(false, true, false),
    },
  },
  member_etas: {
    selectProbe: {
      sql: 'SELECT 1 FROM member_etas WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Behind the crew-map gate: the fixture trip is neither boosted nor in its trip days, so no
  // actor reads or writes (the open-gate cases live in ./meetups.test.ts).
  meetups: {
    selectProbe: { sql: 'SELECT 1 FROM meetups LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  visits: {
    selectProbe: {
      sql: 'SELECT 1 FROM visits WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  destination_cost_indices: {
    selectProbe: { sql: 'SELECT count(*) FROM destination_cost_indices', params: () => [] },
    expectations: READ_ONLY_ALL,
  },
  // Travel-data catalogue tables (RLS "R", system-written): the probe proves the app_user grant;
  // each table's own file under this directory proves its rows and filters.
  ...Object.fromEntries(
    [
      'fare_cells',
      'weather_snapshots',
      'crowd_forecasts',
      'season_months',
      'season_events',
      'hazard_alerts',
    ].map((table) => [
      table,
      {
        selectProbe: { sql: `SELECT count(*) FROM ${table}`, params: () => [] },
        expectations: READ_ONLY_ALL,
      },
    ]),
  ),
  // Content catalogue (RLS "R" for rows of the published release, system-written); the release
  // itself, critter names and hours proposals have no app_user grant at all.
  ...Object.fromEntries(
    [
      'critter_sets',
      'critters',
      'critter_forms',
      'legendary_windows',
      'spawn_rules',
      'phrase_cards',
      'emergency_numbers',
      'facilities',
      'help_articles',
    ].map((table) => [
      table,
      {
        selectProbe: { sql: `SELECT 1 FROM ${table} LIMIT 1`, params: () => [] },
        expectations: READ_ONLY_ALL,
      },
    ]),
  ),
  ...Object.fromEntries(
    ['content_releases', 'critter_names', 'poi_hours_proposals'].map((table) => [
      table,
      {
        selectProbe: { sql: `SELECT 1 FROM ${table} LIMIT 1`, params: () => [] },
        expectations: {
          outsider: F,
          exMember: F,
          anonymous: F,
          member: F,
          coOrganiser: F,
          organiser: F,
        },
      },
    ]),
  ),
  client_config: {
    selectProbe: {
      sql: "SELECT 1 FROM client_config WHERE key = 'matrix.probe'",
      params: () => [],
    },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Places catalogue (docs/data-model.md §3.13): pois/poi_live_checks/map_regions/cities
  // are all RLS class R, same shape as destinations/guides above; poi_embeddings is class S (no
  // app_user grant at all, same shape as media_objects/rt_outbox).
  pois: {
    selectProbe: { sql: 'SELECT 1 FROM pois LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  poi_embeddings: {
    selectProbe: { sql: 'SELECT 1 FROM poi_embeddings LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  poi_live_checks: {
    selectProbe: { sql: 'SELECT 1 FROM poi_live_checks LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  map_regions: {
    selectProbe: { sql: 'SELECT 1 FROM map_regions LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  cities: {
    selectProbe: { sql: 'SELECT 1 FROM cities LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // llm.pois is a view, not a public-schema table (the coverage scan below never requires an entry
  // for it), added anyway: guide_reader is the only role granted it, so every app_user actor here
  // must see the same "no access" shape as poi_embeddings/media_objects.
  'llm.pois': {
    selectProbe: { sql: 'SELECT 1 FROM llm.pois LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  products: {
    selectProbe: {
      sql: "SELECT 1 FROM products WHERE key = 'boost_trip'",
      params: () => [],
    },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  perks: {
    selectProbe: {
      sql: "SELECT 1 FROM perks WHERE key = 'boost_live_map'",
      params: () => [],
    },
    expectations: {
      outsider: op(true, false, false),
      exMember: op(true, false, false),
      anonymous: op(true, false, false),
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Self-only (RLS class O), materialised server-side: the organiser's own row, not published to
  // anyone else — the same shape as user_settings/consents above, but with no app_user write grant
  // at all (packages/db/test/permissions/user_entitlements.test.ts proves the write side directly).
  user_entitlements: {
    selectProbe: {
      sql: 'SELECT 1 FROM user_entitlements WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: op(true, false, false),
    },
  },
  // Trip-member read (RLS class T), materialised server-side, no app_user write grant.
  trip_entitlements: {
    selectProbe: {
      sql: 'SELECT 1 FROM trip_entitlements WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // The fixture's one usage_counters row is trip-scoped, exercising the same is_trip_member half of
  // the "O / T" policy as trip_entitlements; packages/db/test/permissions/usage_counters.test.ts
  // proves the user-scoped half (self vs. non-self) directly.
  usage_counters: {
    selectProbe: {
      sql: "SELECT 1 FROM usage_counters WHERE subject_kind = 'trip' AND subject_id = $1",
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // RLS class S (docs/product-decisions.md §3: silent fair-use caps, never client-visible) — no
  // app_user grant at all, same shape as cmd_log/domain_events above.
  fair_use_counters: {
    selectProbe: { sql: 'SELECT 1 FROM fair_use_counters LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // RLS class S (docs/data-model.md §3.1: attestation verdicts, never client-visible) — no app_user
  // grant at all, same shape as fair_use_counters/device_attestations above.
  device_attestations: {
    selectProbe: { sql: 'SELECT 1 FROM device_attestations LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // RLS class O, self-only (docs/data-model.md §3.1) — same shape as user_settings/consents:
  // app_user may insert its own row anywhere, but the fixture's row (organiser's) is only
  // selectable/updatable by the organiser.
  device_action_keys: {
    selectProbe: {
      sql: 'SELECT 1 FROM device_action_keys WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  // RLS class X, self-only (docs/data-model.md §3.1: excluded from every derived view) — same
  // self-only shape as user_settings/consents/device_action_keys above.
  user_private: {
    selectProbe: {
      sql: 'SELECT 1 FROM user_private WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  // RLS class O, self-only (docs/data-model.md §3.1) — same shape as user_settings/consents above.
  account_deletions: {
    selectProbe: {
      sql: 'SELECT 1 FROM account_deletions WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  // RLS class S (docs/data-model.md §3.1: attribution, never client-visible) — no app_user grant at
  // all, same shape as device_attestations/fair_use_counters above.
  install_attributions: {
    selectProbe: { sql: 'SELECT 1 FROM install_attributions LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  }, // RLS class S (docs/data-model.md §3.11: server timers) — no app_user grant at all; commands arm
  // timers only through app.schedule_event (packages/db/test/permissions/scheduled_events.test.ts).
  scheduled_events: {
    selectProbe: { sql: 'SELECT 1 FROM scheduled_events LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // RLS class M: active crew members read their crew's codes (the fixture code is the crew's own);
  // writes belong to app_system. Non-members resolve a code only via app.lookup_join_code.
  // Growth (RLS M invites, O inviter opens, X prefill, O either-party referrals, T seat offers,
  // M contact cards); packages/db/test/permissions/{invites,...}.test.ts prove each in full.
  invites: {
    selectProbe: { sql: 'SELECT 1 FROM invites WHERE crew_id = $1', params: (f) => [f.crewId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, true),
      coOrganiser: op(true, true, true),
      organiser: op(true, true, true),
    },
  },
  invite_opens: {
    selectProbe: {
      sql: 'SELECT 1 FROM invite_opens WHERE inviter_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  invite_prefill: {
    selectProbe: {
      sql: 'SELECT 1 FROM invite_prefill WHERE inviter_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(false, true, false),
    },
  },
  referrals: {
    selectProbe: {
      sql: 'SELECT 1 FROM referrals WHERE referrer_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: F,
      organiser: op(true, false, false),
    },
  },
  seat_waitlist_offers: {
    selectProbe: {
      sql: 'SELECT 1 FROM seat_waitlist_offers WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, true),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Probed on the fixture crew's system rows (members joining); a sender updates only their own rows.
  messages: {
    selectProbe: { sql: 'SELECT 1 FROM messages WHERE crew_id = $1', params: (f) => [f.crewId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, false),
    },
  },
  message_reactions: {
    selectProbe: {
      sql: 'SELECT 1 FROM message_reactions WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(false, true, false),
    },
  },
  crew_chat_counters: {
    selectProbe: {
      sql: 'SELECT 1 FROM crew_chat_counters WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  crew_contact_cards: {
    selectProbe: {
      sql: 'SELECT 1 FROM crew_contact_cards WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  join_codes: {
    selectProbe: {
      sql: 'SELECT 1 FROM join_codes WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Own jobs (stream `me`) plus every job on a trip the caller organises (stream `trip_draft`);
  // the fixture job belongs to the member. Written by app_system only.
  agent_jobs: {
    selectProbe: {
      sql: 'SELECT 1 FROM agent_jobs WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Redraft reservations: organisers read them (they meter the organiser-only drafts); only the
  // command handlers and the worker write, as app_system.
  redraft_reservations: {
    selectProbe: {
      sql: 'SELECT 1 FROM redraft_reservations WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // RLS class S: persona content reaches the guide only through llm.persona_packs.
  persona_packs: {
    selectProbe: { sql: 'SELECT 1 FROM persona_packs LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  guide_offers: {
    selectProbe: {
      sql: 'SELECT 1 FROM guide_offers WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, false),
    },
  },
  // Trip members read every claim and may claim for themselves; nobody edits a claim.
  guide_offer_claims: {
    selectProbe: {
      sql: 'SELECT 1 FROM guide_offer_claims WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, false),
    },
  },
  // RLS class S (docs/data-model.md §3.18: per-call AI cost records) — app_system only.
  ai_usage: {
    selectProbe: { sql: 'SELECT 1 FROM ai_usage LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // Devices and the notification router's tables (docs/data-model.md §3.11), all RLS class O.
  // Self-owned (user writes its own row): devices, notification_prefs, scheduled_deliveries.
  devices: {
    selectProbe: {
      sql: 'SELECT 1 FROM devices WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: SELF_ONLY,
  },
  notification_prefs: {
    selectProbe: {
      sql: 'SELECT 1 FROM notification_prefs WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: SELF_ONLY,
  },
  scheduled_deliveries: {
    selectProbe: {
      sql: 'SELECT 1 FROM scheduled_deliveries WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: SELF_ONLY,
  },
  // Owner-read, system-written: the router's own bookkeeping.
  notifications: {
    selectProbe: {
      sql: 'SELECT 1 FROM notifications WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  ping_ledger: {
    selectProbe: {
      sql: 'SELECT 1 FROM ping_ledger WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  roundups: {
    selectProbe: {
      sql: 'SELECT 1 FROM roundups WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  // System-created, owner may only resolve (column UPDATE grant on resolved_at).
  // Home: the organiser's own saves, reminders and app-open counts; a crew tip; a nudge from the
  // organiser to the member, readable by those two only.
  saved_items: { selectProbe: ownRowProbe('saved_items'), expectations: SELF_ONLY },
  reminders: { selectProbe: ownRowProbe('reminders'), expectations: SELF_ONLY },
  app_open_hours: { selectProbe: ownRowProbe('app_open_hours'), expectations: SELF_ONLY },
  home_tips: {
    selectProbe: { sql: 'SELECT 1 FROM home_tips WHERE crew_id = $1', params: (f) => [f.crewId] },
    expectations: CREW_VISIBLE_READ,
  },
  nudges: {
    selectProbe: {
      sql: 'SELECT 1 FROM nudges WHERE sender_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, false, false),
      coOrganiser: F,
      organiser: op(true, false, false),
    },
  },
  // Polls on the fixture trip: crew-visible, written by commands only, except the voter's own
  // ballot (the organiser voted; everyone else may insert only while eligible) and reveal.
  pitches: {
    selectProbe: { sql: 'SELECT 1 FROM pitches WHERE crew_id = $1', params: (f) => [f.crewId] },
    expectations: CREW_VISIBLE_READ,
  },
  polls: {
    selectProbe: { sql: 'SELECT 1 FROM polls WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: CREW_VISIBLE_READ,
  },
  poll_options: {
    selectProbe: {
      sql: 'SELECT 1 FROM poll_options WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  ballots: {
    selectProbe: { sql: 'SELECT 1 FROM ballots WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, false, false),
      organiser: op(true, false, true),
    },
  },
  poll_reveals: { selectProbe: ownRowProbe('poll_reveals'), expectations: SELF_ONLY },
  // Trip setup: the organiser's own calendar source, day and default (owner only); a budget max
  // nobody reads back through app_user, its owner included; a private ask its recipient alone
  // reads; the derived counts, window options, budget aggregate and plan are crew-visible.
  calendar_sources: { selectProbe: ownRowProbe('calendar_sources'), expectations: SELF_ONLY },
  calendar_days: { selectProbe: ownRowProbe('calendar_days'), expectations: SELF_ONLY },
  budget_defaults_private: {
    selectProbe: ownRowProbe('budget_defaults_private'),
    expectations: SELF_ONLY,
  },
  budget_max_private: {
    selectProbe: ownRowProbe('budget_max_private'),
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(false, true, false),
    },
  },
  availability_asks: {
    selectProbe: {
      sql: 'SELECT 1 FROM availability_asks WHERE target_user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  availability_summaries: {
    selectProbe: {
      sql: 'SELECT 1 FROM availability_summaries WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  date_window_options: {
    selectProbe: {
      sql: 'SELECT 1 FROM date_window_options WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  trip_budget_aggregates: {
    selectProbe: {
      sql: 'SELECT 1 FROM trip_budget_aggregates WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  budget_plans: {
    selectProbe: {
      sql: 'SELECT 1 FROM budget_plans WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  room_plans: {
    selectProbe: { sql: 'SELECT 1 FROM room_plans WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: CREW_VISIBLE_READ,
  },
  room_assignments: {
    selectProbe: {
      sql: 'SELECT 1 FROM room_assignments WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  participant_dietary_flags: {
    selectProbe: {
      sql: 'SELECT 1 FROM participant_dietary_flags WHERE trip_id = $1 AND user_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  // Own room chips and dietary profile: the owner alone; room chips only on a trip of their crew.
  room_prefs: {
    selectProbe: ownRowProbe('room_prefs'),
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  dietary_profiles: { selectProbe: ownRowProbe('dietary_profiles'), expectations: SELF_ONLY },
  // Must-dos: the crew reads them; a member adds and edits only their own.
  must_dos: {
    selectProbe: {
      sql: 'SELECT 1 FROM must_dos WHERE trip_id = $1 AND owner_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, true),
    },
  },
  // Plan collaboration: the crew reads comments and +1s and writes its own; personal plan ops are
  // their owner's alone; calendar feed tokens are the server's only.
  comments: {
    selectProbe: {
      sql: 'SELECT 1 FROM comments WHERE trip_id = $1 AND author_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, true),
    },
  },
  comment_plus_ones: {
    selectProbe: {
      sql: 'SELECT 1 FROM comment_plus_ones WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(true, true, false),
      coOrganiser: op(true, true, false),
      organiser: op(true, true, false),
    },
  },
  personal_plan_ops: {
    selectProbe: ownRowProbe('personal_plan_ops'),
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, true),
    },
  },
  calendar_feed_tokens: {
    selectProbe: ownRowProbe('calendar_feed_tokens'),
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // Money: the crew reads a trip's expenses and the crew's ledger and payments; the server writes.
  expenses: {
    selectProbe: {
      sql: 'SELECT 1 FROM expenses WHERE trip_id = $1 AND payer_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  expense_shares: {
    selectProbe: {
      sql: 'SELECT 1 FROM expense_shares WHERE trip_id = $1 AND user_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  expense_edits: {
    selectProbe: {
      sql: 'SELECT 1 FROM expense_edits WHERE trip_id = $1 AND editor_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  ledger_entries: {
    selectProbe: {
      sql: 'SELECT 1 FROM ledger_entries WHERE crew_id = $1 AND debtor_id = $2',
      params: (f) => [f.crewId, f.actors.member],
    },
    expectations: CREW_VISIBLE_READ,
  },
  payments: {
    selectProbe: {
      sql: 'SELECT 1 FROM payments WHERE crew_id = $1 AND to_id = $2',
      params: (f) => [f.crewId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  // A receipt scan is its scanner's until committed to an expense; any crew member uploads theirs.
  receipts: {
    selectProbe: ownRowProbe('receipts'),
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(true, true, false),
    },
  },
  payout_methods: { selectProbe: ownRowProbe('payout_methods'), expectations: SELF_ONLY },
  stickers: { selectProbe: ownRowProbe('stickers'), expectations: OWNER_READ },
  inbox_items: {
    selectProbe: {
      sql: 'SELECT 1 FROM inbox_items WHERE user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: { ...OWNER_READ, organiser: op(true, false, true) },
  },
  // Readable through the owning device only; every write goes through app_system.
  push_tokens: {
    selectProbe: {
      sql: 'SELECT 1 FROM push_tokens t JOIN devices d ON d.id = t.device_id WHERE d.user_id = $1',
      params: (f) => [f.actors.organiser],
    },
    expectations: OWNER_READ,
  },
  // Wallet: the crew reads a crew booking and its crew-visible documents and flight segments; the
  // server writes. Personal rows are covered per actor in bookings.test.ts and friends.
  bookings: {
    selectProbe: {
      sql: "SELECT 1 FROM bookings WHERE trip_id = $1 AND owner_id = $2 AND visibility = 'crew'",
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  booking_attachments: {
    selectProbe: {
      sql: 'SELECT 1 FROM booking_attachments WHERE trip_id = $1 AND crew_visible',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  flight_segments: {
    selectProbe: {
      sql: 'SELECT 1 FROM flight_segments WHERE trip_id = $1 AND owner_id = $2',
      params: (f) => [f.tripId, f.actors.member],
    },
    expectations: CREW_VISIBLE_READ,
  },
  crew_inbound_addresses: {
    selectProbe: {
      sql: 'SELECT 1 FROM crew_inbound_addresses WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  // A forward to the crew address is the crew's to resolve.
  import_candidates: {
    selectProbe: {
      sql: "SELECT 1 FROM import_candidates WHERE user_id = $1 AND source = 'forward'",
      params: (f) => [f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  mailbox_connections: {
    selectProbe: ownRowProbe('mailbox_connections'),
    expectations: OWNER_READ,
  },
  insurance_policies: { selectProbe: ownRowProbe('insurance_policies'), expectations: OWNER_READ },
  // RLS class S: status watches, inbound mail and linked senders have no app_user grant at all.
  // Supplier orders, their items and the trip's providers are the crew's to read (status only).
  supplier_orders: {
    selectProbe: {
      sql: 'SELECT 1 FROM supplier_orders WHERE trip_id = $1 AND buyer_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  supplier_order_items: {
    selectProbe: {
      sql: 'SELECT 1 FROM supplier_order_items WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  providers: {
    selectProbe: {
      sql: 'SELECT 1 FROM providers WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  // Grab quotes and logged rides are the crew's to read; only the api writes them.
  ride_quotes: {
    selectProbe: {
      sql: 'SELECT 1 FROM ride_quotes WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  rides: {
    selectProbe: { sql: 'SELECT 1 FROM rides WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: CREW_VISIBLE_READ,
  },
  affiliate_clicks: {
    selectProbe: { sql: 'SELECT 1 FROM affiliate_clicks LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  affiliate_conversions: {
    selectProbe: { sql: 'SELECT 1 FROM affiliate_conversions LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  flight_watches: {
    selectProbe: { sql: 'SELECT 1 FROM flight_watches LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  inbound_emails: {
    selectProbe: { sql: 'SELECT 1 FROM inbound_emails LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  inbound_sender_links: {
    selectProbe: { sql: 'SELECT 1 FROM inbound_sender_links LIMIT 1', params: () => [] },
    expectations: {
      outsider: F,
      exMember: F,
      anonymous: F,
      member: F,
      coOrganiser: F,
      organiser: F,
    },
  },
  // Billing: owners read their subscriptions, redemptions and paywall history; the crew reads a
  // trip's boost intents and boosts and the crew's credits and grants; store transactions, billing
  // events and codes are the server's alone. Every write is the server's.
  subscriptions: { selectProbe: ownRowProbe('subscriptions'), expectations: OWNER_READ },
  code_redemptions: { selectProbe: ownRowProbe('code_redemptions'), expectations: OWNER_READ },
  paywall_impressions: {
    selectProbe: ownRowProbe('paywall_impressions'),
    expectations: OWNER_READ,
  },
  boost_intents: {
    selectProbe: {
      sql: 'SELECT 1 FROM boost_intents WHERE trip_id = $1 AND buyer_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  trip_boosts: {
    selectProbe: {
      sql: 'SELECT 1 FROM trip_boosts WHERE trip_id = $1 AND buyer_id = $2',
      params: (f) => [f.tripId, f.actors.organiser],
    },
    expectations: CREW_VISIBLE_READ,
  },
  boost_credits: {
    selectProbe: {
      sql: 'SELECT 1 FROM boost_credits WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  crew_year_grants: {
    selectProbe: {
      sql: 'SELECT 1 FROM crew_year_grants WHERE crew_id = $1',
      params: (f) => [f.crewId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  ftf_grants: {
    selectProbe: { sql: 'SELECT 1 FROM ftf_grants WHERE crew_id = $1', params: (f) => [f.crewId] },
    expectations: CREW_VISIBLE_READ,
  },
  store_transactions: {
    selectProbe: { sql: 'SELECT 1 FROM store_transactions LIMIT 1', params: () => [] },
    expectations: SYSTEM_ONLY,
  },
  billing_events: {
    selectProbe: { sql: 'SELECT 1 FROM billing_events LIMIT 1', params: () => [] },
    expectations: SYSTEM_ONLY,
  },
  codes: {
    selectProbe: { sql: 'SELECT 1 FROM codes LIMIT 1', params: () => [] },
    expectations: SYSTEM_ONLY,
  },
  // RLS class S (docs/data-model.md §3.15): any user inserts their own report, nobody reads one
  // back through app_user (packages/db/test/permissions/moderation-reports.test.ts).
  moderation_reports: {
    selectProbe: { sql: 'SELECT 1 FROM moderation_reports LIMIT 1', params: () => [] },
    expectations: {
      outsider: op(false, true, false),
      exMember: op(false, true, false),
      anonymous: op(false, true, false),
      member: op(false, true, false),
      coOrganiser: op(false, true, false),
      organiser: op(false, true, false),
    },
  },
  // Guide chat: a private thread and everything under it is its owner's (the organiser's rows
  // here); a trip's group thread is its crew's. The server writes all of it except phrase practice.
  guide_threads: {
    selectProbe: {
      sql: "SELECT 1 FROM guide_threads WHERE trip_id = $1 AND mode = 'private'",
      params: (f) => [f.tripId],
    },
    expectations: OWNER_READ,
  },
  guide_messages: {
    selectProbe: {
      sql: `SELECT 1 FROM guide_messages m WHERE m.trip_id = $1
              AND m.thread_id IN (SELECT id FROM guide_threads WHERE mode = 'group')`,
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  queued_guide_questions: {
    selectProbe: ownRowProbe('queued_guide_questions'),
    expectations: OWNER_READ,
  },
  custom_phrase_cards: {
    selectProbe: ownRowProbe('custom_phrase_cards'),
    expectations: OWNER_READ,
  },
  phrase_progress: { selectProbe: ownRowProbe('phrase_progress'), expectations: SELF_ONLY },
  guide_crew_turns: {
    selectProbe: { sql: 'SELECT 1 FROM guide_crew_turns LIMIT 1', params: () => [] },
    expectations: SYSTEM_ONLY,
  },
  briefings: { selectProbe: ownRowProbe('briefings'), expectations: OWNER_READ },
  briefing_items: { selectProbe: ownRowProbe('briefing_items'), expectations: OWNER_READ },
  alarms: { selectProbe: ownRowProbe('alarms'), expectations: OWNER_READ },
  packing_items: {
    selectProbe: {
      sql: 'SELECT 1 FROM packing_items WHERE trip_id = $1 AND owner_id IS NULL',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  leave_bys: {
    selectProbe: { sql: 'SELECT 1 FROM leave_bys WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: CREW_VISIBLE_READ,
  },
  readiness: {
    selectProbe: { sql: 'SELECT 1 FROM readiness WHERE trip_id = $1', params: (f) => [f.tripId] },
    expectations: CREW_VISIBLE_READ,
  },
  offline_bundles: {
    selectProbe: {
      sql: 'SELECT 1 FROM offline_bundles WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  // Explore: the crew reads a trip's swipe sessions, yes votes, matches and Q&A line; a vote
  // (and so every "no") is its voter's alone; tips and live placements are open to every reader;
  // saved lists are their owner's; sponsored counts are the server's.
  swipe_sessions: {
    selectProbe: {
      sql: 'SELECT 1 FROM swipe_sessions WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  swipe_votes: { selectProbe: ownRowProbe('swipe_votes'), expectations: OWNER_READ },
  swipe_yes_votes: {
    selectProbe: {
      sql: 'SELECT 1 FROM swipe_yes_votes WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  swipe_matches: {
    selectProbe: {
      sql: 'SELECT 1 FROM swipe_matches WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  place_qna_summaries: {
    selectProbe: {
      sql: 'SELECT 1 FROM place_qna_summaries WHERE trip_id = $1',
      params: (f) => [f.tripId],
    },
    expectations: CREW_VISIBLE_READ,
  },
  place_tips: {
    selectProbe: { sql: 'SELECT 1 FROM place_tips LIMIT 1', params: () => [] },
    expectations: READ_ONLY_ALL,
  },
  saved_lists: { selectProbe: ownRowProbe('saved_lists'), expectations: SELF_ONLY },
  sponsored_placements: {
    selectProbe: { sql: 'SELECT 1 FROM sponsored_placements LIMIT 1', params: () => [] },
    expectations: READ_ONLY_ALL,
  },
  sponsored_event_counts: {
    selectProbe: { sql: 'SELECT 1 FROM sponsored_event_counts LIMIT 1', params: () => [] },
    expectations: SYSTEM_ONLY,
  },
};

/**
 * Runs one table's declared `select` probe as one actor and reports whether a row came back.
 * "Cannot select" shows up two ways in this schema: zero rows (RLS filtered the row out) or a hard
 * `permission denied` error (no `GRANT SELECT` to `app_user` at all, e.g. `cmd_log`) — both mean the
 * same thing for the matrix, so a permission error is treated as `false`, not re-thrown.
 */
export async function probeSelect(
  pool: pg.Pool,
  uid: string,
  device: string,
  probe: SelectProbe,
  fixture: PermissionFixture,
): Promise<boolean> {
  try {
    const result = await withUser(pool, uid, device, (tx) =>
      tx.query(probe.sql, [...probe.params(fixture)]),
    );
    return (result.rowCount ?? 0) > 0;
  } catch (error) {
    if (error instanceof Error && /permission denied/i.test(error.message)) return false;
    throw error;
  }
}
