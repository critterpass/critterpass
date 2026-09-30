/** Change review: draft, toggle, send, approve and apply change sets; keep or drop personal ones. */
import type { CommandRegistry } from '../_framework/registry';
import { applyChangesetCommand } from './apply';
import { approveChangesetCommand } from './approve';
import { createChangesetCommand } from './create';
import { resolveOverlayClashCommand } from './resolve-overlay-clash';
import { sendChangesetCommand } from './send';
import { setChangesetItemCommand } from './set-item';

export function registerChangesetCommands(registry: CommandRegistry): void {
  registry.register(createChangesetCommand);
  registry.register(setChangesetItemCommand);
  registry.register(sendChangesetCommand);
  registry.register(approveChangesetCommand);
  registry.register(applyChangesetCommand);
  registry.register(resolveOverlayClashCommand);
}
