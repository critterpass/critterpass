/**
 * Registry of how each `public`-schema table with a user-owning column behaves when an anonymous
 * uid merges into an existing uid (docs/api-contracts.md §5.1 `POST /v1/auth/merge`; this phase's
 * "Merge rule registry" requirement: "per table with a user column → union | keep_existing | drop |
 * reassign; coverage test fails when a table with a user column lacks a rule"). A later phase adding
 * a new user-owned table registers its own rule here (same file, since this registry — unlike
 * `packages/domain/src/privacy.ts`'s per-schema-module registration — has no natural per-table home
 * to call from without a circular import between this package's schema modules).
 */

export const MERGE_STRATEGIES = ['union', 'keep_existing', 'drop', 'reassign'] as const;
export type MergeStrategy = (typeof MERGE_STRATEGIES)[number];

export interface MergeRule {
  readonly table: string;
  readonly userColumn: string;
  readonly strategy: MergeStrategy;
  /**
   * Only meaningful for `union`/`reassign`: other columns forming a unique constraint together
   * with `userColumn` (e.g. `crew_members`' `(crew_id, user_id)`). An anon row that would collide
   * with an existing row on these columns is dropped instead of reassigned — the existing row wins,
   * satisfying "unique-conflict resolution (existing wins)".
   */
  readonly conflictColumns?: readonly string[];
  /**
   * `drop`-only escape hatch for a table locked down tighter than merge execution's own app_system
   * grant (`fair_use_counters`: no app_system grant at all by design, only its own SECURITY DEFINER
   * function may touch it). When set, the executor calls `SELECT app.<viaFunction>($1)` with the anon
   * uid instead of a raw `DELETE FROM <table>`.
   */
  readonly viaFunction?: string;
  /**
   * Rows that only mean something to their own user (devices, notifications). They follow the
   * user on merge, but they are not data anyone else relies on: deleting the user deletes them
   * (their `user_id` foreign key cascades), so account GC neither keeps an account for them nor
   * deletes them one by one.
   */
  readonly personal?: boolean;
}

const registry = new Map<string, MergeRule>();

/** Registers one table's merge rule. Called once, at module load. */
export function registerMergeRule(rule: MergeRule): void {
  if (registry.has(rule.table)) {
    throw new Error(`merge rule already registered for table "${rule.table}"`);
  }
  registry.set(rule.table, rule);
}

export function getMergeRule(table: string): MergeRule | undefined {
  return registry.get(table);
}

export function listMergeRules(): readonly MergeRule[] {
  return [...registry.values()].sort((a, b) => a.table.localeCompare(b.table));
}

export function isRegisteredMergeTable(table: string): boolean {
  return registry.has(table);
}

/** Test-only: clears every registration so one test file's fixtures cannot leak into another. */
export function resetMergeRulesForTests(): void {
  registry.clear();
}

// Every `public`-schema table with a `user_id` column as of this phase (verified against a live
// database's information_schema.columns, not just the migration SQL — see
// packages/db/test/merge-rules-coverage.test.ts). Tables created by phases that land after this one
// register their own rule where they define the table.
registerMergeRule({ table: 'user_settings', userColumn: 'user_id', strategy: 'keep_existing' });
registerMergeRule({ table: 'consents', userColumn: 'user_id', strategy: 'keep_existing' });
registerMergeRule({
  table: 'crew_members',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['crew_id'],
});
registerMergeRule({
  table: 'trip_participants',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['trip_id'],
});
// Entitlements/usage are re-evaluated by their owning phase once purchase history exists to weigh;
// until then the anonymous uid's rows are the safe default (an anonymous session cannot purchase).
registerMergeRule({ table: 'user_entitlements', userColumn: 'user_id', strategy: 'keep_existing' });
registerMergeRule({
  table: 'fair_use_counters',
  userColumn: 'user_id',
  strategy: 'drop',
  viaFunction: 'merge_drop_fair_use_counters',
});

