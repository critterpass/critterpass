/**
 * Live Activity copy the server renders into a push (catalog id + source message; the worker
 * renders it in the device's language): the alert that must accompany a push-to-start, the
 * alerts of the few urgent updates (leave time, late, everyone arrived), and the trail's stop names.
 * Labels the activity draws itself (LEAVE BY, I'M UP, 4 OF 6 UP) live in the app's own catalog.
 */
export interface LaCopy {
  readonly id: string;
  readonly message: string;
}

export const LA_COPY = {
  stay: /*i18n*/ { id: 'notifications.la.stay', message: 'Stay' },
  pickup: /*i18n*/ { id: 'notifications.la.pickup', message: 'Pickup' },
  leaveByStartTitle: /*i18n*/ {
    id: 'notifications.la.leave_by_start_title',
    message: 'Leave by {time} · {place}',
  },
  leaveByStartBody: /*i18n*/ {
    id: 'notifications.la.leave_by_start_body',
    message: '{up} of {total} up so far.',
  },
  leaveByGoTitle: /*i18n*/ {
    id: 'notifications.la.leave_by_go_title',
    message: 'Time to go · {place}',
  },
  leaveByGoBody: /*i18n*/ {
    id: 'notifications.la.leave_by_go_body',
    message: 'Leave now. {up} of {total} up.',
  },
  leaveByLateTitle: /*i18n*/ {
    id: 'notifications.la.leave_by_late_title',
    message: '{place} · running late',
  },
  leaveByLateBody: /*i18n*/ {
    id: 'notifications.la.leave_by_late_body',
    message: '{missing} still not up.',
  },
  flightStartTitle: /*i18n*/ {
    id: 'notifications.la.flight_start_title',
    message: '{flight} · {route}',
  },
  flightStartBody: /*i18n*/ {
    id: 'notifications.la.flight_start_body',
    message: 'Departs {time}. Your flight is on the lock screen.',
  },
  meetUpStartTitle: /*i18n*/ {
    id: 'notifications.la.meet_up_start_title',
    message: '{place} · {time}',
  },
  meetUpStartBody: /*i18n*/ {
    id: 'notifications.la.meet_up_start_body',
    message: 'The whole crew, on your lock screen.',
  },
  meetUpArrivedTitle: /*i18n*/ {
    id: 'notifications.la.meet_up_arrived_title',
    message: 'Everyone is at {place}',
  },
  meetUpArrivedBody: /*i18n*/ {
    id: 'notifications.la.meet_up_arrived_body',
    message: 'The crew is all here.',
  },
  meetUpLateTitle: /*i18n*/ {
    id: 'notifications.la.meet_up_late_title',
    message: '{place} · {time}',
  },
  meetUpLateBody: /*i18n*/ {
    id: 'notifications.la.meet_up_late_body',
    message: 'Not everyone is there yet.',
  },
  voteStartTitle: /*i18n*/ {
    id: 'notifications.la.vote_start_title',
    message: 'Vote closes {time}',
  },
  voteStartBody: /*i18n*/ { id: 'notifications.la.vote_start_body', message: '{question}' },
} as const satisfies Record<string, LaCopy>;
