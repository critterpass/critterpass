import type pg from 'pg';

/**
 * Throwaway data the anonymous-merge scenario proves gets carried over atomically when
 * `onLinkAccount` reassigns an anonymous user's data to the pre-existing account it
 * merges into. Lives in its own `spike` schema, never `packages/db/migrations` (phase 2
 * convention: spike tables are dropped after the ADR records its numbers).
 */
export async function ensureOwnedRowsSchema(pool: pg.Pool): Promise<void> {
  await pool.query('create schema if not exists spike');
  await pool.query(`
    create table if not exists spike.spike_owned (
      id uuid primary key default gen_random_uuid(),
      owner_id text not null,
      label text not null
    )
  `);
  await pool.query(`
    create table if not exists spike.spike_owned_audit (
      id uuid primary key default gen_random_uuid(),
      owned_id uuid not null references spike.spike_owned(id),
      merged_from text not null,
      merged_to text not null,
      at timestamptz not null default now()
    )
  `);
}

export async function createOwnedRow(
  pool: pg.Pool,
  ownerId: string,
  label: string,
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    'insert into spike.spike_owned (owner_id, label) values ($1, $2) returning id',
    [ownerId, label],
  );
  const id = rows[0]?.id;
  if (!id) throw new Error('s-auth owned-rows: insert returned no id');
  return id;
}

export async function countOwnedBy(pool: pg.Pool, ownerId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'select count(*)::text as count from spike.spike_owned where owner_id = $1',
    [ownerId],
  );
  return Number(rows[0]?.count ?? '0');
}

export async function countAuditRows(pool: pg.Pool, mergedFrom: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    'select count(*)::text as count from spike.spike_owned_audit where merged_from = $1',
    [mergedFrom],
  );
  return Number(rows[0]?.count ?? '0');
}

/**
 * Moves every row a user owns to another user's id in one transaction: updates ownership,
 * then records an audit row per moved item. `injectFailureAfterUpdate` exists only so the
 * atomicity test can prove a mid-transaction failure rolls the ownership change back too
 * (real Postgres ROLLBACK, not a simulated one).
 */
export async function mergeOwnedRows(
  pool: pg.Pool,
  {
    fromUserId,
    toUserId,
    injectFailureAfterUpdate = false,
  }: {
    fromUserId: string;
    toUserId: string;
    injectFailureAfterUpdate?: boolean;
  },
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query<{ id: string }>(
      'update spike.spike_owned set owner_id = $1 where owner_id = $2 returning id',
      [toUserId, fromUserId],
    );
    if (injectFailureAfterUpdate) {
      throw new Error('s-auth owned-rows: injected failure after ownership update');
    }
    for (const row of rows) {
      await client.query(
        'insert into spike.spike_owned_audit (owned_id, merged_from, merged_to) values ($1, $2, $3)',
        [row.id, fromUserId, toUserId],
      );
    }
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
}
