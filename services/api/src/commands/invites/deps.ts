/**
 * Runtime configuration the invite commands need: the link environment (hosts), the seat-token
 * keyring (mint and verify personal links), the field-encryption keyring (invite prefill) and the
 * phone pepper (the prefill's phone hash). Personal invites need all three secrets; without them
 * only generic crew and trip invites can be made.
 */
import { createHash } from 'node:crypto';

import type { crypto as dbCrypto } from '@cp/db';
import type { LinkEnvironment, SeatTokenKeyring } from '@cp/domain';

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
