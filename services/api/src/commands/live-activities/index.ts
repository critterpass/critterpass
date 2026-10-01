/**
 * Live Activity commands and the api's half of the orchestration hook: every event the api
 * appends that moves an activity queues `la.orchestrate` in the same transaction (the worker hooks
 * the events it appends itself).
 */
import { onEventAppended, type KillSwitchReader } from '@cp/db';
import type pg from 'pg';

import { createKillSwitches } from '../../ops/kill-switches';
import type { CommandRegistry } from '../_framework/registry';
import { registerLaTokenCommand } from './register-la-token';
import { reportLaStateCommand } from './report-la-state';
import { requestCrewLockScreenCommand } from './request-crew-lock-screen';
import { enqueueLaOrchestrate } from './shared';

export { enqueueLaOrchestrate } from './shared';

export function registerLiveActivityCommands(
  registry: CommandRegistry,
  switches: Pick<KillSwitchReader, 'assertOn'>,
): void {
  registry.register(registerLaTokenCommand);
  registry.register(reportLaStateCommand);
  registry.register(requestCrewLockScreenCommand(switches));
}

let hooked = false;

/** The api mount: the commands, and the orchestration hook once per process. */
export function registerLiveActivities(doors: {
  readonly registry: CommandRegistry;
  readonly pool: pg.Pool;
}): void {
  registerLiveActivityCommands(doors.registry, createKillSwitches(doors.pool));
  if (!hooked) {
    hooked = true;
    onEventAppended(enqueueLaOrchestrate);
  }
}
