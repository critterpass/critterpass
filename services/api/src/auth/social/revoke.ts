/**
 * Revokes a previously captured provider refresh token for a uid (docs/data-model.md §3.1: Apple and
 * Google refresh tokens are revoked on account deletion and unlink). Reads/writes `auth.account`
 * through Better Auth's own `internalAdapter` (`auth.$context`), never raw SQL: the `auth` Postgres
 * schema grants only the dedicated `auth` role (packages/db/migrations/*_auth_schema.sql), so this is
 * the one supported seam for system code to touch it.
 */
import { crypto as dbCrypto } from '@cp/db';

import type { AuthInstance } from '../config';

import { revokeAppleToken, type AppleClientSecretConfig, type AppleHttpClient } from './apple';
import { revokeGoogleToken, type GoogleHttpClient } from './google';

const { decryptField } = dbCrypto;
type FieldEncryptionKeyring = dbCrypto.FieldEncryptionKeyring;

interface InternalAdapterAccount {
  readonly id: string;
  readonly providerId: string;
  readonly refreshToken?: string | null;
}

interface InternalAdapterLike {
  findAccountByUserId(userId: string): Promise<InternalAdapterAccount[]>;
  updateAccount(id: string, data: Record<string, unknown>): Promise<unknown>;
}

async function getInternalAdapter(auth: AuthInstance): Promise<InternalAdapterLike> {
  const context = (await auth.$context) as unknown as { internalAdapter: InternalAdapterLike };
  return context.internalAdapter;
}

async function findProviderAccount(
  auth: AuthInstance,
  uid: string,
  providerId: 'apple' | 'google',
): Promise<InternalAdapterAccount | undefined> {
  const internalAdapter = await getInternalAdapter(auth);
  const accounts = await internalAdapter.findAccountByUserId(uid);
  return accounts.find((account) => account.providerId === providerId);
}

/** Clears the stored refresh token once revoked, so a later deletion/unlink pass never revokes twice. */
async function clearStoredRefreshToken(auth: AuthInstance, accountId: string): Promise<void> {
  const internalAdapter = await getInternalAdapter(auth);
  await internalAdapter.updateAccount(accountId, { refreshToken: null });
}

export interface RevokeAppleDeps {
  readonly auth: AuthInstance;
  readonly keyring: FieldEncryptionKeyring;
  readonly clientSecretConfig: AppleClientSecretConfig;
  readonly http: AppleHttpClient;
}

/** No-ops when the uid never linked Apple or never had a refresh token captured (idToken-only link never gets one). */
export async function revokeApple(uid: string, deps: RevokeAppleDeps): Promise<void> {
  const account = await findProviderAccount(deps.auth, uid, 'apple');
  if (!account?.refreshToken) return;
  const refreshToken = decryptField(account.refreshToken, deps.keyring);
  await revokeAppleToken(refreshToken, deps.clientSecretConfig, deps.http);
  await clearStoredRefreshToken(deps.auth, account.id);
}

export interface RevokeGoogleDeps {
  readonly auth: AuthInstance;
  readonly keyring: FieldEncryptionKeyring;
  readonly http: GoogleHttpClient;
}

export async function revokeGoogle(uid: string, deps: RevokeGoogleDeps): Promise<void> {
  const account = await findProviderAccount(deps.auth, uid, 'google');
  if (!account?.refreshToken) return;
  const refreshToken = decryptField(account.refreshToken, deps.keyring);
  await revokeGoogleToken(refreshToken, deps.http);
  await clearStoredRefreshToken(deps.auth, account.id);
}
