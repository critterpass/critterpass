/** Plan commands: direct edits, change review, comments, the personal overlay and calendar feeds. */
import type { CommandRegistry } from '../_framework/registry';
import { registerChangesetCommands } from '../changesets';
import { registerCommentCommands } from '../comments';
import { applyPlanOpsCommand } from './apply-plan-ops';

export function registerPlanCommands(registry: CommandRegistry): void {
  registry.register(applyPlanOpsCommand);
  registerChangesetCommands(registry);
  registerCommentCommands(registry);
}
