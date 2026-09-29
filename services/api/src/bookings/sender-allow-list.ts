/**
 * Who may import into a crew by email: the crew's active members, recognised by the address the
 * mail came from. A sender is a member when it is
 * - the verified email of their CritterPass account (Better Auth), or
 * - their Apple private relay address (`@privaterelay.appleid.com`): only Apple hands an account
 *   such an address, so the account's own relay email matching exactly is proof enough, or
 * - an address they linked themselves by entering the code the "Link this email?" reply sent it.
 * Anyone else is unknown and their mail waits in quarantine. Addresses are compared lower-cased,
 * and stored only as peppered HMAC hashes.
 */
import { crypto as dbCrypto } from '@cp/db';
import type pg from 'pg';

export const APPLE_RELAY_DOMAIN = 'privaterelay.appleid.com';

export interface SenderAccount {
  readonly uid: string;
  readonly email: string;
  readonly emailVerified: boolean;
}

/** Finds the account whose sign-in email is `email` (lower-case), or null. */
export type AccountLookup = (email: string) => Promise<SenderAccount | null>;

export type SenderMatch =
  | { readonly kind: 'member'; readonly uid: string; readonly via: 'account' | 'relay' | 'linked' }
  | { readonly kind: 'unknown' };

const ADDRESS = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/u;

/** The bare address of a From value (`Maya Tan <Maya@Example.com>` → `maya@example.com`). */
export function normalizeSender(raw: string): string | null {
  const bracketed = /<([^<>]+)>\s*$/u.exec(raw)?.[1];
  const address = (bracketed ?? raw).trim().toLowerCase();
  return ADDRESS.test(address) ? address : null;
}

export function isAppleRelay(address: string): boolean {
  return address.endsWith(`@${APPLE_RELAY_DOMAIN}`);
}

export function senderHash(address: string, pepper: string): string {
  return dbCrypto.hashWithPepper(`sender:${address}`, pepper);
}

/** Whether the account proves `address` is its owner's. */
export function accountOwnsAddress(address: string, account: SenderAccount): boolean {
  if (account.email.toLowerCase() !== address) return false;
  return account.emailVerified || isAppleRelay(address);
}

async function activeMember(tx: pg.PoolClient, crewId: string, uid: string): Promise<boolean> {
  const { rowCount } = await tx.query(
    "SELECT 1 FROM crew_members WHERE crew_id = $1 AND user_id = $2 AND status = 'active'",
    [crewId, uid],
  );
  return (rowCount ?? 0) > 0;
}

/** Resolves a sender for a crew, in the system role's transaction. */
export async function resolveSender(
  tx: pg.PoolClient,
  input: { readonly address: string; readonly crewId: string; readonly hash: string },
  lookup: AccountLookup,
): Promise<SenderMatch> {
  const account = await lookup(input.address);
  if (
    account !== null &&
    accountOwnsAddress(input.address, account) &&
    (await activeMember(tx, input.crewId, account.uid))
  ) {
    return {
      kind: 'member',
      uid: account.uid,
      via: isAppleRelay(input.address) ? 'relay' : 'account',
    };
  }
  const { rows } = await tx.query<{ user_id: string }>(
    `SELECT l.user_id FROM inbound_sender_links l
       JOIN crew_members m ON m.user_id = l.user_id AND m.crew_id = $2 AND m.status = 'active'
      WHERE l.sender_hash = $1 AND l.verified_at IS NOT NULL
      ORDER BY l.verified_at DESC LIMIT 1`,
    [input.hash, input.crewId],
  );
  const linked = rows[0]?.user_id;
  return linked === undefined
    ? { kind: 'unknown' }
    : { kind: 'member', uid: linked, via: 'linked' };
}

interface BetterAuthLike {
  readonly $context: Promise<unknown>;
}

interface InternalAdapterLike {
  findUserByEmail(
    email: string,
  ): Promise<{ user: { id: string; email: string; emailVerified: boolean } } | null>;
}

/** The lookup over Better Auth's own adapter (the only supported read of `auth.user`). */
export function betterAuthAccountLookup(auth: BetterAuthLike): AccountLookup {
  return async (email) => {
    const context = (await auth.$context) as { internalAdapter: InternalAdapterLike };
    const found = await context.internalAdapter.findUserByEmail(email);
    if (found === null) return null;
    return { uid: found.user.id, email: found.user.email, emailVerified: found.user.emailVerified };
  };
}
