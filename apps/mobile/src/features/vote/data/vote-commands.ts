/**
 * Client specs for the poll engine's commands. Ballots, candidates, trips, reveals and saves may
 * wait in the offline queue (their effect shows at once from the queue); the organiser's stage
 * moves and closing a poll are online so the answer (a tie to pick, a closed poll) comes back.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddPollCandidatePayload,
  AdvancePollStagePayload,
  CastBallotPayload,
  CreateCrewPayload,
  CreatePollPayload,
  CreateTripPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const CAST_BALLOT = 'cast_ballot';
export const RETRACT_BALLOT = 'retract_ballot';
export const MARK_REVEAL_SEEN = 'mark_reveal_seen';
export const ADD_POLL_CANDIDATE = 'add_poll_candidate';

export const castBallotCommand = defineClientCommand<CastBallotPayload>({
  name: CAST_BALLOT,
  offline: true,
  summarize: () => msg({ id: 'vote.queued.ballot', message: 'Your vote' }),
});

export const retractBallotCommand = defineClientCommand<{ poll_id: string }>({
  name: RETRACT_BALLOT,
  offline: true,
  summarize: () => msg({ id: 'vote.queued.retract', message: 'Taking your vote back' }),
});

export const createPollCommand = defineClientCommand<CreatePollPayload>({
  name: 'create_poll',
  offline: true,
  summarize: () => msg({ id: 'vote.queued.poll', message: 'Your poll' }),
});

export const addPollCandidateCommand = defineClientCommand<AddPollCandidatePayload>({
  name: ADD_POLL_CANDIDATE,
  offline: true,
  summarize: () => msg({ id: 'vote.queued.pitch', message: 'Your pitch' }),
});

export const createTripCommand = defineClientCommand<CreateTripPayload>({
  name: 'create_trip',
  offline: true,
  summarize: () => msg({ id: 'vote.queued.trip', message: 'Your new trip' }),
});

export const markRevealSeenCommand = defineClientCommand<{ poll_id: string }>({
  name: MARK_REVEAL_SEEN,
  offline: true,
});

export const advancePollStageCommand = defineClientCommand<AdvancePollStagePayload>({
  name: 'advance_poll_stage',
  offline: false,
});

export const reopenBoardCommand = defineClientCommand<{ poll_id: string }>({
  name: 'reopen_board',
  offline: false,
});

export const closePollCommand = defineClientCommand<{ poll_id: string }>({
  name: 'close_poll',
  offline: false,
});

export const removeCandidateCommand = defineClientCommand<{ poll_id: string; option_id: string }>({
  name: 'remove_candidate',
  offline: true,
  summarize: () => msg({ id: 'vote.queued.remove', message: 'Taking a place off the board' }),
});

export const savePlaceCommand = defineClientCommand<{ place_id: string }>({
  name: 'save_place',
  offline: true,
});

export const unsavePlaceCommand = defineClientCommand<{ place_id: string }>({
  name: 'unsave_place',
  offline: true,
});

export const requestPlaceCommand = defineClientCommand<{ query: string }>({
  name: 'request_place',
  offline: true,
});

/**
 * Starting a crew from a place page, for someone with no crew who wants to pitch: the same
 * `create_crew` the crew area sends, queued the same way.
 */
export const createCrewCommand = defineClientCommand<CreateCrewPayload>({
  name: 'create_crew',
  offline: true,
  summarize: (p) => msg({ id: 'crew.queued.create', message: `New crew: ${p.name}` }),
});
