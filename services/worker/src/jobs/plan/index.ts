/**
 * Plan jobs: the stale sweep after every new group version and the approval vote's deadline timer.
 * Building them also registers the change review pushes and inbox items, so the worker entry mounts
 * the whole plan area with one call.
 */
import type { AnyJobDefinition } from '../../boss';
import { changesetExpiryJob } from './changeset-expiry';
import { registerPlanInboxFanouts } from './inbox';
import { registerPlanPushes } from './pushes';
import { staleSweepJob } from './stale-sweep';

export function planJobs(): AnyJobDefinition[] {
  registerPlanPushes();
  registerPlanInboxFanouts();
  return [staleSweepJob(), changesetExpiryJob()];
}
