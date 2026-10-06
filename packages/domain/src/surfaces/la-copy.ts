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
  // A leave-by with no trip counted is a time to be somewhere, not a time to leave.
  leaveByBeAt: /*i18n*/ { id: 'notifications.la.leave_by_be_at', message: 'Be at {place}' },
  leaveByBeThereStartTitle: /*i18n*/ {
    id: 'notifications.la.leave_by_be_there_start_title',
    message: 'Be at {place} by {time}',
  },
  leaveByBeThereGoTitle: /*i18n*/ {
    id: 'notifications.la.leave_by_be_there_go_title',
    message: 'Time to be at {place}',
  },
  leaveByBeThereGoBody: /*i18n*/ {
    id: 'notifications.la.leave_by_be_there_go_body',
    message: '{up} of {total} up.',
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
  // The SOS push's own words: the activity starts with the same alert the crew already knows.
  sosStartTitle: /*i18n*/ { id: 'notifications.sos.title', message: '{sender} needs help' },
  sosStartBody: /*i18n*/ {
    id: 'notifications.sos.plain',
    message: '{sender} sent an SOS to the crew.',
  },
  // Free text the watch list already wrote (its title and what to do), passed through as is.
  stormStartTitle: /*i18n*/ { id: 'notifications.la.storm_start_title', message: '{headline}' },
  stormStartBody: /*i18n*/ { id: 'notifications.la.storm_start_body', message: '{action}' },
  // What the storm activity says when someone it reaches hides details on the lock screen.
  stormPlainHeadline: /*i18n*/ {
    id: 'notifications.la.storm_plain_headline',
    message: 'Weather on watch',
  },
  stormPlainAction: /*i18n*/ {
    id: 'notifications.la.storm_plain_action',
    message: 'Open CritterPass to see the plan.',
  },
  rideStartTitle: /*i18n*/ {
    id: 'notifications.la.ride_start_title',
    message: '{service} · {route}',
  },
  rideStartBody: /*i18n*/ {
    id: 'notifications.la.ride_start_body',
    message: 'About {eta} min away. The fare is on your lock screen.',
  },
  critterStartTitle: /*i18n*/ {
    id: 'notifications.la.critter_start_title',
    message: 'Someone is hiding nearby',
  },
  critterStartBody: /*i18n*/ {
    id: 'notifications.la.critter_start_body',
    message: 'Stay at {place} a little longer to meet them.',
  },
  critterStartBodyPlain: /*i18n*/ {
    id: 'notifications.la.critter_start_body_plain',
    message: 'Stay where you are a little longer to meet them.',
  },
} as const satisfies Record<string, LaCopy>;
