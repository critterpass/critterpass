/**
 * Merge preview + execution (docs/api-contracts.md §5.1 `POST /v1/auth/merge-ticket`,
 * `POST /v1/auth/merge`). Preview reads both uids' crews/trips (`critters`/`stamps` land once phases
 * 20+ create those tables — an empty array until then, never faked). Execution runs the whole thing
 * in one `withSystem` tx applying `packages/db/src/merge-rules.ts`'s registry, then deletes the
 * anonymous `auth.user` and mints a session for the existing uid through Better Auth's own
 * `internalAdapter` (the one supported way to touch `auth.*` from outside the `auth` role — see
 * services/api/src/auth/social/revoke.ts's identical reasoning).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

import type pg from 'pg';

import { appendDomainEvent, enqueueRealtime, listMergeRules, withSystem } from '@cp/db';
import { userChannel } from '@cp/domain';

import type { AuthInstance } from '../config';

export interface MergePreview {
  readonly crews: ReadonlyArray<{ id: string; name: string; owner: 'anon' | 'existing' }>;
  readonly trips: ReadonlyArray<{
    id: string;
    destinationId: string | null;
    startDate: string | null;
    owner: 'anon' | 'existing';
  }>;
  /** No `critters`/`stamps` table exists yet (phase 20+); always empty until one of those phases extends this preview. */
  readonly critters: readonly never[];
  readonly stamps: readonly never[];
}

export async function buildMergePreview(
  pool: pg.Pool,
  anonUid: string,
  existingUid: string,
): Promise<MergePreview> {
  return withSystem(pool, async (tx) => {
    const crewRows = await tx.query<{ id: string; name: string; user_id: string }>(
      `SELECT c.id, c.name, cm.user_id
       FROM crew_members cm JOIN crews c ON c.id = cm.crew_id
       WHERE cm.user_id = ANY($1) AND cm.status = 'active'
       ORDER BY c.name`,
      [[anonUid, existingUid]],
    );
    const tripRows = await tx.query<{
      id: string;
      destination_id: string | null;
      start_date: string | null;
      user_id: string;
    }>(
      `SELECT t.id, t.destination_id, t.start_date, tp.user_id
       FROM trip_participants tp JOIN trips t ON t.id = tp.trip_id
       WHERE tp.user_id = ANY($1)
       ORDER BY t.start_date NULLS LAST`,
      [[anonUid, existingUid]],
    );
    return {
      crews: crewRows.rows.map((row) => ({
        id: row.id,
        name: row.name,
        owner: row.user_id === anonUid ? ('anon' as const) : ('existing' as const),
      })),
      trips: tripRows.rows.map((row) => ({
        id: row.id,
        destinationId: row.destination_id,
        startDate: row.start_date,
        owner: row.user_id === anonUid ? ('anon' as const) : ('existing' as const),
      })),
      critters: [],
      stamps: [],
    };
  });
}

/** Applies one registered merge rule inside the caller's transaction. */
async function applyMergeRule(
  tx: pg.PoolClient,
  rule: {
    table: string;
    userColumn: string;
    strategy: string;
    conflictColumns?: readonly string[];
    viaFunction?: string;
  },
  anonUid: string,
  existingUid: string,
): Promise<void> {
  // Table/column/function names come only from the compiled-in registry
  // (packages/db/src/merge-rules.ts), never from request input: safe to inline into the query text.
  const table = rule.table;
  const col = rule.userColumn;
  if (rule.strategy === 'union' || rule.strategy === 'reassign') {
    if (rule.conflictColumns && rule.conflictColumns.length > 0) {
      const joinClause = rule.conflictColumns.map((c) => `a."${c}" = e."${c}"`).join(' AND ');
      await tx.query(
        `DELETE FROM "${table}" a USING "${table}" e
         WHERE a."${col}" = $1 AND e."${col}" = $2 AND ${joinClause}`,
        [anonUid, existingUid],
      );
    }
    await tx.query(`UPDATE "${table}" SET "${col}" = $2 WHERE "${col}" = $1`, [
      anonUid,
      existingUid,
    ]);
    return;
  }
  // keep_existing | drop: the anon row never wins a conflict and carries nothing forward. A table
  // locked down tighter than app_system's own grants (fair_use_counters) goes through its dedicated
  // SECURITY DEFINER function instead of a raw DELETE.
  if (rule.viaFunction) {
    await tx.query(`SELECT app.${rule.viaFunction}($1)`, [anonUid]);
    return;
  }
  await tx.query(`DELETE FROM "${table}" WHERE "${col}" = $1`, [anonUid]);
}

