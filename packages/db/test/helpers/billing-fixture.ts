/**
 * Billing rows for the shared permission fixture: the organiser holds a monthly Pass+
 * subscription, bought a split Trip Boost for the fixture trip (its store transaction, the
 * RevenueCat event, the lapsed intent and the live boost), and the crew holds a boost credit, a
 * crew yearly grant and its first-trip-free grant; plus a gift code the organiser redeemed and one
 * paywall impression. Also the checks the billing permission suites share.
 */
import { randomUUID } from 'node:crypto';

import type pg from 'pg';
import { expect } from 'vitest';

import { withUser } from '../../src/tx';
import { visibleRows } from './setup-privacy';
import type { StreamHarness } from './stream-harness';
import type { ActorKind } from './fixtures';

export interface BillingFixtureInput {
  readonly crewId: string;
  readonly tripId: string;
  readonly organiser: string;
  readonly member: string;
}

const HASH = (seed: string) => seed.repeat(64).slice(0, 64);

export async function seedBillingRows(
  tx: pg.PoolClient,
  input: BillingFixtureInput,
): Promise<void> {
  const { crewId, tripId, organiser, member } = input;
  const { rows: subs } = await tx.query<{ id: string }>(
    `INSERT INTO subscriptions (user_id, platform, original_transaction_id, product_key, status,
       period_start, period_end)
     VALUES ($1, 'app_store', 'fixture-otx-1', 'pass_monthly', 'active', now(),
       now() + interval '30 days') RETURNING id`,
    [organiser],
  );
  await tx.query(
    `INSERT INTO store_transactions (user_id, platform, transaction_id, original_transaction_id,
       subscription_id, product_key, store_product_id, purchased_at, price_minor, currency)
     VALUES ($1, 'app_store', 'fixture-otx-1', 'fixture-otx-1', $2, 'pass_monthly',
       'pass_monthly', now(), 399, 'USD')`,
    [organiser, subs[0]!.id],
  );
  const { rows: intents } = await tx.query<{ id: string }>(
    `INSERT INTO boost_intents (trip_id, crew_id, buyer_id, product_key, split_mode,
       split_member_ids, status, expires_at)
     VALUES ($1, $2, $3, 'boost_trip', 'split', ARRAY[$3, $4]::uuid[], 'fulfilled', now())
     RETURNING id`,
    [tripId, crewId, organiser, member],
  );
  const { rows: txns } = await tx.query<{ id: string }>(
    `INSERT INTO store_transactions (user_id, platform, transaction_id, product_key,
       store_product_id, purchased_at, price_minor, currency, boost_intent_id)
     VALUES ($1, 'app_store', 'fixture-boost-1', 'boost_trip', 'boost_trip', now(), 1199, 'USD', $2)
     RETURNING id`,
    [organiser, intents[0]!.id],
  );
  await tx.query(
    `INSERT INTO billing_events (source, event_id, type, app_user_id, payload)
     VALUES ('revenuecat', 'fixture-event-1', 'NON_RENEWING_PURCHASE', $1, '{"event":{}}')`,
    [organiser],
  );
  const { rows: boosts } = await tx.query<{ id: string }>(
    `INSERT INTO trip_boosts (trip_id, crew_id, buyer_id, source, store_transaction_id, intent_id,
       split_mode, split_member_ids, starts_at, ends_at)
     VALUES ($1, $2, $3, 'purchase', $4, $5, 'split', ARRAY[$3, $6]::uuid[], now(),
       now() + interval '20 days') RETURNING id`,
    [tripId, crewId, organiser, txns[0]!.id, intents[0]!.id, member],
  );
  await tx.query(
    `INSERT INTO boost_credits (crew_id, reason, from_boost_id) VALUES ($1, 'trip_cancelled', $2)`,
    [crewId, boosts[0]!.id],
  );
  await tx.query(
    `INSERT INTO crew_year_grants (crew_id, buyer_id, valid_from, valid_to)
     VALUES ($1, $2, now(), now() + interval '365 days')`,
    [crewId, organiser],
  );
  await tx.query(
    `INSERT INTO ftf_grants (crew_id, trip_id, organiser_id, starts_at, ends_at, member_overlap_hash)
     VALUES ($1, $2, $3, now(), now() + interval '20 days', $4)`,
    [crewId, tripId, organiser, HASH('a')],
  );
  const { rows: codes } = await tx.query<{ id: string }>(
    `INSERT INTO codes (code_hash, code_prefix, kind, grant_spec, sender_id, funded_by_txn_id)
     VALUES ($1, 'PASS', 'gift', '{"pass_plus_days":90}', $2, $3) RETURNING id`,
    [HASH('b'), member, txns[0]!.id],
  );
  await tx.query(
    `INSERT INTO code_redemptions (code_id, user_id, applied_as, starts_at, new_period_end)
     VALUES ($1, $2, 'server_grant', now(), now() + interval '90 days')`,
    [codes[0]!.id, organiser],
  );
  await tx.query(
    `INSERT INTO paywall_impressions (user_id, trip_id, entry_point, outcome, governed, shown_at,
       local_date)
     VALUES ($1, $2, 'guide_limit', 'shown', true, now(), current_date)`,
    [organiser, tripId],
  );
}

