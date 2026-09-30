/**
 * Client specs for the guide's commands (docs/api-contracts.md §4.6, §4.8): rating an answer,
 * the plan card's PROPOSE TO GROUP (`send_changeset`) and JUST ME (`apply_changeset`, personal),
 * and the 4b-1 queued question and its cancel. Queuing a question needs the server's meter, so it
 * is online only; the rest may wait in the offline queue.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and wire values, never copy. */
import type { QueueGuideQuestionPayload } from '@cp/domain';
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

export const sendChangesetCommand = defineClientCommand<{ readonly changeset_id: string }>({
  name: 'send_changeset',
  offline: true,
  summarize: () => msg({ id: 'guide.queued.propose', message: 'Plan change sent to the crew' }),
});

export const applyChangesetCommand = defineClientCommand<{
  readonly changeset_id: string;
  readonly scope: 'personal' | 'group';
}>({
  name: 'apply_changeset',
  offline: true,
  summarize: () => msg({ id: 'guide.queued.applyMine', message: 'Plan change for your own day' }),
});

export const queueGuideQuestionCommand = defineClientCommand<QueueGuideQuestionPayload>({
  name: 'queue_guide_question',
  offline: false,
});

export const cancelQueuedQuestionCommand = defineClientCommand<{ readonly question_id: string }>({
  name: 'cancel_queued_question',
  offline: true,
  summarize: () =>
    msg({ id: 'guide.queued.cancel', message: 'Cancelling a question for midnight' }),
});
