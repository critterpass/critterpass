/**
 * Client specs for crew can't agree: a stance (and taking it back) may wait in the offline queue
 * and shows at once from the queue; posting a way out needs the server's answer (the vote's id).
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const setPlaceStanceCommand = defineClientCommand<{
  trip_id: string;
  poi_id: string;
  stance: 'want' | 'rather_not';
  note?: string;
}>({
  name: 'set_place_stance',
  offline: true,
  summarize: () => msg({ id: 'explore.split.queued.stance', message: 'Where you stand' }),
});

export const clearPlaceStanceCommand = defineClientCommand<{ trip_id: string; poi_id: string }>({
  name: 'clear_place_stance',
  offline: true,
  summarize: () =>
    msg({ id: 'explore.split.queued.clear', message: 'Taking back where you stood' }),
});

export const postPlaceDecisionCommand = defineClientCommand<{
  trip_id: string;
  poi_id: string;
  option_ids: string[];
  mode: 'suggest' | 'vote';
}>({
  name: 'post_place_decision',
  offline: false,
});
