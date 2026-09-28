/**
 * Runtime configuration the invite commands need: the link environment (hosts), the seat-token
 * keyring (mint and verify personal links), the field-encryption keyring (invite prefill) and the
 * phone pepper (the prefill's phone hash). Personal invites need all three secrets; without them
 * only generic crew and trip invites can be made.
 */
import { createHash } from 'node:crypto';

import type { crypto as dbCrypto } from '@cp/db';
import { seatTokenKeyringFromJson, type LinkEnvironment, type SeatTokenKeyring } from '@cp/domain';

export interface InviteCommandDeps {
  readonly linkEnv: LinkEnvironment;
  readonly seatKeyring: SeatTokenKeyring | null;
  readonly fieldKeyring: dbCrypto.FieldEncryptionKeyring | null;
  readonly phonePepper: string | null;
}

/** Seat tokens carry 128 random bits, so a plain SHA-256 is enough to look one up by. */
export function seatTokenHash(seat: string): string {
  return createHash('sha256').update(seat).digest('hex');
}

export interface InviteEnv {
  readonly SEAT_TOKEN_KEYS?: string | undefined;
  readonly SEAT_TOKEN_ACTIVE_KID?: string | undefined;
  readonly PHONE_HASH_PEPPER?: string | undefined;
}

/** The deps from the api's environment; a missing secret turns personal invites off, never fakes one. */
export function inviteDepsFromEnv(
  env: InviteEnv,
  linkEnv: LinkEnvironment,
  fieldKeyring: dbCrypto.FieldEncryptionKeyring | null | undefined,
): InviteCommandDeps {
  return {
    linkEnv,
    seatKeyring:
      env.SEAT_TOKEN_KEYS !== undefined && env.SEAT_TOKEN_ACTIVE_KID !== undefined
        ? seatTokenKeyringFromJson(env.SEAT_TOKEN_KEYS, env.SEAT_TOKEN_ACTIVE_KID)
        : null,
    fieldKeyring: fieldKeyring ?? null,
    phonePepper: env.PHONE_HASH_PEPPER ?? null,
  };
}
