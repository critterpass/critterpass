/** Guide commands: queue and cancel a question for the meter reset, rate an answer. */
import type { CommandRegistry } from '../_framework/registry';
import { cancelQueuedQuestionCommand } from './cancel-queued-question';
import { queueGuideQuestionCommand } from './queue-guide-question';
import { rateGuideAnswerCommand } from './rate-guide-answer';

export function registerGuideCommands(registry: CommandRegistry): void {
  registry.register(queueGuideQuestionCommand);
  registry.register(cancelQueuedQuestionCommand);
  registry.register(rateGuideAnswerCommand);
}
