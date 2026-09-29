/** Drafting commands: start and cancel a draft, redraft a day, keep or revert it, restore a draft. */
import type { CommandRegistry } from '../_framework/registry';
import { cancelDraftCommand } from './cancel-draft';
import { startDraftCommand } from './start-draft';

export function registerDraftCommands(registry: CommandRegistry): void {
  registry.register(startDraftCommand);
  registry.register(cancelDraftCommand);
}
