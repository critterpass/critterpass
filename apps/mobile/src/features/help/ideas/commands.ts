/** The idea board's commands as the app sends them (offline-capable, through the queue). */
/* eslint-disable lingui/no-unlocalized-strings -- command names are wire values, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const voteIdeaCommand = defineClientCommand<{ readonly idea_id: string }>({
  name: 'vote_idea',
  offline: true,
  summarize: () => msg({ id: 'help.queued.vote', message: 'Your vote on an idea' }),
});

export const unvoteIdeaCommand = defineClientCommand<{ readonly idea_id: string }>({
  name: 'unvote_idea',
  offline: true,
  summarize: () => msg({ id: 'help.queued.unvote', message: 'A vote taken back' }),
});

export const submitIdeaCommand = defineClientCommand<{
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly locale: string;
}>({
  name: 'submit_idea',
  offline: true,
  summarize: () => msg({ id: 'help.queued.idea', message: 'Your idea for the board' }),
});
