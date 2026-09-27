/**
 * Identity guards and session-revocation fan-out (docs/data-model.md §3.1 Requirements table:
 * "Sessions", "Account state"; docs/product-decisions.md's anonymous-first default: sign-in required
 * before purchase, before sending an invite, and on a second device; this phase's Requirements:
 * "isAnonGcCandidate rule fn").
 */
import { enqueueRealtime, withSystem } from '@cp/db';
import { DomainError, userChannel } from '@cp/domain';
import type pg from 'pg';

import { revokeActionKeysForUser } from './action-keys/revoke';

export interface GuardSession {
  readonly user: { readonly id: string; readonly isAnonymous?: boolean | null };
  readonly session: { readonly id: string };
}

/** `AUTH_REQUIRED` when no session at all — the baseline every other guard builds on. */
export function requireSession(session: GuardSession | null | undefined): GuardSession {
  if (!session) throw new DomainError('AUTH_REQUIRED');
  return session;
}

export type RequireRegisteredReason = 'purchase' | 'send_invite' | 'second_device';

/**
 * `AUTH_REQUIRED` with `detail.reason` when the session is anonymous (docs/product-decisions.md's
 * anonymous-first default: sign-in required before purchase, sending an invite, or using a second
 * device). Used by later phases' own command handlers, not called from anywhere in this phase.
 */
export function requireRegistered(
  session: GuardSession | null | undefined,
  reason: RequireRegisteredReason,
): GuardSession {
  const active = requireSession(session);
  if (active.user.isAnonymous) throw new DomainError('AUTH_REQUIRED', { reason });
  return active;
}

/** `ACCOUNT_CLOSED` when the uid has an open (unrestored, unpurged) `account_deletions` row. */
export async function rejectClosedAccount(pool: pg.Pool, userId: string): Promise<void> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query(
      'SELECT 1 FROM account_deletions WHERE user_id = $1 AND restored_at IS NULL AND purged_at IS NULL',
      [userId],
    ),
  );
  if (rows.length > 0) throw new DomainError('ACCOUNT_CLOSED');
}

/**
 * Session revocation fan-out (docs/data-model.md §3.1: "sign-out / revoke-sessions → `rt_outbox`
 * `session.revoked` on `user:#uid` + revoke device action keys"). Called from `hooks.after` on
 * `/sign-out`, `/revoke-session` and `/revoke-sessions` — Better Auth's own handler has already
 * deleted the session row by the time this runs; `ctx.context.session` still carries the pre-deletion
 * uid (loaded before the handler ran: by `sessionMiddleware` on the revoke endpoints, by the auth
 * `hooks.before` on `/sign-out`), which is all this needs.
 */
export async function fanOutSessionRevoked(pool: pg.Pool, userId: string): Promise<void> {
  await withSystem(pool, (tx) =>
    enqueueRealtime(tx, {
      channel: userChannel(userId),
      payload: { type: 'session.revoked' },
      kind: 'disconnect',
    }),
  );
  await revokeActionKeysForUser(pool, userId);
}

const ANON_GC_INACTIVE_DAYS = 90;

export interface AnonGcCandidateInput {
  readonly lastActiveAt: Date;
  readonly hasCrews: boolean;
  readonly hasPurchases: boolean;
}

/**
 * `maint.anon_gc` (a later phase's cron) reaps an anonymous uid once it has been inactive 90 d, has
 * no crew, and has never purchased anything — this function is the pure rule the cron applies per
 * candidate row; it does not query anything itself.
 */
export function isAnonGcCandidate(
  input: AnonGcCandidateInput,
  now: () => number = Date.now,
): boolean {
  const inactiveMs = now() - input.lastActiveAt.getTime();
  const inactiveThresholdMs = ANON_GC_INACTIVE_DAYS * 24 * 60 * 60 * 1000;
  return inactiveMs >= inactiveThresholdMs && !input.hasCrews && !input.hasPurchases;
}
