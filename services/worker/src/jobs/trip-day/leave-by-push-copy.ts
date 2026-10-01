/**
 * What a leave-by tells people, in its pushes and in the morning briefing's line. A leave-by with a
 * routed trip or a pickup is a time to leave.
 * One with no travel leg (nothing on the plan says where the crew sets off from, as on the first
 * morning of a trip) is only a time to be there: the text names the place (the departure airport
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
  /** No trip to the place was counted: the time is when to be there, not when to leave. */
  readonly beThere: boolean;
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
      beThere: false,
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
    beThere: true,
    alarmTitle: TRIP_DAY_PUSH.alarmTitleBeThere,
    alarmBody: TRIP_DAY_PUSH.alarmBodyBeThere,
    knockTitle: TRIP_DAY_PUSH.knockTitleBeThere,
    place: facts.dep_airport ?? facts.place_name ?? facts.title,
    time: clock(beThereAt, facts.tz),
  };
}

export interface LeaveByBriefingLine {
  /** The plain line the guide rewords (and the one shown when the model is not used). */
  readonly template: string;
  /** The only values the line may cite. */
  readonly facts: Readonly<Record<string, string>>;
}

/** The morning briefing's leave-by candidate: when to leave, or when to be there. */
export function leaveByBriefingLine(
  facts: LeaveByPushFacts,
  pickupPlace: string | null,
): LeaveByBriefingLine {
  const { beThere, place, time } = leaveByPushCopy(facts);
  if (beThere) {
    return {
      template: `Be at ${place} by ${time}; getting there is not counted.`.slice(0, 140),
      facts: { time, place },
    };
  }
  const pickup = pickupPlace === null ? '' : ` Pickup is at the ${pickupPlace}.`;
  return {
    template: `Leave by ${time} for ${place}.${pickup}`.slice(0, 140),
    facts: { time, place, ...(pickupPlace === null ? {} : { pickup: pickupPlace }) },
  };
}
