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

const copy = (id: string, message: string): LaCopy => ({ id, message });

export const LA_COPY = {
  stay: copy('notifications.la.stay', 'Stay'),
  pickup: copy('notifications.la.pickup', 'Pickup'),
  leaveByStartTitle: copy('notifications.la.leave_by_start_title', 'Leave by {time} · {place}'),
  leaveByStartBody: copy('notifications.la.leave_by_start_body', '{up} of {total} up so far.'),
  leaveByGoTitle: copy('notifications.la.leave_by_go_title', 'Time to go · {place}'),
  leaveByGoBody: copy('notifications.la.leave_by_go_body', 'Leave now. {up} of {total} up.'),
  leaveByLateTitle: copy('notifications.la.leave_by_late_title', '{place} · running late'),
  leaveByLateBody: copy('notifications.la.leave_by_late_body', '{missing} still not up.'),
  flightStartTitle: copy('notifications.la.flight_start_title', '{flight} · {route}'),
  flightStartBody: copy(
    'notifications.la.flight_start_body',
    'Departs {time}. Your flight is on the lock screen.',
  ),
  meetUpStartTitle: copy('notifications.la.meet_up_start_title', '{place} · {time}'),
  meetUpStartBody: copy(
    'notifications.la.meet_up_start_body',
    'The whole crew, on your lock screen.',
  ),
  meetUpArrivedTitle: copy('notifications.la.meet_up_arrived_title', 'Everyone is at {place}'),
  meetUpArrivedBody: copy('notifications.la.meet_up_arrived_body', 'The crew is all here.'),
  meetUpLateTitle: copy('notifications.la.meet_up_late_title', '{place} · {time}'),
  meetUpLateBody: copy('notifications.la.meet_up_late_body', 'Not everyone is there yet.'),
  voteStartTitle: copy('notifications.la.vote_start_title', 'Vote closes {time}'),
  voteStartBody: copy('notifications.la.vote_start_body', '{question}'),
} as const;
