/** Crew chat commands, registered on the one command registry at boot. */
import type { CommandRegistry } from '../_framework/registry';
import { deleteMessageCommand } from './delete-message';
import { editMessageCommand } from './edit-message';
import { markReadCommand } from './mark-read';
import './moderation-kind';
import { muteMemberCommand } from './mute-member';
import { reactMessageCommand } from './react-message';
import { reportMessageCommand } from './report-message';
import { sendMessageCommand } from './send-message';

export function registerChatCommands(registry: CommandRegistry): void {
  registry.register(sendMessageCommand);
  registry.register(editMessageCommand);
  registry.register(deleteMessageCommand);
  registry.register(reactMessageCommand);
  registry.register(markReadCommand);
  registry.register(reportMessageCommand);
  registry.register(muteMemberCommand);
}