// Not named `user_id` (outside the coverage test's scan), but still a plain FK to `users(id)` with
// no per-user uniqueness constraint of its own: a straight reassignment, same as `union`/`reassign`
// tables above but never contending for a unique slot.
registerMergeRule({ table: 'crews', userColumn: 'created_by', strategy: 'reassign' });
registerMergeRule({ table: 'media_objects', userColumn: 'owner_id', strategy: 'reassign' });

// device_action_keys (T9): tied to one physical device, not a fact worth carrying to the existing
// uid's own devices. "Dropping" here means revoking (setting revoked_at), never a hard DELETE — this
// table has no DELETE grant for any role (data-model.md's "revoked + 30 d" retention needs the row to
// stay auditable) — via the same SECURITY DEFINER escape hatch fair_use_counters uses, matching
// "revoked on ... uid merge" (docs/api-contracts-async.md §5).
registerMergeRule({
  table: 'device_action_keys',
  userColumn: 'user_id',
  strategy: 'drop',
  viaFunction: 'merge_revoke_device_action_keys',
});

// T10: user_private is a singleton per user (PK user_id, same shape as user_settings) — existing
// wins. account_deletions is a history table; an anon uid reaching merge at all implies it was never
// closed, so any row it somehow has carries no useful information forward.
registerMergeRule({ table: 'user_private', userColumn: 'user_id', strategy: 'keep_existing' });
registerMergeRule({ table: 'account_deletions', userColumn: 'user_id', strategy: 'drop' });

// AI cost records (C5) follow the user who incurred them, same as any other retained ledger row.
registerMergeRule({ table: 'ai_usage', userColumn: 'user_id', strategy: 'reassign' });
// A durable AI job follows the user who asked for it. An offer claim is unique per (offer, user):
// when both uids claimed the same offer the existing claim wins and the anon one is dropped.
registerMergeRule({ table: 'agent_jobs', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({
  table: 'guide_offer_claims',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['offer_id'],
});

// A join code keeps working after its creator's anonymous uid merges: the code follows the user.
registerMergeRule({ table: 'join_codes', userColumn: 'created_by', strategy: 'reassign' });

// Devices and the notification router's tables (docs/data-model.md §3.11). The anon uid's device is
// the one the user is holding right now, so it (and everything addressed to it) follows the user.
// Per-date and per-dedupe-key rows collide with the existing uid's own: existing wins. Prefs are a
// singleton per user, like user_settings.
registerMergeRule({
  table: 'devices',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
registerMergeRule({
  table: 'notifications',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['dedupe_key'],
  personal: true,
});
registerMergeRule({
  table: 'notification_prefs',
  userColumn: 'user_id',
  strategy: 'keep_existing',
});
registerMergeRule({
  table: 'ping_ledger',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['local_date'],
  personal: true,
});
registerMergeRule({
  table: 'roundups',
  userColumn: 'user_id',
  strategy: 'union',
  conflictColumns: ['local_date'],
  personal: true,
});
registerMergeRule({
  table: 'inbox_items',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});
registerMergeRule({
  table: 'scheduled_deliveries',
  userColumn: 'user_id',
  strategy: 'reassign',
  personal: true,
});

// Derived cost rows: `cost.recompute` rebuilds a trip's share calcs and totals from its
// participants (which merge above), so an anonymous uid's copies are dropped, never carried over.
registerMergeRule({ table: 'share_calcs', userColumn: 'user_id', strategy: 'drop' });
registerMergeRule({ table: 'trip_share_totals', userColumn: 'user_id', strategy: 'drop' });

// Location: share windows and POI visits follow the user; live fixes and computed ETAs are
// minutes-lived or rebuilt by the system, so an anonymous uid's copies are dropped.
registerMergeRule({ table: 'location_shares', userColumn: 'user_id', strategy: 'reassign' });
registerMergeRule({ table: 'location_fixes', userColumn: 'user_id', strategy: 'drop' });
registerMergeRule({ table: 'member_etas', userColumn: 'user_id', strategy: 'drop' });
registerMergeRule({ table: 'visits', userColumn: 'user_id', strategy: 'reassign' });
