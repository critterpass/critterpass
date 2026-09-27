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

export const TABLE_MATRIX: Readonly<Record<string, TableMatrixEntry>> = {
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
