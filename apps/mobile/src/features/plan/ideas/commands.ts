/**
 * Client specs for the Ideas commands (docs/api-contracts-planning.md): saving a place to the
 * trip's Ideas and taking it off wait in the offline queue (the idea shows at once from its synced
 * row once the server has it); starting a placement asks the server straight away, as the placing
 * screen needs the job it started.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { SaveIdeaPayload } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const saveIdeaCommand = defineClientCommand<SaveIdeaPayload>({
  name: 'save_idea',
  offline: true,
  summarize: () => msg({ id: 'plan.ideas.queued.save', message: 'A place saved to Ideas' }),
});

export const removeIdeaCommand = defineClientCommand<{ idea_id: string }>({
  name: 'remove_idea',
  offline: true,
  summarize: () => msg({ id: 'plan.ideas.queued.remove', message: 'A place taken off Ideas' }),
});

export const startIdeaPlacementOnline = defineClientCommand<{
  trip_id: string;
  idea_ids?: string[];
}>({
  name: 'start_idea_placement',
  offline: false,
});
