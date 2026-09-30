/** Anchored plan comments and their +1s. */
import type { CommandRegistry } from '../_framework/registry';
import { addCommentCommand } from './add';
import { deleteCommentCommand } from './delete';
import { editCommentCommand } from './edit';
import { plusoneCommentCommand, unplusoneCommentCommand } from './plus-ones';

export function registerCommentCommands(registry: CommandRegistry): void {
  registry.register(addCommentCommand);
  registry.register(editCommentCommand);
  registry.register(deleteCommentCommand);
  registry.register(plusoneCommentCommand);
  registry.register(unplusoneCommentCommand);
}
