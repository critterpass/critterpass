/**
 * The plan check's words (7h-1), from each issue's numbers and ids: the kind's tag, the card's
 * title and explanation, and the TO KNOW lines (what FIX does is worded in `fix-copy.ts`). The
 * server sends codes only; every word is here, in the reader's language. Crowd copy names its
 * source: an editorial curve is "usually busy", only visit counts say what crews saw.
 */
import type { PlanCheckIssue } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';
import { tokens } from '@cp/design-tokens';

import { driveLine, driveTitle } from './format';

export interface IssueContext {
  /** A stop's name, or a neutral word when the stop is gone. */
  readonly name: (stableId: string) => string;
  readonly startOf: (stableId: string) => string | null;
  readonly endOf: (stableId: string) => string | null;
  readonly dayDate: (dayId: string | null) => string | null;
  readonly bookingTitle: (bookingId: string) => string | null;
  /** "October", in the reader's language. */
  readonly month: (date: string) => string;
  /** "1 Oct", in the reader's language. */
  readonly shortDate: (instant: string) => string;
  readonly weekday: (date: string | null) => string;
  /** `HH:MM` of an instant on the issue's day, in the trip's zone. */
  readonly clock: (instant: string, dayId: string | null) => string;
}

export interface FixPreview {
  /** The day's best order cuts this much driving. */
  readonly savedMin?: number | null;
  /** Some of the new order's drives could not be routed in time: its numbers are estimates. */
  readonly estimated?: boolean;
  /** The clash's later stop lands here in the best order. */
  readonly movedTo?: { readonly stableId: string; readonly time: string } | null;
  /** The rain or crowds block's own swap. */
  readonly swap?: { readonly to: string; readonly withName: string | null } | null;
  /** The too-far swap's place, what it saves in the car, and the drive to it. */
  readonly nearer?: string | null;
  readonly nearerSavedMin?: number | null;
  readonly nearerLegMin?: number | null;
}

export interface IssueTag {
  readonly label: string;
  readonly color: string;
}

export function kindTag(kind: PlanCheckIssue['kind']): IssueTag {
  switch (kind) {
    case 'clash':
      return {
        label: t({ id: 'plan.check.tag.clash', message: 'Clash' }),
        color: tokens.color.pink,
      };
    case 'closed':
      return {
        label: t({ id: 'plan.check.tag.closed', message: 'Closed' }),
        color: tokens.color.pink,
      };
    case 'too_far':
      return {
        label: t({ id: 'plan.check.tag.tooFar', message: 'Too far' }),
        color: tokens.color.orange,
      };
    case 'rain':
      return { label: t({ id: 'plan.check.tag.rain', message: 'Rain' }), color: tokens.color.blue };
    case 'crowds':
      return {
        label: t({ id: 'plan.check.tag.crowds', message: 'Crowds' }),
        color: tokens.color.yellow,
      };
    case 'pace':
      return {
        label: t({ id: 'plan.check.tag.pace', message: 'Full day' }),
        color: tokens.color.green.base,
      };
    case 'booking_note':
      return {
        label: t({ id: 'plan.check.tag.booking', message: 'Booking' }),
        color: tokens.color.green.base,
      };
  }
}

export interface IssueWords {
  readonly title: string;
  readonly body: string;
}

const minuteOfClock = (clock: string): number =>
  Number(clock.slice(0, 2)) * 60 + Number(clock.slice(3, 5));

/**
 * A clash in words that give the reason: how long the drive between the two is and how much time
 * the plan leaves for it, or by how much they overlap. `end` and `start` are the plan's own
 * `HH:MM`; without them (a stop that is gone) the card says only that the time is short.
 */
export function clashWords(
  first: string,
  second: string,
  end: string | null,
  start: string | null,
  shortMinutes: number,
): IssueWords {
  if (end === null || start === null) {
    return {
      title: t({ id: 'plan.check.clash.titleTight', message: `Tight: ${first} → ${second}` }),
      body: t({
        id: 'plan.check.clash.plain',
        message: `There isn’t enough time to get from ${first} to ${second}.`,
      }),
    };
  }
  const gap = minuteOfClock(start) - minuteOfClock(end);
  if (gap < 0) {
    const over = driveLine(-gap);
    return {
      title: t({ id: 'plan.check.clash.titleOverlap', message: `Overlap: ${first} and ${second}` }),
      body: t({
        id: 'plan.check.clash.overlap',
        message: `They overlap by ${over}. ${first} ends at ${end}, ${second} starts at ${start}.`,
      }),
    };
  }
  const drive = driveLine(gap + shortMinutes);
  const free = driveLine(gap);
  return {
    title: t({ id: 'plan.check.clash.titleTight', message: `Tight: ${first} → ${second}` }),
    body:
      gap === 0
        ? t({
            id: 'plan.check.clash.noGap',
            message: `${drive} drive and no time between them. ${first} ends at ${end}, ${second} starts at ${start}.`,
          })
        : t({
            id: 'plan.check.clash.tight',
            message: `${drive} drive, ${free} free. ${first} ends at ${end}, ${second} starts at ${start}.`,
          }),
  };
}

