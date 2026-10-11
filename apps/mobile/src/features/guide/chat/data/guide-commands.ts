/**
 * Client specs for the guide's commands (docs/api-contracts.md §4.8): rating an answer, and the
 * 4b-1 queued question and its cancel. The plan card's commands are the plan area's. Queuing a question needs the server's meter, so it
 * is online only; the rest may wait in the offline queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire values, never copy. */
import type { EditQueuedQuestionPayload, QueueGuideQuestionPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const rateGuideAnswerCommand = defineClientCommand<{
  readonly message_id: string;
  readonly verdict: 'up' | 'down';
}>({
  name: 'rate_guide_answer',
  offline: true,
  summarize: () => msg({ id: 'guide.queued.rate', message: 'Rating a guide answer' }),
});

export const queueGuideQuestionCommand = defineClientCommand<QueueGuideQuestionPayload>({
  name: 'queue_guide_question',
  offline: false,
});

export const editQueuedQuestionCommand = defineClientCommand<EditQueuedQuestionPayload>({
  name: 'edit_queued_question',
  offline: true,
  summarize: () => msg({ id: 'guide.queued.edit', message: 'Rewording a question for midnight' }),
});

export const cancelQueuedQuestionCommand = defineClientCommand<{ readonly question_id: string }>({
  name: 'cancel_queued_question',
  offline: true,
  summarize: () =>
    msg({ id: 'guide.queued.cancel', message: 'Cancelling a question for midnight' }),
});
