/**
 * The plan check's words (7h-1), from each issue's numbers and ids: the kind's tag, the card's
 * title and explanation, the line under it that says what FIX does, and the TO KNOW lines. The
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

export function issueWords(issue: PlanCheckIssue, ctx: IssueContext): IssueWords {
  switch (issue.kind) {
    case 'clash': {
      const first = ctx.name(issue.params.first);
      const second = ctx.name(issue.params.second);
      const end = ctx.endOf(issue.params.first) ?? '';
      const start = ctx.startOf(issue.params.second) ?? '';
      return {
        title: t({ id: 'plan.check.clash.title', message: `${first} runs into ${second}` }),
        body: t({
          id: 'plan.check.clash.body',
          message: `${first} ends at ${end}. ${second} starts at ${start}.`,
        }),
      };
    }
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

/** The "→ …" line: what FIX does. Null when there is nothing to do. */
export function fixSummary(
  issue: PlanCheckIssue,
  ctx: IssueContext,
  preview: FixPreview,
): string | null {
  const fix = issue.fix;
  if (fix === null || fix.kind === 'none') return null;
  if (fix.kind === 'apply') {
    const op = fix.ops[0];
    const at = op?.after?.starts_at;
    if (op === undefined || typeof at !== 'string') {
      return t({ id: 'plan.check.fix.generic', message: 'Move it to a time that works' });
    }
    const place = ctx.name(op.target);
    const time = ctx.clock(at, issue.day_id);
    return t({ id: 'plan.check.fix.moveTo', message: `${place} at ${time}` });
  }
  switch (fix.screen) {
    case 'less_driving': {
      const saved = preview.savedMin ?? null;
      const moved = preview.movedTo ?? null;
      if (moved !== null && saved !== null) {
        const place = ctx.name(moved.stableId);
        const time = moved.time;
        const less = driveLine(saved);
        return t({
          id: 'plan.check.fix.reorderMove',
          message: `${place} at ${time}, and ${less} less driving`,
        });
      }
      if (saved !== null) {
        const less = driveLine(saved);
        return t({ id: 'plan.check.fix.reorder', message: `Same day, ${less} less driving` });
      }
      return t({ id: 'plan.check.fix.reorderPlain', message: 'Same day, less driving' });
    }
    case 'rain_crowds': {
      const swap = preview.swap ?? null;
      if (swap?.withName != null) {
        const other = swap.withName;
        return t({ id: 'plan.check.fix.swapWith', message: `Swap it with ${other}` });
      }
      if (swap !== null) {
        const to = swap.to;
        return issue.kind === 'crowds'
          ? t({ id: 'plan.check.fix.goAt', message: `Go at ${to}, before it fills up` })
          : t({ id: 'plan.check.fix.dryAt', message: `Move it to ${to}, when it’s dry` });
      }
      return t({ id: 'plan.check.fix.swapPlain', message: 'Move it to a better time' });
    }
    case 'too_far': {
      const nearer = preview.nearer ?? null;
      return nearer === null
        ? t({ id: 'plan.check.fix.nearerPlain', message: 'Something nearer instead' })
        : t({ id: 'plan.check.fix.nearer', message: `${nearer} instead, on the way back` });
    }
    case 'fill_gap':
      return t({ id: 'plan.check.fix.fillGap', message: 'Fill the free time' });
  }
}
