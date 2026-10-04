/**
 * One day's stops as rows for the trip map's day sheet (7a-2) and the day plan (7b-1): time and
 * length, a detail line (what is mine alone, the open vote and its cost, the rain the check found,
 * who is going when it isn't everyone), the leg to the next stop and the free time after it, the
 * check's note under the one stop it prints under, and where today is (over, now, next).
 */
import { t } from '@lingui/core/macro';
import type { PlanCheckIssue } from '@cp/domain';
import { format } from '@cp/i18n';

import type { DayLeg } from '@/data/legs/day-legs';
import type { DayItem } from '@/data/plan/plan-model';
import type { PlanMember } from '@/data/plan/use-trip-plan';

import { clock } from '../day/format';
import type { FreeGap } from './day-gaps';
import { compactMoney, legLabel, lengthLabel } from './format';
import type { DayProgress, StopMoment } from './next-stop';
import type { PersonalMark } from './personal-layer';
import { issueFor, type TripDay } from './trip-days';

export interface StopRow {
  readonly stop: DayItem;
  readonly n: number;
  readonly time: string;
  readonly length: string | undefined;
  readonly detail: string | undefined;
  /** The fix the check found for this stop, if any: outlined, with its way out. */
  readonly issue: PlanCheckIssue | null;
  readonly vote: { readonly pollId: string } | null;
  readonly legAfter: string | null;
  /** The leg itself (the open day map shortens it to "20 MIN" or "WALK"). */
  readonly legAfterLeg: DayLeg | null;
  readonly gapsAfter: readonly FreeGap[];
  /** The check's issue whose note prints under this stop (each note prints once). */
  readonly note: PlanCheckIssue | null;
  /** Mine alone: a stop I skip, or one only I have (or have changed). */
  readonly personal: PersonalMark | null;
  /** Today only: the stop is over, on now, or the next one. */
  readonly moment: StopMoment | null;
  /** Today only: the clock, on the line drawn above the first stop still to come. */
  readonly nowLine: string | null;
}

/**
 * A clock time short enough for the time column: a 12-hour time closes up and lowers its period
 * ("10:00 AM" → "10:00am"), which keeps it on one line; a 24-hour time is left as it is.
 */
export function columnClock(locale: string, minutes: number): string {
  return clock(locale, minutes).replace(/\s*([AP]M)$/iu, (_, period: string) =>
    period.toLowerCase(),
  );
}

/** The stops an issue names. */
function namedIn(issue: PlanCheckIssue): readonly string[] {
  if (issue.kind === 'clash') return [issue.params.first, issue.params.second];
  return issue.stable_ids;
}

/**
 * The stop each issue's note prints under: the first stop of the day it names, once. An issue
 * that names a stop the day no longer has (removed, or moved to another day since the check ran)
 * prints nowhere: its words would have a hole where the name was.
 */
export function noteStops(day: TripDay): Map<string, PlanCheckIssue> {
  const order = day.stops.map((stop) => stop.stableId);
  const notes = new Map<string, PlanCheckIssue>();
  for (const issue of day.issues) {
    if (issue.severity !== 'fix') continue;
    const named = namedIn(issue);
    if (named.length === 0 || named.some((id) => !order.includes(id))) continue;
    const first = order.find((id) => named.includes(id));
    if (first !== undefined && !notes.has(first)) notes.set(first, issue);
  }
  return notes;
}

/** "Only you": on a stop no one else in the crew has. */
export function onlyYouDetail(): string {
  return t({ id: 'plan.tripMap.personal.onlyYou', message: 'Only you' });
}

export function personalDetail(mark: PersonalMark): string {
  return mark === 'skipping'
    ? t({ id: 'plan.tripMap.personal.skipping', message: 'You’re skipping this' })
    : onlyYouDetail();
}

function names(
  locale: string,
  uids: readonly string[],
  members: readonly PlanMember[],
  me: string | null,
) {
  const you = t({ id: 'plan.tripMap.you', message: 'you' });
  const named = members.filter((member) => uids.includes(member.uid) && member.uid !== me);
  const parts = named.map((member) => member.name);
  if (me !== null && uids.includes(me)) parts.push(you);
  return format.list(locale, parts);
}

