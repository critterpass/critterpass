/** Inbox commands; `act_inbox_item` resolves its target commands through the same registry. */
import type { CommandRegistry } from '../_framework/registry';
import { createActInboxItemCommand } from './act-inbox-item';
import { markInboxReadCommand } from './mark-inbox-read';

export { enqueueInboxFanout, publishBadgeCounts } from './shared';

export function registerInboxCommands(registry: CommandRegistry): void {
  registry.register(createActInboxItemCommand(registry.resolve));
  registry.register(markInboxReadCommand);
}
