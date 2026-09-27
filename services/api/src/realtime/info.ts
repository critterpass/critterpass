/**
 * Presence `info` the subscribe proxy attaches to a subscription (docs/api-contracts.md §5.7):
 * display name and avatar key only, read from the subscriber's own `users` row. Centrifugo copies
 * it into presence and join/leave events, so it must never carry anything beyond these two fields.
 */
import type pg from 'pg';

export interface RtPresenceInfo {
  readonly name: string | null;
  readonly avatar: string | null;
}

/** Reads the caller's own row inside a `withUser` transaction (RLS: a user always sees themself). */
export async function readPresenceInfo(tx: pg.PoolClient): Promise<RtPresenceInfo> {
  const { rows } = await tx.query<{ display_name: string | null; avatar_id: string | null }>(
    'SELECT display_name, avatar_id FROM users WHERE id = app.uid()',
  );
  const row = rows[0];
  return { name: row?.display_name ?? null, avatar: row?.avatar_id ?? null };
}
