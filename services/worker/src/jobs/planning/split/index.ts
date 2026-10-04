/**
 * A split's decision vote that closes by its deadline (the poll close job) settles here: the
 * winning way applies and the others are rejected, through the same `@cp/db` code the api runs
 * for a close by ballot, so a poll settles exactly once whichever process closes it. No job of
 * its own: the hook runs in the close's transaction.
 */
import { onEventAppended, splitDecisionEventHook } from '@cp/db';

import type { AnyJobDefinition } from '../../../boss';

let hooked = false;

export function splitDecisionJobs(): readonly AnyJobDefinition[] {
  if (!hooked) {
    hooked = true;
    onEventAppended(splitDecisionEventHook);
  }
  return [];
}
