/**
 * The tables whose whole permission contract is one of the shared shapes: who reads the fixture
 * row, that app_user never writes it, and which stream (if any) carries it to whom. One row per
 * table; a new table with one of these shapes adds a row here instead of a file.
 *
 * A table with a rule of its own (an owner write, a trigger, a constraint the app relies on, a
 * stream that carries only some rows) also has a file named after it in this directory for that
 * rule. The last case fails when a table under row security has neither a row here nor a file in
 * this directory that names it. `_matrix.ts` holds what each actor may select on every table.
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  expectCrewBillingTable,
  expectOwnerOnlyTable,
  expectSystemOnlyTable,
} from '../helpers/billing-fixture';
import type { ActorKind } from '../helpers/fixtures';
import { expectCrewLedgerTable } from '../helpers/money-fixture';
import { expectCrewReadOnly, expectReadOnlyOffSync, expectSealed } from '../helpers/setup-privacy';
import { startStreamHarness, type StreamHarness } from '../helpers/stream-harness';

type TableRule =
  /** The trip's crew reads it and gets it on the `trip` stream; app_user never writes it. */
  | readonly [table: string, shape: 'crew read-only']
  /** A billing row the crew reads by `crew_id`, carried by the named stream to members only. */
  | readonly [table: string, shape: 'crew billing', stream: 'trip' | 'crews']
  /** A crew-level money row carried by `crews` to members only. */
  | readonly [table: string, shape: 'crew ledger']
  /** The owner reads and gets their own row on `me`; nobody else does; app_user never writes. */
  | readonly [table: string, shape: 'owner only']
  /** No app_user, guide or replication access at all; unpublished and in no stream. */
  | readonly [table: string, shape: 'system only']
  /** Read by its owner alone (or nobody), and by no other role, publication or stream. */
  | readonly [table: string, shape: 'sealed', owner: ActorKind | null]
  /** Read through a route: app_user selects and never writes, and it never syncs. */
  | readonly [table: string, shape: 'read-only, never synced'];

const TABLE_RULES: readonly TableRule[] = [
  ['album_curations', 'crew read-only'],
  ['album_picks', 'crew read-only'],
  ['anniversaries', 'sealed', null],
  ['billing_events', 'system only'],
  ['boost_credits', 'crew billing', 'crews'],
  ['boost_intents', 'crew billing', 'trip'],
  ['budget_defaults_private', 'sealed', 'organiser'],
  ['budget_plans', 'crew read-only'],
  ['code_redemptions', 'owner only'],
  ['codes', 'system only'],
  ['crew_year_grants', 'crew billing', 'crews'],
  ['date_window_options', 'crew read-only'],
  ['expense_shares', 'crew read-only'],
  ['feedback_tickets', 'owner only'],
  ['flight_watches', 'sealed', null],
  ['ftf_grants', 'crew billing', 'crews'],
  ['hype_aggregates', 'crew read-only'],
  ['idea_votes', 'owner only'],
  ['leave_bys', 'crew read-only'],
  ['mailing_addresses', 'sealed', 'organiser'],
  ['memories', 'crew read-only'],
  ['memory_reactions', 'crew read-only'],
  ['offline_bundles', 'crew read-only'],
  ['packing_items', 'crew read-only'],
  ['payments', 'crew ledger'],
  ['paywall_impressions', 'owner only'],
  ['photo_people', 'crew read-only'],
  ['photos', 'crew read-only'],
  ['place_qna_summaries', 'read-only, never synced'],
  ['place_rating_stats', 'read-only, never synced'],
  ['postcard_mailings', 'crew read-only'],
  ['postcards', 'crew read-only'],
  ['proposal_followups', 'read-only, never synced'],
  ['proposal_reactions', 'crew read-only'],
  ['rating_prompts', 'owner only'],
  ['readiness', 'crew read-only'],
  ['recaps', 'crew read-only'],
  ['room_plans', 'crew read-only'],
  ['route_cache', 'sealed', null],
  ['stamp_signatures', 'crew read-only'],
  ['store_transactions', 'system only'],
  ['subscriptions', 'owner only'],
  ['trip_boosts', 'crew billing', 'trip'],
  ['trip_dropouts', 'crew read-only'],
  ['watch_items', 'crew read-only'],
];

let harness: StreamHarness;

beforeAll(async () => {
  harness = await startStreamHarness();
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function check(rule: TableRule): Promise<void> {
  const [table] = rule;
  switch (rule[1]) {
    case 'crew read-only':
      return expectCrewReadOnly(harness, table);
    case 'crew billing':
      return expectCrewBillingTable(harness, table, rule[2]);
    case 'crew ledger':
      return expectCrewLedgerTable(harness, table);
    case 'owner only':
      return expectOwnerOnlyTable(harness, table);
    case 'system only':
      return expectSystemOnlyTable(harness, table);
    case 'sealed':
      return expectSealed(harness, table, { owner: rule[2] });
    case 'read-only, never synced':
      return expectReadOnlyOffSync(harness, table);
  }
}

describe('tables with a shared permission shape', () => {
  // Every check only reads (its one write is the refused one), so the rows share one fixture.
  it.each(TABLE_RULES.map((rule) => [rule[0], rule[1], rule] as const))(
    '%s is %s',
    async (_table, _shape, rule) => {
      await check(rule);
    },
  );

  it('lists each table once', () => {
    const names = TABLE_RULES.map(([table]) => table);
    expect(names).toEqual([...new Set(names)]);
  });
});

describe('permission test coverage', () => {
  it('has a row here or a file in this directory for every table under row security', async () => {
    const self = path.basename(import.meta.filename);
    const files = (await readdir(import.meta.dirname)).filter(
      (name) => name.endsWith('.test.ts') && name !== self && !name.startsWith('_matrix'),
    );
    const sources = await Promise.all(
      files.map((name) => readFile(path.join(import.meta.dirname, name), 'utf8')),
    );
    const listed = new Set(TABLE_RULES.map(([table]) => table));
    const { rows } = await harness.db.pool.query<{ table: string }>(
      `SELECT c.relname AS table
         FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
        ORDER BY c.relname`,
    );
    expect(rows.length).toBeGreaterThan(listed.size);
    const untested = rows
      .map((row) => row.table)
      .filter((table) => {
        if (listed.has(table)) return false;
        const named = new RegExp(`\\b${table}\\b`);
        return !sources.some((source) => named.test(source));
      });
    expect(untested, 'tables with no permission test').toEqual([]);
  });
});