export function issueWords(issue: PlanCheckIssue, ctx: IssueContext): IssueWords {
  switch (issue.kind) {
    case 'clash':
      return clashWords(
        ctx.name(issue.params.first),
        ctx.name(issue.params.second),
        ctx.endOf(issue.params.first),
        ctx.startOf(issue.params.second),
        issue.params.short_minutes,
      );
    case 'closed': {
      const place = ctx.name(issue.params.stable_id);
      const opens = issue.params.opens_at ?? '';
      const closes = issue.params.closes_at ?? '';
      return {
        title: t({ id: 'plan.check.closed.title', message: `${place} is shut then` }),
        body: issue.params.closed_all_day
          ? t({ id: 'plan.check.closed.allDay', message: 'It’s closed all day.' })
          : t({
              id: 'plan.check.closed.body',
              message: `It’s open ${opens} to ${closes} that day.`,
            }),
      };
    }
    case 'too_far': {
      const total = driveTitle(issue.params.drive_minutes);
      const longest = driveLine(issue.params.longest_leg_minutes);
      return {
        title: t({ id: 'plan.check.tooFar.title', message: `${total} in the car` }),
        body: issue.params.after_dark
          ? t({
              id: 'plan.check.tooFar.dark',
              message: `The longest drive is ${longest}, and it ends after dark.`,
            })
          : t({ id: 'plan.check.tooFar.body', message: `The longest drive is ${longest}.` }),
      };
    }
    case 'rain': {
      const place = ctx.name(issue.params.stable_id);
      const from = issue.params.from;
      const to = issue.params.to;
      const date = ctx.dayDate(issue.day_id);
      const month = date === null ? '' : ctx.month(date);
      const pct = String(issue.params.pct);
      return {
        title: t({ id: 'plan.check.rain.title', message: `${place} in the rain` }),
        body:
          issue.params.source === 'forecast'
            ? t({
                id: 'plan.check.rain.forecast',
                message: `The forecast says ${pct}% rain from ${from} to ${to}.`,
              })
            : t({
                id: 'plan.check.rain.normals',
                message: `${month} days here are usually wet from ${from} to ${to}.`,
              }),
      };
    }
    case 'crowds': {
      const place = ctx.name(issue.params.stable_id);
      const from = issue.params.busy_from;
      return {
        title: t({ id: 'plan.check.crowds.title', message: `${place} at the busy time` }),
        body:
          issue.params.source === 'visits'
            ? t({ id: 'plan.check.crowds.visits', message: `Crews saw it busy from ${from}.` })
            : t({ id: 'plan.check.crowds.editorial', message: `It’s usually busy from ${from}.` }),
      };
    }
    case 'pace':
    case 'booking_note':
      return { title: kindTag(issue.kind).label, body: knowLine(issue, ctx) };
  }
}

/** A TO KNOW line ("Tuesday has six stops in nine hours. It works, just."). */
export function knowLine(issue: PlanCheckIssue, ctx: IssueContext): string {
  if (issue.kind === 'pace') {
    const day = ctx.weekday(ctx.dayDate(issue.day_id));
    return t({
      id: 'plan.check.know.pace',
      message: plural(issue.params.stops, {
        one: `${day} has # stop in nine hours. It works, just.`,
        other: `${day} has # stops in nine hours. It works, just.`,
      }),
    });
  }
  if (issue.kind === 'booking_note') {
    const title = ctx.bookingTitle(issue.params.booking_id);
    const date = ctx.shortDate(issue.params.deadline);
    if (issue.params.kind === 'hold_expiry') {
      return title === null
        ? t({ id: 'plan.check.know.holdPlain', message: `A booking is held until ${date}.` })
        : t({ id: 'plan.check.know.hold', message: `${title} holds your place until ${date}.` });
    }
    return title === null
      ? t({
          id: 'plan.check.know.cancelPlain',
          message: `A booking cancels for free until ${date}.`,
        })
      : t({ id: 'plan.check.know.cancel', message: `${title} cancels for free until ${date}.` });
  }
  return issueWords(issue, ctx).body;
}
