/**
 * Quest commands, registered on the one command registry at boot, and the hook that queues
 * `quest.evaluate` for the events this process appends that a quest or an XP source reads
 * (visits, expenses, settling up).
 */
import { onEventAppended, queueQuestsOnTripStart, sendInTx } from '@cp/db';
import { QUEST_INPUT_EVENTS, QUEST_QUEUES } from '@cp/domain';
import type pg from 'pg';

import type { CommandRegistry } from '../_framework/registry';
import { grantQuestRewardCommand } from './grant-quest-reward';
import { signupQuestCommand } from './signup-quest';

export function registerQuestCommands(registry: CommandRegistry): void {
  registry.register(signupQuestCommand);
  registry.register(grantQuestRewardCommand);
}

export async function questEventHook(
  tx: pg.PoolClient,
  event: { readonly id: string; readonly type: string; readonly tripId: string | null },
): Promise<void> {
  if (event.tripId === null || !QUEST_INPUT_EVENTS.has(event.type)) return;
  await sendInTx(tx, QUEST_QUEUES.evaluate, { event_id: event.id }, { singletonKey: event.id });
}

let hooked = false;

/** The quests' api mount: the commands, and the hook on the events quests read. */
export function registerQuests(doors: { readonly registry: CommandRegistry }): void {
  registerQuestCommands(doors.registry);
  if (hooked) return;
  hooked = true;
  onEventAppended(questEventHook);
  // A trip that turns in_trip gets its day's quests at once, not at the next hourly sweep.
  onEventAppended(queueQuestsOnTripStart);
}
