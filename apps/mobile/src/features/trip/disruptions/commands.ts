/**
 * Client specs for the disruption commands (docs/api-contracts-disruptions.md §1). Every one may
 * wait in the offline queue: an answer, an undo or TELL THE CREW goes out when the phone is back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AnnounceDisruptionPayload,
  CastBallotPayload,
  ChooseLateOptionPayload,
  HoldStormSeatsPayload,
  DecideDisruptionActionPayload,
  UndoDisruptionActionPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const decideDisruptionActionCommand = defineClientCommand<DecideDisruptionActionPayload>({
  name: 'decide_disruption_action',
  offline: true,
  summarize: () => msg({ id: 'trip.disruptions.queued.decide', message: 'An answer to the guide' }),
});

export const undoDisruptionActionCommand = defineClientCommand<UndoDisruptionActionPayload>({
  name: 'undo_disruption_action',
  offline: true,
  summarize: () =>
    msg({ id: 'trip.disruptions.queued.undo', message: "Undoing the guide's changes" }),
});

export const announceDisruptionCommand = defineClientCommand<AnnounceDisruptionPayload>({
  name: 'announce_disruption',
  offline: true,
  summarize: () => msg({ id: 'trip.disruptions.queued.announce', message: 'A note to the crew' }),
});

export const chooseLateOptionCommand = defineClientCommand<ChooseLateOptionPayload>({
  name: 'choose_late_option',
  offline: true,
  summarize: () =>
    msg({ id: 'trip.disruptions.queued.lateOption', message: 'What to do about running late' }),
});

/** Holding the new date needs the supplier's answer, so it is sent online only. */
export const holdStormSeatsCommand = defineClientCommand<HoldStormSeatsPayload>({
  name: 'hold_storm_seats',
  offline: false,
});

/** A vote on the storm decision: the same `cast_ballot` as any poll. */
export const castStormBallotCommand = defineClientCommand<CastBallotPayload>({
  name: 'cast_ballot',
  offline: true,
  summarize: () => msg({ id: 'trip.disruptions.queued.vote', message: 'Your vote' }),
});
