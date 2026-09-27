/* eslint-disable lingui/no-unlocalized-strings -- SQL text and column names, not JSX/UI copy. */
/**
 * D1 access for the waitlist: the only module that talks to `waitlist_entries` /
 * `waitlist_rate_limits` directly (migrations/20260927064301_waitlist_entries.sql). Kept thin and
 * untested-by-mock — real behaviour is exercised against a local and a staging D1 database (see
 * the `docs/undesigned-states.md` note for how this was smoke-tested).
 */
import type { RateLimitRow } from './rate-limit';

export interface WaitlistEntry {
  readonly id: number;
  readonly email: string;
  readonly handle: string;
  readonly destination: string;
  readonly referredByHandle: string | null;
  readonly createdAt: string;
}

interface EntryRow {
  readonly id: number;
  readonly email: string;
  readonly handle: string;
  readonly destination: string;
  readonly referred_by_handle: string | null;
  readonly created_at: string;
}

function toEntry(row: EntryRow): WaitlistEntry {
  return {
    id: row.id,
    email: row.email,
    handle: row.handle,
    destination: row.destination,
    referredByHandle: row.referred_by_handle,
    createdAt: row.created_at,
  };
}

export async function findEntryByEmail(
  db: D1Database,
  email: string,
): Promise<WaitlistEntry | null> {
  const row = await db
    .prepare('SELECT * FROM waitlist_entries WHERE email = ?')
    .bind(email)
    .first<EntryRow>();
  return row ? toEntry(row) : null;
}

export async function findEntryByHandle(
  db: D1Database,
  handle: string,
): Promise<WaitlistEntry | null> {
  const row = await db
    .prepare('SELECT * FROM waitlist_entries WHERE handle = ?')
    .bind(handle)
    .first<EntryRow>();
  return row ? toEntry(row) : null;
}

export async function handleTaken(db: D1Database, handle: string): Promise<boolean> {
  const row = await db
    .prepare('SELECT 1 FROM waitlist_entries WHERE handle = ?')
    .bind(handle)
    .first();
  return row !== null;
}

export async function insertEntry(
  db: D1Database,
  input: { email: string; handle: string; destination: string; referredByHandle: string | null },
): Promise<WaitlistEntry> {
  const row = await db
    .prepare(
      `INSERT INTO waitlist_entries (email, handle, destination, referred_by_handle)
       VALUES (?, ?, ?, ?)
       RETURNING *`,
    )
    .bind(input.email, input.handle, input.destination, input.referredByHandle)
    .first<EntryRow>();
  if (!row) throw new Error('waitlist-repository: insert did not return the new row');
  return toEntry(row);
}

/** Total real sign-ups (`WAITLIST_BASE_COUNT` is added on top by the caller, never stored). */
export async function countAllEntries(db: D1Database): Promise<number> {
  const row = await db.prepare('SELECT COUNT(*) AS n FROM waitlist_entries').first<{ n: number }>();
  return row?.n ?? 0;
}

/** 1-indexed join-order rank, robust to any deleted rows (never trusts raw autoincrement ids). */
export async function rankOfEntry(db: D1Database, id: number): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM waitlist_entries WHERE id <= ?')
    .bind(id)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function countReferrals(db: D1Database, handle: string): Promise<number> {
  const row = await db
    .prepare('SELECT COUNT(*) AS n FROM waitlist_entries WHERE referred_by_handle = ?')
    .bind(handle)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

export async function readRateLimit(db: D1Database, ipHash: string): Promise<RateLimitRow | null> {
  const row = await db
    .prepare('SELECT window_start_ms, request_count FROM waitlist_rate_limits WHERE ip_hash = ?')
    .bind(ipHash)
    .first<{ window_start_ms: number; request_count: number }>();
  return row ? { windowStartMs: row.window_start_ms, count: row.request_count } : null;
}

export async function writeRateLimit(
  db: D1Database,
  ipHash: string,
  next: RateLimitRow,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO waitlist_rate_limits (ip_hash, window_start_ms, request_count)
       VALUES (?, ?, ?)
       ON CONFLICT (ip_hash) DO UPDATE SET window_start_ms = excluded.window_start_ms, request_count = excluded.request_count`,
    )
    .bind(ipHash, next.windowStartMs, next.count)
    .run();
}
