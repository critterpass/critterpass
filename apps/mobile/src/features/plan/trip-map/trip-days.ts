/**
 * The trip's days as the section 7 plan screens read them (7a-1…7a-3, 7b-1…7b-3): each day's
 * stops in time order (the stay is the anchor, not a stop), the night's stay, how full the day
 * is, the open vote on it, the plan check's issues for it and the one tag its row shows. A fix
 * the check found wins the tag (CLASH, TOO FAR, RAIN, CLOSED), then an open vote, then a booking.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and keys, never copy. */
import type { PlanCheckIssue, PlanState } from '@cp/domain';

import { dayItems, type DayItem, type ItemDisplay } from '@/data/plan/plan-model';
import type { PlanDayRow } from '@/data/plan/queries';

import type { OpenPollRow } from '../overview/data/plan-rows';
import { dayTileColour } from '../overview/model/day-colour';
import { dayPace } from './pace';

export type DayTagKind = 'clash' | 'too_far' | 'rain' | 'closed' | 'vote' | 'booked';

export type DayTag =
  | { readonly kind: 'vote'; readonly pollId: string; readonly ballots: number }
  | { readonly kind: Exclude<DayTagKind, 'vote'> };

export interface Point {
  readonly lat: number;
  readonly lng: number;
}

export interface TripDay {
  readonly dayNo: number;
  /** The `plan_days` row id (legs and issues are keyed by it); null on an unsynced day. */
  readonly dayId: string | null;
  readonly date: string | null;
  readonly theme: string | null;
  readonly color: string;
  /** Everything on the day, the stay included, in time order. */
  readonly items: readonly DayItem[];
  /** The places the day goes to, in time order: what the map numbers and the legs join. */
  readonly stops: readonly DayItem[];
  readonly stay: Point | null;
  readonly pace: number;
  /** The open vote on the day and the stop it decides. */
  readonly vote: {
    readonly pollId: string;
    readonly ballots: number;
    readonly stableId: string;
  } | null;
  readonly booked: boolean;
  readonly issues: readonly PlanCheckIssue[];
  readonly tag: DayTag | null;
}

export interface TripDaysInput {
  readonly state: PlanState;
  readonly display: ReadonlyMap<string, ItemDisplay>;
  readonly dayRows: readonly Pick<PlanDayRow, 'id' | 'day_no'>[];
  /** Day themes as this person reads them, keyed by the theme as written. */
  readonly themes: ReadonlyMap<string, string>;
  readonly tz: string;
  readonly polls: readonly OpenPollRow[];
  readonly issues: readonly PlanCheckIssue[];
}

const TAG_ISSUES: readonly DayTagKind[] = ['clash', 'too_far', 'rain', 'closed'];

export function isStay(item: DayItem): boolean {
  return item.category === 'stay';
}

export function isStop(item: DayItem): boolean {
  return !isStay(item) && item.status !== 'cancelled';
}

/** Stays in the plan by day, in day order. */
function stays(days: readonly { dayNo: number; items: readonly DayItem[] }[]) {
  return days.flatMap((day) =>
    day.items.flatMap((item) =>
      isStay(item) && item.place !== null ? [{ dayNo: day.dayNo, place: item.place }] : [],
    ),
  );
}

/** The night's stay: the latest stay on or before the day, else the first one after it. */
export function stayFor(
  dayNo: number,
  planned: readonly { dayNo: number; place: Point }[],
): Point | null {
  const before = planned.filter((stay) => stay.dayNo <= dayNo);
  return (before.at(-1) ?? planned.find((stay) => stay.dayNo > dayNo))?.place ?? null;
}

function votesByDay(items: readonly DayItem[], polls: readonly OpenPollRow[]) {
  const byDay = new Map<number, { pollId: string; ballots: number; stableId: string }>();
  for (const poll of polls) {
    if (poll.ref_id === null) continue;
    const item = items.find((one) => one.poiId === poll.ref_id || one.stableId === poll.ref_id);
    if (item !== undefined && !byDay.has(item.dayNo)) {
      byDay.set(item.dayNo, {
        pollId: poll.id,
        ballots: Number(poll.ballots),
        stableId: item.stableId,
      });
    }
  }
  return byDay;
}

function tagOf(
  issues: readonly PlanCheckIssue[],
  vote: TripDay['vote'],
  booked: boolean,
): DayTag | null {
  const fix = issues.find(
    (issue) => issue.severity === 'fix' && TAG_ISSUES.includes(issue.kind as DayTagKind),
  );
  if (fix !== undefined) return { kind: fix.kind as Exclude<DayTagKind, 'vote'> };
  if (vote !== null) return { kind: 'vote', pollId: vote.pollId, ballots: vote.ballots };
  return booked ? { kind: 'booked' } : null;
}

export function buildTripDays(input: TripDaysInput): TripDay[] {
  const dayIds = new Map(input.dayRows.map((row) => [row.day_no, row.id]));
  const perDay = input.state.days.map((day) => ({
    day,
    dayNo: day.day_no,
    items: dayItems(input.state, day.day_no, input.display, input.tz),
  }));
  const planned = stays(perDay);
  const votes = votesByDay(
    perDay.flatMap((entry) => entry.items),
    input.polls,
  );
  return perDay.map(({ day, dayNo, items }) => {
    const dayId = dayIds.get(dayNo) ?? null;
    const stops = items.filter(isStop);
    const issues =
      dayId === null
        ? []
        : input.issues.filter(
            (issue) =>
              issue.day_id === dayId ||
              issue.stable_ids.some((id) => stops.some((stop) => stop.stableId === id)),
          );
    const vote = votes.get(dayNo) ?? null;
    const booked = items.some((item) => item.bookingId !== null);
    return {
      dayNo,
      dayId,
      date: day.date,
      theme: day.theme === null ? null : (input.themes.get(day.theme) ?? day.theme),
      color: dayTileColour(dayNo),
      items,
      stops,
      stay: stayFor(dayNo, planned),
      pace: dayPace(stops),
      vote,
      booked,
      issues,
      tag: tagOf(issues, vote, booked),
    };
  });
}

/** Stops that have a place on the map, numbered in the day's order. */
export function mappedStops(day: TripDay): { readonly n: number; readonly stop: DayItem }[] {
  return day.stops.flatMap((stop, index) => (stop.place === null ? [] : [{ n: index + 1, stop }]));
}

/** The issue a stop is named in, fixes first (the note under it on the day plan). */
export function issueFor(day: TripDay, stableId: string): PlanCheckIssue | null {
  return day.issues.find((issue) => issue.stable_ids.includes(stableId)) ?? null;
}