interface InternalAdapterSession {
  readonly id: string;
  readonly token: string;
}

interface InternalAdapterLike {
  deleteUserSessions(userId: string): Promise<void>;
  deleteUser(userId: string): Promise<void>;
  createSession(
    userId: string,
    dontRememberMe?: boolean,
  ): Promise<InternalAdapterSession & Record<string, unknown>>;
}

async function getInternalAdapter(auth: AuthInstance): Promise<InternalAdapterLike> {
  const context = (await auth.$context) as unknown as { internalAdapter: InternalAdapterLike };
  return context.internalAdapter;
}

export interface ExecuteMergeDeps {
  readonly appPool: pg.Pool;
  readonly auth: AuthInstance;
}

export interface ExecuteMergeResult {
  readonly sessionToken: string;
  readonly existingUid: string;
}

/**
 * Runs every registered merge rule against `anonUid` → `existingUid` in one transaction, revokes the
 * anonymous uid's sessions and device action keys, deletes the anonymous `auth.user` (cascades its
 * own `auth.session`/`auth.account` rows), and mints a fresh session for `existingUid` — the client
 * never holds a dead anonymous session (docs/api-contracts.md §5.1). A thrown error anywhere rolls
 * the whole transaction back: "partial failure rolls back fully".
 */
export async function executeMerge(
  anonUid: string,
  existingUid: string,
  deps: ExecuteMergeDeps,
): Promise<ExecuteMergeResult> {
  await withSystem(deps.appPool, async (tx) => {
    for (const rule of listMergeRules()) {
      await applyMergeRule(tx, rule, anonUid, existingUid);
    }
    // The anon uid's own `public.users` row (and `device_action_keys`, once T9 lands) carries no
    // useful data of its own once every registered table has been reassigned/dropped above; deleted
    // here rather than left orphaned once `auth.user` (below) is gone. A SAVEPOINT is required, not
    // just a JS try/catch: Postgres marks the whole transaction aborted on any statement error
    // regardless of whether the client catches it, so every later statement in this same tx would
    // otherwise fail with "current transaction is aborted" once T9's table does not exist yet.
    await tx.query('SAVEPOINT before_device_action_keys');
    try {
      await tx.query('DELETE FROM device_action_keys WHERE user_id = $1', [anonUid]);
      await tx.query('RELEASE SAVEPOINT before_device_action_keys');
    } catch (error) {
      if (!(error instanceof Error) || !/relation .* does not exist/i.test(error.message))
        throw error;
      await tx.query('ROLLBACK TO SAVEPOINT before_device_action_keys');
    }
    await tx.query('DELETE FROM users WHERE id = $1', [anonUid]);
    await enqueueRealtime(tx, {
      channel: userChannel(anonUid),
      payload: { reason: 'merged', into_uid: existingUid },
      kind: 'disconnect',
    });
    await appendDomainEvent(tx, {
      type: 'auth.merged',
      aggregateKind: 'user',
      aggregateId: existingUid,
      actorKind: 'user',
      actorId: existingUid,
      payload: { from_uid: anonUid, into_uid: existingUid },
    });
  });

  const internalAdapter = await getInternalAdapter(deps.auth);
  await internalAdapter.deleteUserSessions(anonUid);
  await internalAdapter.deleteUser(anonUid);
  const session = await internalAdapter.createSession(existingUid);
  return { sessionToken: session.token, existingUid };
}

/**
 * Better Auth signs its own session cookie value as `${token}.${base64(HMAC-SHA256(token, secret))}`
 * (verified against the installed `better-call` 1.4.0 `signCookieValue` source, which is the primitive
 * `setSessionCookie` calls) before storing it — a client presenting a bare, unsigned token as the
 * cookie value fails Better Auth's own signature check. `internalAdapter.createSession` only returns
 * the bare token (no supported public API signs an arbitrary token outside of an active endpoint
 * request), so the merge route mints this signature itself to hand back a cookie value that works
 * immediately, without depending on `better-call`'s unexported internals.
 */
export function signBetterAuthSessionCookie(token: string, secret: string): string {
  const signature = createHmac('sha256', secret).update(token).digest('base64');
  return `${token}.${signature}`;
}

/** Constant-time comparison of the caller's current session id against the ticket's `anonSessionId` claim. */
export function sessionMatchesTicket(
  currentSessionId: string,
  ticketAnonSessionId: string,
): boolean {
  const a = Buffer.from(currentSessionId, 'utf8');
  const b = Buffer.from(ticketAnonSessionId, 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}
