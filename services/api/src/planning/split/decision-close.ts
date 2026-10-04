/**
 * Settles a split's decision vote when it closes in the api (the last ballot needed): the winning
 * way applies and the others are rejected (`@cp/db` `settleSplitDecision`, shared with the
 * worker, which settles a close by deadline the same way and exactly once).
 */
import { onEventAppended, splitDecisionEventHook } from '@cp/db';

import type { PlanningModule } from '../register';

let hooked = false;

export const splitDecisionHooks: PlanningModule = () => {
  if (hooked) return;
  hooked = true;
  onEventAppended(splitDecisionEventHook);
};
