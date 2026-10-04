/**
 * Ideas on the api: the save, remove and hide commands, and the hook that seeds a trip's Ideas
 * when it gets its destination or a member joins.
 */
import { onEventAppended } from '@cp/db';

import { registerIdeaCommands } from '../../commands/ideas';
import type { PlanningModule } from '../register';
import { ideasSeedEventHook } from './seed';

let hooked = false;

export const ideasModule: PlanningModule = ({ doors }) => {
  registerIdeaCommands(doors.registry);
  if (hooked) return;
  hooked = true;
  onEventAppended(ideasSeedEventHook);
};
