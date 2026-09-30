/**
 * What closing an account needs from the app's Better Auth instance (docs/data-model.md §3.1):
 * end every session (Postgres and the Redis mirror, through the adapter, so the very next call is
 * unauthenticated), revoke the Apple and Google refresh tokens captured at sign-in, and name the
 * channel the confirmation goes to, masked. Raw `auth.*` writes are never made from here: the
 * adapter is the one supported seam (services/api/src/auth/social/revoke.ts).
 */
import type { crypto as dbCrypto } from '@cp/db';
import { maskEmail, maskPhone } from '@cp/domain';

import type { AuthModule } from '../auth';
import { buildAppleSiwaConfigFromEnv } from '../auth/bootstrap';
import { revokeApple, revokeGoogle } from '../auth/social/revoke';

type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

export interface AccountContact {
  readonly kind: 'email' | 'phone' | 'none';
  readonly masked: string | null;
}

export interface AccountAuthControl {
  endSessions(uid: string): Promise<void>;
  /** `null` when every linked provider was revoked (or none was linked); else what failed. */
  revokeProviders(uid: string): Promise<string | null>;
  contact(uid: string): Promise<AccountContact>;
}

interface AuthUserRecord {
  readonly email: string;
  readonly emailVerified?: boolean | null;
  readonly isAnonymous?: boolean | null;
  readonly phoneNumber?: string | null;
}

interface InternalAdapter {
  findUserById(id: string): Promise<AuthUserRecord | null>;
  deleteUserSessions(userId: string): Promise<void>;
  findAccountByUserId(
    userId: string,
  ): Promise<{ readonly providerId: string; readonly refreshToken?: string | null }[]>;
}

const PLACEHOLDER_EMAIL = /@anonymous\.placeholder\.invalid$/;

export function createAccountAuthControl(
  auth: AuthModule['auth'],
  env: Parameters<typeof buildAppleSiwaConfigFromEnv>[0],
  keyring: FieldEncryptionKeyring | undefined,
): AccountAuthControl {
  const adapter = async () =>
    ((await auth.$context) as unknown as { internalAdapter: InternalAdapter }).internalAdapter;
  const apple = buildAppleSiwaConfigFromEnv(env);
  const http = { fetch: (input: string, init: RequestInit) => fetch(input, init) };

  return {
    async endSessions(uid) {
      await (await adapter()).deleteUserSessions(uid);
    },
    async revokeProviders(uid) {
      const linked = (await (await adapter()).findAccountByUserId(uid)).filter((account) =>
        Boolean(account.refreshToken),
      );
      const failures: string[] = [];
      for (const { providerId } of linked) {
        if (providerId !== 'apple' && providerId !== 'google') continue;
        if (keyring === undefined) {
          failures.push(`${providerId}_unconfigured`);
          continue;
        }
        try {
          if (providerId === 'google') await revokeGoogle(uid, { auth, keyring, http });
          else if (apple === undefined) failures.push('apple_unconfigured');
          else {
            await revokeApple(uid, {
              auth,
              keyring,
              clientSecretConfig: apple.clientSecretConfig,
              http,
            });
          }
        } catch {
          failures.push(providerId);
        }
      }
      return failures.length === 0 ? null : failures.join(',');
    },
    async contact(uid) {
      const user = await (await adapter()).findUserById(uid);
      if (user === null || user.isAnonymous === true) return { kind: 'none', masked: null };
      if (user.emailVerified === true && !PLACEHOLDER_EMAIL.test(user.email)) {
        return { kind: 'email', masked: maskEmail(user.email) };
      }
      if (user.phoneNumber) return { kind: 'phone', masked: maskPhone(user.phoneNumber) };
      return { kind: 'none', masked: null };
    },
  };
}
