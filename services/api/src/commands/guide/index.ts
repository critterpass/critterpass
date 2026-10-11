/** Guide commands: queue, reword and cancel a question for the meter reset, rate an answer, ask for a custom phrase card, claim a guide offer. */
import type { CommandRegistry } from '../_framework/registry';
import { cancelQueuedQuestionCommand } from './cancel-queued-question';
import { claimGuideOfferCommand } from './claim-guide-offer';
import { editQueuedQuestionCommand } from './edit-queued-question';
import { queueGuideQuestionCommand } from './queue-guide-question';
import { rateGuideAnswerCommand } from './rate-guide-answer';
import { recordPhrasePracticeCommand } from './record-phrase-practice';
import { requestPhraseCardCommand } from './request-phrase-card';

export function registerGuideCommands(registry: CommandRegistry): void {
  registry.register(queueGuideQuestionCommand);
  registry.register(editQueuedQuestionCommand);
  registry.register(cancelQueuedQuestionCommand);
  registry.register(rateGuideAnswerCommand);
  registry.register(requestPhraseCardCommand);
  registry.register(claimGuideOfferCommand);
  registry.register(recordPhrasePracticeCommand);
}
