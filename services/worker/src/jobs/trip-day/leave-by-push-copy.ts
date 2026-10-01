/**
 * What a leave-by push tells people. A leave-by with a routed trip or a pickup is a time to leave.
 * One with no travel leg (nothing on the plan says where the crew sets off from, as on the first
 * morning of a trip) is only a time to be there: the push names the place (the departure airport
 * for a flight) and the time to be at it (check-in time for a flight, the start otherwise), and
 * says getting there is not counted. The stored leave-by time is the same either way.
 */
import { TRIP_DAY_PUSH, type TripDayCopy } from '@cp/domain';
import { arriveEarlyMinutes } from '@cp/planner';

const MINUTE = 60_000;

export interface LeaveByPushFacts {
  readonly title: string;
  readonly place_name: string | null;
  readonly starts_at: Date;
  readonly leave_at: Date;
  readonly tz: string;
  readonly category: string | null;
  /** The kind of the leave-by's travel leg (`route`, `pickup` or `none`). */
  readonly leg_kind: string | null;
  /** The departure airport, when the item is a booked flight leg. */
  readonly dep_airport: string | null;
}

export interface LeaveByPushCopy {
  readonly alarmTitle: TripDayCopy;
  readonly alarmBody: TripDayCopy;
  readonly knockTitle: TripDayCopy;
  readonly place: string;
  /** `HH:MM` on the leave-by's local clock. */
  readonly time: string;
}

const clock = (at: Date, tz: string) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit' }).format(at);

export function leaveByPushCopy(facts: LeaveByPushFacts): LeaveByPushCopy {
  if (facts.leg_kind !== 'none') {
    return {
      alarmTitle: TRIP_DAY_PUSH.alarmTitle,
      alarmBody: TRIP_DAY_PUSH.alarmBody,
      knockTitle: TRIP_DAY_PUSH.knockTitle,
      place: facts.place_name ?? facts.title,
      time: clock(facts.leave_at, facts.tz),
    };
  }
  const beThereAt = new Date(
    facts.starts_at.getTime() - arriveEarlyMinutes(facts.category) * MINUTE,
  );
  return {
    alarmTitle: TRIP_DAY_PUSH.alarmTitleBeThere,
    alarmBody: TRIP_DAY_PUSH.alarmBodyBeThere,
    knockTitle: TRIP_DAY_PUSH.knockTitleBeThere,
    place: facts.dep_airport ?? facts.place_name ?? facts.title,
    time: clock(beThereAt, facts.tz),
  };
}
