/** The help centre's commands as the app sends them (offline-capable, through the queue). */
/* eslint-disable lingui/no-unlocalized-strings -- command names are wire values, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

import type { FeedbackPayload } from './draft';

export const submitFeedbackCommand = defineClientCommand<FeedbackPayload>({
  name: 'submit_feedback',
  offline: true,
  summarize: () => msg({ id: 'help.queued.feedback', message: 'Your note to the humans' }),
});
