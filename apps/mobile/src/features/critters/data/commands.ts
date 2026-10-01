/**
 * Client specs for the critter commands. Every one may wait in the offline queue: an egg hatched
 * on the tarmac with no signal, or a critter befriended deep in a temple, is sent once the phone
 * is back online, and the queued list names it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  BefriendCritterPayload,
  EndEncounterPayload,
  HatchEggPayload,
  ReportEncounterSamplesPayload,
  SetExploreAtHomePayload,
  SetGuideSkinPayload,
  SetLegendaryReminderPayload,
  StartEncounterPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const hatchEggCommand = defineClientCommand<HatchEggPayload>({
  name: 'hatch_egg',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.hatch', message: 'Your egg hatched' }),
});

export const startEncounterCommand = defineClientCommand<StartEncounterPayload>({
  name: 'start_encounter',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.encounter', message: 'A critter encounter' }),
});

export const reportEncounterSamplesCommand = defineClientCommand<ReportEncounterSamplesPayload>({
  name: 'report_encounter_samples',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.samples', message: 'How long you stayed' }),
});

export const endEncounterCommand = defineClientCommand<EndEncounterPayload>({
  name: 'end_encounter',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.ended', message: 'A critter wandered off' }),
});

export const befriendCritterCommand = defineClientCommand<BefriendCritterPayload>({
  name: 'befriend_critter',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.befriend', message: 'A critter you befriended' }),
});

export const setGuideSkinCommand = defineClientCommand<SetGuideSkinPayload>({
  name: 'set_guide_skin',
  offline: true,
  summarize: () => msg({ id: 'critters.queued.skin', message: "Your guide's look" }),
});

export const setExploreAtHomeCommand = defineClientCommand<SetExploreAtHomePayload>({
  name: 'set_explore_at_home',
  offline: true,
  summarize: ({ on }) =>
    on
      ? msg({ id: 'critters.queued.homeOn', message: 'Explore at home: on' })
      : msg({ id: 'critters.queued.homeOff', message: 'Explore at home: off' }),
});

export const setLegendaryReminderCommand = defineClientCommand<SetLegendaryReminderPayload>({
  name: 'set_legendary_reminder',
  offline: true,
  summarize: ({ on }) =>
    on
      ? msg({ id: 'critters.queued.remindOn', message: 'A legendary reminder' })
      : msg({ id: 'critters.queued.remindOff', message: 'Cancelled a legendary reminder' }),
});