function detailOf(
  locale: string,
  stop: DayItem,
  issue: PlanCheckIssue | null,
  vote: TripDay['vote'],
  members: readonly PlanMember[],
  me: string | null,
  personal: PersonalMark | null,
): string | undefined {
  if (personal !== null) return personalDetail(personal);
  if (vote !== null) {
    const voted = vote.ballots;
    const crew = members.length;
    const line = t({ id: 'plan.tripMap.voted', message: `${voted} of ${crew} voted` });
    if (stop.amountMinor === null || stop.currency === null) return line;
    const each = compactMoney(locale, stop.amountMinor, stop.currency);
    return t({ id: 'plan.tripMap.votedEach', message: `${line} · ${each} each` });
  }
  if (issue?.kind === 'rain') {
    const { from, to } = issue.params;
    return t({ id: 'plan.tripMap.rainLikely', message: `Rain likely ${from}–${to}` });
  }
  const crewIds = members.map((member) => member.uid);
  const some = stop.attendeeIds.filter((id) => crewIds.includes(id));
  if (some.length > 0 && some.length < crewIds.length) return names(locale, some, members, me);
  if (!stop.byGuide && stop.notes !== null && stop.notes !== stop.title) return stop.notes;
  return undefined;
}

/** The free people as words: "Alex, Jordan, Dev and you". */
export function whoFree(
  locale: string,
  gap: FreeGap,
  members: readonly PlanMember[],
  me: string | null,
): string {
  return names(locale, gap.whoFree, members, me);
}

export function buildStopRows(input: {
  readonly locale: string;
  readonly day: TripDay;
  /** The leg after each stop, in the day's order (`DayRoute.after`). */
  readonly after: readonly (DayLeg | null)[];
  readonly gaps: readonly FreeGap[];
  readonly members: readonly PlanMember[];
  readonly me: string | null;
  /** Where today is on this day; null (or absent) on any other day. */
  readonly progress?: DayProgress | null | undefined;
}): StopRow[] {
  const { locale, day } = input;
  const notes = noteStops(day);
  const progress = input.progress ?? null;
  // The NOW line sits above the first stop that is not over yet.
  const upcoming =
    progress === null
      ? undefined
      : day.stops.find((stop) => progress.moments.get(stop.stableId) !== 'done');
  return day.stops.map((stop, index) => {
    const issue = issueFor(day, stop.stableId);
    const personal = day.personal?.get(stop.stableId) ?? null;
    const vote = day.vote?.stableId === stop.stableId ? day.vote : null;
    const leg = input.after[index] ?? undefined;
    return {
      stop,
      n: index + 1,
      time: stop.start === null ? '' : columnClock(locale, stop.start),
      length:
        stop.start === null || stop.end === null ? undefined : lengthLabel(stop.end - stop.start),
      detail: detailOf(locale, stop, issue, vote, input.members, input.me, personal),
      issue: issue?.severity === 'fix' ? issue : null,
      vote: vote === null ? null : { pollId: vote.pollId },
      legAfter: leg === undefined ? null : legLabel(leg),
      legAfterLeg: leg ?? null,
      gapsAfter: input.gaps.filter((gap) => gap.afterStableId === stop.stableId),
      note: notes.get(stop.stableId) ?? null,
      personal,
      moment: progress?.moments.get(stop.stableId) ?? null,
      nowLine:
        progress !== null && upcoming?.stableId === stop.stableId
          ? clock(locale, progress.nowMinutes)
          : null,
    };
  });
}

/** The stops only I have on the day, as rows for the "Only you" list under it. */
export function mineRows(locale: string, day: TripDay): { time: string; stop: DayItem }[] {
  return (day.mine ?? []).map((stop) => ({
    time: stop.start === null ? '' : columnClock(locale, stop.start),
    stop,
  }));
}

export interface StayRows {
  /** "07:50", the leg to the first stop: when to leave the stay. */
  readonly leave: { readonly time: string; readonly leg: string } | null;
  /** "21:40", the leg back: when the day ends at the stay. */
  readonly back: { readonly time: string; readonly leg: string } | null;
}

/**
 * The two ends of a day the header's travel time counts and the stops never showed: leaving the
 * stay in time for the first stop, and getting back to it after the last.
 */
export function stayRows(
  locale: string,
  day: TripDay,
  route: {
    readonly fromStay?: DayLeg | null | undefined;
    readonly toStay?: DayLeg | null | undefined;
  },
): StayRows {
  const first = day.stops[0];
  const last = day.stops[day.stops.length - 1];
  const out = route.fromStay ?? null;
  const home = route.toStay ?? null;
  const lastEnd = last === undefined ? null : (last.end ?? last.start);
  return {
    leave:
      out === null || first === undefined || first.start === null
        ? null
        : { time: columnClock(locale, first.start - out.minutes), leg: legLabel(out) },
    back:
      home === null || lastEnd === null
        ? null
        : { time: columnClock(locale, lastEnd + home.minutes), leg: legLabel(home) },
  };
}
