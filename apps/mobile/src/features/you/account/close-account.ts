/**
 * Closing the account from this phone, in the one order that is safe: the server closes it first,
 * and only an answer that it did (`applied`) lets anything on the phone change. A command that was
 * queued, refused or never reached the server leaves the phone exactly as it was.
 */
/* eslint-disable lingui/no-unlocalized-strings -- result kinds, wire values and test ids, never copy. */
import type { DeletionReason } from '@cp/domain';

import type { SendResult } from '@/data/commands/client';

import { closedAccountOf, type ClosedAccount } from './account-api';

export type CloseOutcome =
  { readonly kind: 'closed'; readonly account: ClosedAccount } | { readonly kind: 'not_closed' };

export async function closeAccount(
  send: (payload: { reason?: DeletionReason }) => Promise<SendResult>,
  reason: DeletionReason | null,
): Promise<CloseOutcome> {
  let result: SendResult;
  try {
    result = await send(reason === null ? {} : { reason });
  } catch {
    return { kind: 'not_closed' };
  }
  if (result.kind !== 'applied') return { kind: 'not_closed' };
  return { kind: 'closed', account: closedAccountOf(result.result) };
}
