/**
 * Client specs for the trip setup commands (docs/api-contracts.md §4.5). What a member contributes
 * (days, a private max, room chips, must-dos, an answer to the guide's ask) waits in the offline
 * queue; locking dates, a budget target or the rooms, and connecting a calendar need the server's
 * answer there and then.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AnswerAvailabilityAskPayload,
  AskAvailabilityPayload,
  ConnectCalendarPayload,
  DisconnectCalendarPayload,
  LockBudgetTargetPayload,
  LockRoomsPayload,
  LockTripDatesPayload,
  RequestRoomSwapPayload,
  SetAvailabilityPayload,
  SetBudgetDefaultPayload,
  SetGettingTherePayload,
  SetMustDosPayload,
  SetRoomAssignmentPayload,
  SetRoomPrefsPayload,
  SetSetupStepPayload,
  SetStayChoicePayload,
  SubmitBudgetMaxPayload,
  TrackLotteryPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const setAvailabilityCommand = defineClientCommand<SetAvailabilityPayload>({
  name: 'set_availability',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.availability', message: 'Your free days' }),
});

export const connectCalendarCommand = defineClientCommand<ConnectCalendarPayload>({
  name: 'connect_calendar',
  offline: false,
});

export const disconnectCalendarCommand = defineClientCommand<DisconnectCalendarPayload>({
  name: 'disconnect_calendar',
  offline: false,
});

export const askAvailabilityCommand = defineClientCommand<AskAvailabilityPayload>({
  name: 'ask_availability',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.ask', message: 'Asking about a maybe block' }),
});

export const answerAvailabilityAskCommand = defineClientCommand<AnswerAvailabilityAskPayload>({
  name: 'answer_availability_ask',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.answer', message: 'Your answer about those days' }),
});

export const lockTripDatesCommand = defineClientCommand<LockTripDatesPayload>({
  name: 'lock_trip_dates',
  offline: false,
});

export const setSetupStepCommand = defineClientCommand<SetSetupStepPayload>({
  name: 'set_setup_step',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.step', message: 'Moving setup along' }),
});

export const submitBudgetMaxCommand = defineClientCommand<SubmitBudgetMaxPayload>({
  name: 'submit_budget_max',
  offline: true,
  // Never the amount: the queue list only says a max is on its way.
  summarize: () => msg({ id: 'setup.queued.budgetMax', message: 'Your private max' }),
});

export const setBudgetDefaultCommand = defineClientCommand<SetBudgetDefaultPayload>({
  name: 'set_budget_default',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.budgetDefault', message: 'Your usual max' }),
});

export const lockBudgetTargetCommand = defineClientCommand<LockBudgetTargetPayload>({
  name: 'lock_budget_target',
  offline: false,
});

export const setStayChoiceCommand = defineClientCommand<SetStayChoicePayload>({
  name: 'set_stay_choice',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.stay', message: 'Your stay pick' }),
});

export const setRoomAssignmentCommand = defineClientCommand<SetRoomAssignmentPayload>({
  name: 'set_room_assignment',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.rooms', message: 'Who sleeps where' }),
});

export const setRoomPrefsCommand = defineClientCommand<SetRoomPrefsPayload>({
  name: 'set_room_prefs',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.roomPrefs', message: 'Your room wishes' }),
});

export const requestRoomSwapCommand = defineClientCommand<RequestRoomSwapPayload>({
  name: 'request_room_swap',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.swap', message: 'Asking to swap rooms' }),
});

export const lockRoomsCommand = defineClientCommand<LockRoomsPayload>({
  name: 'lock_rooms',
  offline: false,
});

export const setMustDosCommand = defineClientCommand<SetMustDosPayload>({
  name: 'set_must_dos',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.mustDos', message: 'Your must-dos' }),
});

export const trackLotteryCommand = defineClientCommand<TrackLotteryPayload>({
  name: 'track_lottery',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.lottery', message: 'Lottery reminders' }),
});

export const setGettingThereCommand = defineClientCommand<SetGettingTherePayload>({
  name: 'set_getting_there',
  offline: true,
  summarize: () => msg({ id: 'setup.queued.gettingThere', message: 'How you get there' }),
});