const CREW_READERS = ['member', 'organiser', 'coOrganiser'] as const;
const OUTSIDERS = ['outsider', 'exMember', 'anonymous'] as const;

async function expectNoAppUserWrite(harness: StreamHarness, table: string): Promise<void> {
  await expect(
    withUser(harness.db.pool, harness.fixture.actors.organiser, randomUUID(), (tx) =>
      tx.query(`UPDATE ${table} SET created_at = created_at`),
    ),
  ).rejects.toThrow(/permission denied/i);
}

async function streamed(
  harness: StreamHarness,
  stream: string,
  actor: ActorKind,
  table: string,
): Promise<number> {
  const params = stream === 'trip' ? { trip_id: harness.fixture.tripId } : undefined;
  const rows = await harness.rows(stream, actor, params);
  return rows.get(table)?.length ?? 0;
}

/**
 * A crew-visible billing table: active members read the fixture row through RLS and receive it on
 * `stream`; the outsider, the ex-member and an anonymous uid get neither; app_user writes nothing.
 */
export async function expectCrewBillingTable(
  harness: StreamHarness,
  table: string,
  stream: 'trip' | 'crews',
): Promise<void> {
  const { actors, crewId } = harness.fixture;
  const probe = `SELECT 1 FROM ${table} WHERE crew_id = $1`;
  for (const kind of CREW_READERS) {
    expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBeGreaterThan(0);
    expect(await streamed(harness, stream, kind, table), `${table} to ${kind}`).toBeGreaterThan(0);
  }
  for (const kind of OUTSIDERS) {
    expect(await visibleRows(harness, actors[kind], probe, [crewId]), kind).toBe(0);
    expect(await streamed(harness, stream, kind, table), `${table} to ${kind}`).toBe(0);
  }
  await expectNoAppUserWrite(harness, table);
}

/** An owner-only table: the organiser reads and receives their own row on `me`, nobody else. */
export async function expectOwnerOnlyTable(harness: StreamHarness, table: string): Promise<void> {
  const { actors } = harness.fixture;
  const probe = `SELECT 1 FROM ${table} WHERE user_id = $1`;
  expect(await visibleRows(harness, actors.organiser, probe, [actors.organiser])).toBeGreaterThan(
    0,
  );
  expect(await streamed(harness, 'me', 'organiser', table)).toBeGreaterThan(0);
  for (const kind of ['member', 'coOrganiser', ...OUTSIDERS] as const) {
    expect(await visibleRows(harness, actors[kind], probe, [actors.organiser]), kind).toBe(0);
    expect(await streamed(harness, 'me', kind, table), `${table} to ${kind}`).toBe(0);
  }
  await expectNoAppUserWrite(harness, table);
}

async function asRole(harness: StreamHarness, role: string, sql: string): Promise<unknown> {
  const client = await harness.db.pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL ROLE ${role}`);
    return await client.query(sql);
  } finally {
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

/**
 * A system-only table: app_user (even the organiser the row belongs to), guide_reader and the
 * replication role are refused outright, the table is not published, and no stream names it.
 */
export async function expectSystemOnlyTable(harness: StreamHarness, table: string): Promise<void> {
  const { actors } = harness.fixture;
  await expect(
    withUser(harness.db.pool, actors.organiser, randomUUID(), (tx) =>
      tx.query(`SELECT 1 FROM ${table} LIMIT 1`),
    ),
  ).rejects.toThrow(/permission denied/i);
  for (const role of ['guide_reader', 'powersync_repl']) {
    await expect(asRole(harness, role, `SELECT 1 FROM ${table} LIMIT 1`), role).rejects.toThrow(
      /permission denied/i,
    );
  }
  const { rows } = await harness.db.pool.query(
    "SELECT 1 FROM pg_publication_tables WHERE pubname = 'powersync' AND tablename = $1",
    [table],
  );
  expect(rows).toEqual([]);
  const named = Object.values(harness.config.streams).some((stream) =>
    stream.queries.some((query) => new RegExp(`\\b${table}\\b`).test(query)),
  );
  expect(named, `${table} appears in a sync stream`).toBe(false);
}
