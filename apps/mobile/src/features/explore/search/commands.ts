/**
 * Client spec for saving a place to the trip's Ideas from search (`save_idea`): it may wait in the
 * offline queue, and the outbox words it as a place saved to Ideas.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { SaveIdeaPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const saveIdeaCommand = defineClientCommand<SaveIdeaPayload>({
  name: 'save_idea',
  offline: true,
  summarize: () => msg({ id: 'search.queued.idea', message: 'A place saved to Ideas' }),
});
