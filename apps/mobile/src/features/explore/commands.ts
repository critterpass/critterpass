/**
 * Client specs for the commands Explore sends. Saves and a solo trip may wait in the offline
 * queue (a queued save shows at once from the queue).
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { CreateTripPayload } from '@cp/domain';
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
