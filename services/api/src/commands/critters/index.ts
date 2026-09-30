/** Critter commands, registered on the one command registry at boot. */
import { onEventAppended, sendInTx } from '@cp/db';
import { critterJobsForEvent } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';
import { befriendCritterCommand } from './befriend-critter';
import { endEncounterCommand } from './end-encounter';
import { hatchEggCommand } from './hatch-egg';
import { reportEncounterSamplesCommand } from './report-encounter-samples';
import { setExploreAtHomeCommand } from './set-explore-at-home';
import { setGuideSkinCommand } from './set-guide-skin';
import { setLegendaryReminderCommand } from './set-legendary-reminder';
import { startEncounterCommand } from './start-encounter';

export function registerCritterCommands(registry: CommandRegistry): void {
  registry.register(hatchEggCommand);
  registry.register(startEncounterCommand);
  registry.register(reportEncounterSamplesCommand);
  registry.register(endEncounterCommand);
  registry.register(befriendCritterCommand);
  registry.register(setGuideSkinCommand);
  registry.register(setExploreAtHomeCommand);
  registry.register(setLegendaryReminderCommand);
}

/** Queues the egg grants and landed hatches the events this process appends call for. */
export async function critterEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  for (const job of critterJobsForEvent(event)) {
    await sendInTx(tx, job.queue, job.data, { singletonKey: job.singletonKey });
  }
}

/** The critters' api mount: the commands, and the hook on the boarding and landing events. */
export function registerCritters(doors: { readonly registry: CommandRegistry }): void {
  registerCritterCommands(doors.registry);
  onEventAppended(critterEventHook);
}
