/**
 * Better Auth `databaseHooks` (docs/data-model.md §3.1 Requirements table: "database hook in the
 * same tx"). True cross-role transactional atomicity between Better Auth's own `auth.user` insert
 * and this module's `public.users`/`user_settings` insert is not achievable through Better Auth's
 * public hook API: the hook runs as a follow-up call after Better Auth's adapter has already
 * committed the `auth.user` row, over a *different* Postgres role/connection than
 * `packages/db`'s `withSystem`. If this insert fails, `/sign-in/anonymous` (or the phone/social
 * flow that created the user) surfaces an error to the client — which never received a session — so
 * the orphaned `auth.user` row is harmless and inert; it is never referenced by a session a client
 * holds. Documented as a residual risk in this phase's report rather than papered over.
 */
import type { BetterAuthOptions } from 'better-auth';
import type pg from 'pg';

import { withSystem } from '@cp/db';

export interface HooksDeps {
  readonly appPool: pg.Pool;
}

interface CreatedUser {
  readonly id: string;
  readonly isAnonymous?: boolean | null;
}

/** Inserts the matching `public.users` (+ default `user_settings`) row for a just-created `auth.user`. */
export function buildUserCreateAfterHook(deps: HooksDeps): (user: CreatedUser) => Promise<void> {
  return async (user) => {
    const status = user.isAnonymous ? 'anonymous' : 'registered';
    await withSystem(deps.appPool, async (tx) => {
      await tx.query(
        `INSERT INTO users (id, status) VALUES ($1, $2)
         ON CONFLICT (id) DO NOTHING`,
        [user.id, status],
      );
      await tx.query(
        `INSERT INTO user_settings (user_id) VALUES ($1)
         ON CONFLICT (user_id) DO NOTHING`,
        [user.id],
      );
    });
  };
}

export function buildDatabaseHooks(
  deps: HooksDeps,
): NonNullable<BetterAuthOptions['databaseHooks']> {
  const onUserCreated = buildUserCreateAfterHook(deps);
  return {
    user: {
      create: {
        after: async (user) => {
          await onUserCreated(user);
        },
      },
    },
  };
}

interface CreatedVerification {
  readonly id: string;
  readonly identifier: string;
}

/**
 * Captures Better Auth's own `auth.verification.id` the instant a phone OTP row is created, keyed
 * by identifier (the phone number) — read back once, synchronously within the same request, by
 * services/api/src/auth/index.ts's `sendOTP` wrapper so the OTP delivery tracker
 * (services/api/src/auth/otp/router.ts) can carry the real verification id rather than inventing
 * one. In-memory only (not Redis): `send-otp`'s `createVerificationValue` → `sendOTP` call happens
 * in one synchronous request, so nothing here needs to survive a process restart.
 */
export function buildVerificationCreateAfterHook(): {
  hook: (verification: CreatedVerification) => void;
  consumePendingVerificationId: (identifier: string) => string | undefined;
} {
  const pendingByIdentifier = new Map<string, string>();
  return {
    hook: (verification) => {
      pendingByIdentifier.set(verification.identifier, verification.id);
    },
    consumePendingVerificationId: (identifier) => {
      const id = pendingByIdentifier.get(identifier);
      pendingByIdentifier.delete(identifier);
      return id;
    },
  };
}
