/**
 * Client specs for the trip day's commands. Every one may wait in the offline queue: an "I'm up"
 * tapped at the top of a volcano sends once there is signal, and the queued list names it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type {
  AddPackingItemPayload,
  CheckPackingItemPayload,
  MirrorAlarmStatePayload,
  RemovePackingItemPayload,
  ReportRunningLatePayload,
  SetReadinessPayload,
  SnoozeLeaveByPayload,
} from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

export const SET_READINESS = 'set_readiness';
export const SNOOZE_LEAVE_BY = 'snooze_leave_by';
export const CHECK_PACKING_ITEM = 'check_packing_item';
export const ADD_PACKING_ITEM = 'add_packing_item';
export const REMOVE_PACKING_ITEM = 'remove_packing_item';

export const setReadinessCommand = defineClientCommand<SetReadinessPayload>({
  name: SET_READINESS,
  offline: true,
  summarize: (payload) =>
    payload.state === 'up'
      ? msg({ id: 'trip.dayOf.queued.up', message: "You're up" })
      : msg({ id: 'trip.dayOf.queued.notUp', message: 'Back to sleep' }),
});

export const snoozeLeaveByCommand = defineClientCommand<SnoozeLeaveByPayload>({
  name: SNOOZE_LEAVE_BY,
  offline: true,
  summarize: () => msg({ id: 'trip.dayOf.queued.snooze', message: 'Snoozed the leave-by alarm' }),
});

export const checkPackingItemCommand = defineClientCommand<CheckPackingItemPayload>({
  name: CHECK_PACKING_ITEM,
  offline: true,
  summarize: () => msg({ id: 'trip.dayOf.queued.packed', message: 'Your packing list' }),
});

export const addPackingItemCommand = defineClientCommand<AddPackingItemPayload>({
  name: ADD_PACKING_ITEM,
  offline: true,
  summarize: ({ label }) => msg({ id: 'trip.dayOf.queued.added', message: `Pack: ${label}` }),
});

export const removePackingItemCommand = defineClientCommand<RemovePackingItemPayload>({
  name: REMOVE_PACKING_ITEM,
  offline: true,
  summarize: () => msg({ id: 'trip.dayOf.queued.removed', message: 'Your packing list' }),
});

export const mirrorAlarmStateCommand = defineClientCommand<MirrorAlarmStatePayload>({
  name: 'mirror_alarm_state',
  offline: true,
});

/** "Running late" said in the app: the rest of the trip is told, and the stop's options open. */
export const reportRunningLateCommand = defineClientCommand<ReportRunningLatePayload>({
  name: 'report_running_late',
  offline: true,
  summarize: (payload) => {
    const minutes = payload.minutes;
    return msg({ id: 'trip.dayOf.queued.late', message: `Running ${minutes} min late` });
  },
});
