/**
 * Trip day copy the server renders into pushes and chat (catalog id + source message; the worker
 * renders it in each recipient's language). Times arrive formatted in the leave-by's zone. A
 * leave-by worked out with no trip to the place (nothing on the plan says where the crew sets off
 * from) is a time to be there, and says so: it never reads as a time to leave.
 */
export interface TripDayCopy {
  readonly id: string;
  readonly message: string;
}

export const TRIP_DAY_PUSH = {
  alarmTitle: /*i18n*/ {
    id: 'notifications.trip_day.alarm_title',
    message: 'Leave by {time} · {place}',
  },
  alarmBody: /*i18n*/ {
    id: 'notifications.trip_day.alarm_body',
    message: 'Time to get up. Tap when you are up.',
  },
  alarmTitleBeThere: /*i18n*/ {
    id: 'notifications.trip_day.alarm_title_be_there',
    message: 'Be at {place} by {time}',
  },
  alarmBodyBeThere: /*i18n*/ {
    id: 'notifications.trip_day.alarm_body_be_there',
    message: 'Getting there is not counted. Tap when you are up.',
  },
  knockTitle: /*i18n*/ {
    id: 'notifications.trip_day.knock_title',
    message: '{place} · leave by {time}',
  },
  knockTitleBeThere: /*i18n*/ {
    id: 'notifications.trip_day.knock_title_be_there',
    message: '{place} · be there by {time}',
  },
  knockBody: /*i18n*/ {
    id: 'notifications.trip_day.knock_body',
    message: '{name} might need a knock.',
  },
  lateTitle: /*i18n*/ { id: 'notifications.trip_day.late_title', message: '{crew}' },
  lateBody: /*i18n*/ {
    id: 'notifications.trip_day.late_body',
    message: '{name} is running {minutes} min late.',
  },
  briefingTitle: /*i18n*/ {
    id: 'notifications.trip_day.briefing_title',
    message: '{place} · today',
  },
  briefingBody: /*i18n*/ { id: 'notifications.trip_day.briefing_body', message: '{line}' },
} as const;

/** The chat line a running-late report posts (the sender's own words, in the crew's chat). */
export function runningLateLine(minutes: number): string {
  return `Running ${minutes} min late.`;
}
