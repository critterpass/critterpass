/**
 * One day's stops as rows for the trip map's day sheet (7a-2) and the day plan (7b-1): time and
 * length, a detail line (the open vote and its cost, the rain the check found, who is going when
 * it isn't everyone), the leg to the next stop and the free time after it.
 */
import { t } from '@lingui/core/macro';
import type { PlanCheckIssue } from '@cp/domain';
import { format } from '@cp/i18n';

import type { DayLeg } from '@/data/legs/day-legs';
import type { DayItem } from '@/data/plan/plan-model';
import type { PlanMember } from '@/data/plan/use-trip-plan';

import { clock, money } from '../day/format';
import type { FreeGap } from './day-gaps';
import { legLabel, lengthLabel } from './format';
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
): string | undefined {
  if (vote !== null) {
    const voted = vote.ballots;
    const crew = members.length;
    const line = t({ id: 'plan.tripMap.voted', message: `${voted} of ${crew} voted` });
    if (stop.amountMinor === null || stop.currency === null) return line;
    const each = money(locale, stop.amountMinor, stop.currency);
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
  /** Legs for the day's ends: the stay first when there is one, then the stops in order. */
  readonly legs: readonly DayLeg[];
  readonly startsAtStay: boolean;
  readonly gaps: readonly FreeGap[];
  readonly members: readonly PlanMember[];
  readonly me: string | null;
}): StopRow[] {
  const { locale, day } = input;
  const mapped = day.stops.filter((stop) => stop.place !== null).map((stop) => stop.stableId);
  return day.stops.map((stop, index) => {
    const issue = issueFor(day, stop.stableId);
    const vote = day.vote?.stableId === stop.stableId ? day.vote : null;
    const placed = mapped.indexOf(stop.stableId);
    const next = day.stops[index + 1];
    const nextPlaced = next === undefined ? -1 : mapped.indexOf(next.stableId);
    // Legs join stops with a place: the leg after this stop is the one into the next mapped stop.
    const legIndex =
      placed < 0 || nextPlaced !== placed + 1 ? -1 : placed + (input.startsAtStay ? 1 : 0);
    const leg = legIndex < 0 ? undefined : input.legs[legIndex];
    return {
      stop,
      n: index + 1,
      time: stop.start === null ? '' : clock(locale, stop.start),
      length:
        stop.start === null || stop.end === null ? undefined : lengthLabel(stop.end - stop.start),
      detail: detailOf(locale, stop, issue, vote, input.members, input.me),
      issue: issue?.severity === 'fix' ? issue : null,
      vote: vote === null ? null : { pollId: vote.pollId },
      legAfter: leg === undefined ? null : legLabel(leg),
      legAfterLeg: leg ?? null,
      gapsAfter: input.gaps.filter((gap) => gap.afterStableId === stop.stableId),
    };
  });
}
