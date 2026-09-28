/** Nudge commands: `send_nudge` needs the link environment for the share-sheet relay's link. */
import type { CommandRegistry } from '../_framework/registry';
import { recordAppOpenCommand } from './record-app-open';
import { createSendNudgeCommand, type SendNudgeDeps } from './send-nudge';

export function registerNudgeCommands(registry: CommandRegistry, deps: SendNudgeDeps): void {
  registry.register(createSendNudgeCommand(deps));
  registry.register(recordAppOpenCommand);
}
