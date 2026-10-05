/**
 * Client specs for the place page's own commands: ♡ inside a trip keeps the place in the trip's
 * Ideas (and the caller's saved places), and takes the caller back out; an organiser can take
 * it out for everyone (`for_everyone`). Both may wait in the
 * offline queue; the synced idea row shows the result.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { SaveIdeaPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const saveIdeaCommand = defineClientCommand<SaveIdeaPayload>({
  name: 'save_idea',
  offline: true,
  summarize: () => msg({ id: 'explore.detail.queued.idea', message: 'A place saved to Ideas' }),
});

export const removeIdeaCommand = defineClientCommand<{ idea_id: string; for_everyone?: boolean }>({
  name: 'remove_idea',
  offline: true,
  summarize: () => msg({ id: 'explore.detail.queued.unidea', message: 'A place out of Ideas' }),
});
