/**
 * Client specs for the commands the places list sends. All four may wait in the offline queue: a
 * swipe works without signal and lands at the first bar.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

import type { CommandCall } from './swipe-actions';

export const saveIdeaCommand = defineClientCommand<Record<string, string>>({
  name: 'save_idea',
  offline: true,
  summarize: () => msg({ id: 'places.queued.save', message: 'A place saved to Ideas' }),
});

export const removeIdeaCommand = defineClientCommand<Record<string, string>>({
  name: 'remove_idea',
  offline: true,
  summarize: () => msg({ id: 'places.queued.remove', message: 'A place taken out of Ideas' }),
});

export const hidePlaceCommand = defineClientCommand<Record<string, string>>({
  name: 'hide_place',
  offline: true,
  summarize: () => msg({ id: 'places.queued.hide', message: 'A hidden place' }),
});

export const unhidePlaceCommand = defineClientCommand<Record<string, string>>({
  name: 'unhide_place',
  offline: true,
  summarize: () => msg({ id: 'places.queued.unhide', message: 'A place shown again' }),
});

export const PLACES_COMMANDS = {
  save_idea: saveIdeaCommand,
  remove_idea: removeIdeaCommand,
  hide_place: hidePlaceCommand,
  unhide_place: unhidePlaceCommand,
} as const satisfies Record<CommandCall['name'], unknown>;
