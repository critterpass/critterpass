/**
 * Client specs for the commands Explore sends. Saves, a solo trip and adding a place to the plan
 * may wait in the offline queue (a queued save shows at once from the queue).
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  ApplyPlanOpsPayload,
  CreateChangesetPayload,
  CreateTripPayload,
  RecordSponsoredEventPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const SAVE_PLACE = 'save_place';
export const UNSAVE_PLACE = 'unsave_place';

export const savePlaceCommand = defineClientCommand<{ place_id: string; list_name?: string }>({
  name: SAVE_PLACE,
  offline: true,
  summarize: () => msg({ id: 'explore.queued.save', message: 'A saved place' }),
});

export const unsavePlaceCommand = defineClientCommand<{ place_id: string }>({
  name: UNSAVE_PLACE,
  offline: true,
  summarize: () => msg({ id: 'explore.queued.unsave', message: 'Removing a saved place' }),
});

export const createTripCommand = defineClientCommand<CreateTripPayload>({
  name: 'create_trip',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.trip', message: 'Your new trip' }),
});

/** The organiser adds a place straight to the plan. */
export const applyPlanOpsCommand = defineClientCommand<ApplyPlanOpsPayload>({
  name: 'apply_plan_ops',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.planAdd', message: 'A place added to the plan' }),
});

/** A member proposes it: the change set, then the crew is asked. */
export const createChangesetCommand = defineClientCommand<CreateChangesetPayload>({
  name: 'create_changeset',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.proposal', message: 'A place for the crew to okay' }),
});

export const sendChangesetCommand = defineClientCommand<{ changeset_id: string }>({
  name: 'send_changeset',
  offline: true,
});

export const createSavedListCommand = defineClientCommand<{ list_id: string; name: string }>({
  name: 'create_saved_list',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.listNew', message: 'A new list' }),
});

/** Online only: a name the viewer already uses is refused, and the screen says so. */
export const renameSavedListCommand = defineClientCommand<{ list_id: string; name: string }>({
  name: 'rename_saved_list',
  offline: false,
});

export const deleteSavedListCommand = defineClientCommand<{ list_id: string }>({
  name: 'delete_saved_list',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.listDelete', message: 'Deleting a list' }),
});

export const moveSavedItemCommand = defineClientCommand<{
  item_id: string;
  list_name: string | null;
}>({
  name: 'move_saved_item',
  offline: true,
  summarize: () => msg({ id: 'explore.queued.move', message: 'Moving a saved place' }),
});

/** A sponsored pick shown or tapped: counted per placement and list, with no one attached. */
export const recordSponsoredEventCommand = defineClientCommand<RecordSponsoredEventPayload>({
  name: 'record_sponsored_event',
  offline: true,
});
