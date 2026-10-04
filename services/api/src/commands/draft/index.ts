/**
 * Drafting commands: start and cancel a draft, redraft a day, keep or revert it, restore a draft,
 * and the organiser's own plan before and beside the guide's (its days, her edits).
 */
import type { CommandRegistry } from '../_framework/registry';
import { cancelDraftCommand } from './cancel-draft';
import { ensurePlanDaysCommand } from './ensure-plan-days';
import { keepRedraftCommand } from './keep-redraft';
import { requestRedraftCommand } from './request-redraft';
import { restoreDraftVersionCommand } from './restore-draft-version';
import { revertRedraftCommand } from './revert-redraft';
import { startDraftCommand } from './start-draft';

export function registerDraftCommands(registry: CommandRegistry): void {
  registry.register(startDraftCommand);
  registry.register(cancelDraftCommand);
  registry.register(requestRedraftCommand);
  registry.register(keepRedraftCommand);
  registry.register(revertRedraftCommand);
  registry.register(restoreDraftVersionCommand);
  registry.register(ensurePlanDaysCommand);
}
