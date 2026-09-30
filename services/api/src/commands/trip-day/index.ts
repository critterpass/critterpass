/** Trip day commands, registered on the one command registry at boot. */
import { onEventAppended } from '@cp/db';

import { registerTripDayBundleSection } from '../../routes/offline-bundle';
import type { CommandRegistry } from '../_framework/registry';
import { enqueueLeaveByRecompute } from './hooks';
import { actBriefingItemCommand } from './act-briefing-item';
import { mirrorAlarmStateCommand } from './mirror-alarm-state';
import {
  addPackingItemCommand,
  checkPackingItemCommand,
  removePackingItemCommand,
} from './packing';
import { reportRunningLateCommand } from './report-running-late';
import { setLeaveByBufferCommand } from './set-leave-by-buffer';
import { setReadinessCommand } from './set-readiness';
import { snoozeLeaveByCommand } from './snooze-leave-by';

export function registerTripDayCommands(registry: CommandRegistry): void {
  registry.register(setReadinessCommand);
  registry.register(snoozeLeaveByCommand);
  registry.register(checkPackingItemCommand);
  registry.register(addPackingItemCommand);
  registry.register(removePackingItemCommand);
  registry.register(actBriefingItemCommand);
  registry.register(reportRunningLateCommand);
  registry.register(setLeaveByBufferCommand);
  registry.register(mirrorAlarmStateCommand);
}

/**
 * The trip day's api mount: its commands, the day bundles in `GET /v1/trips/{id}/offline-bundle`,
 * and the recompute its leave-bys need after plan, flight and trip events the api appends (the
 * worker hooks the ones it appends itself).
 */
export function registerTripDay(doors: { readonly registry: CommandRegistry }): void {
  registerTripDayCommands(doors.registry);
  registerTripDayBundleSection();
  onEventAppended(enqueueLeaveByRecompute);
}
