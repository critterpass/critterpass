/**
 * Trip day copy the server renders into pushes and chat (catalog id + source message; the worker
 * renders it in each recipient's language). Times arrive formatted in the leave-by's zone.
 */
export interface TripDayCopy {
  readonly id: string;
  readonly message: string;
}

const copy = (id: string, message: string): TripDayCopy => ({ id, message });

export const TRIP_DAY_PUSH = {
  alarmTitle: copy('notifications.trip_day.alarm_title', 'Leave by {time} · {place}'),
  alarmBody: copy('notifications.trip_day.alarm_body', 'Time to get up. Tap when you are up.'),
  knockTitle: copy('notifications.trip_day.knock_title', '{place} · leave by {time}'),
  knockBody: copy('notifications.trip_day.knock_body', '{name} might need a knock.'),
  lateTitle: copy('notifications.trip_day.late_title', '{crew}'),
  lateBody: copy('notifications.trip_day.late_body', '{name} is running {minutes} min late.'),
  briefingTitle: copy('notifications.trip_day.briefing_title', '{place} · today'),
  briefingBody: copy('notifications.trip_day.briefing_body', '{line}'),
} as const;

/** The chat line a running-late report posts (the sender's own words, in the crew's chat). */
export function runningLateLine(minutes: number): string {
  return `Running ${minutes} min late.`;
}
