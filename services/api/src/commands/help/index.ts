/** Help centre commands: feedback, the idea board and the rating-prompt log. */
import type { CommandRegistry } from '../_framework/registry';
import { recordRatingPromptCommand } from './record-rating-prompt';
import { submitFeedbackCommand } from './submit-feedback';
import { submitIdeaCommand } from './submit-idea';
import { unvoteIdeaCommand, voteIdeaCommand } from './vote-idea';

export function registerHelpCommands(registry: CommandRegistry): void {
  registry.register(submitFeedbackCommand);
  registry.register(submitIdeaCommand);
  registry.register(voteIdeaCommand);
  registry.register(unvoteIdeaCommand);
  registry.register(recordRatingPromptCommand);
}
