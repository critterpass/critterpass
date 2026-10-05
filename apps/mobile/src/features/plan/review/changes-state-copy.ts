/**
 * The review's words for where the change set stands (7h-7; the states the render leaves open are
 * logged in docs/undesigned-states.md): who asked for it, whether it fits (said only when checked
 * against the plan, else what it would collide with), my own answer with the tally and when the
 * vote closes, and where it went once it is in.
 */
import { t } from '@lingui/core/macro';

import { tallyLine } from './changes-copy';
import type { Collision } from './model/after-fit';

/** What a calm set says: placed ideas land in gaps; fixes leave bookings and must-dos alone. */
export function calmSummary(ideas = true): string {
  return ideas
    ? t({
        id: 'plan.review.summary.calm',
        message: 'Everything lands in a gap. Nothing booked and nobody’s must-do moved.',
      })
    : t({
        id: 'plan.review.summary.calmFixes',
        message: 'Nothing booked and nobody’s must-do moves. Untick anything you’d rather keep.',
      });
}

/** "closes in 23 h", "closes in 40 min"; null once the time has passed or isn't known. */
export function closesLine(closesAt: string | null, now: Date): string | null {
  if (closesAt === null) return null;
  const minutes = Math.round((Date.parse(closesAt) - now.getTime()) / 60_000);
  if (Number.isNaN(minutes) || minutes <= 0) return null;
  const hours = String(Math.round(minutes / 60));
  const mins = String(minutes);
  return minutes < 60
    ? t({ id: 'plan.review.closesMinutes', message: `closes in ${mins} min` })
    : t({ id: 'plan.review.closesHours', message: `closes in ${hours} h` });
}

/** Done, in the words of who it is done for: a crew of one has no "everyone". */
export function doneNotice(solo: boolean): string {
  return solo
    ? t({ id: 'plan.review.notice.approvedSolo', message: 'Done. It’s in your plan.' })
    : t({ id: 'plan.review.notice.approved', message: 'Done. It’s in everyone’s plan.' });
}

export function backCheckLabel(): string {
  return t({ id: 'plan.review.backCheck', message: 'Plan check' });
}

export function backPlainLabel(): string {
  return t({ id: 'plan.review.back', message: 'Back' });
}

export function seeDayLabel(day: string): string {
  return t({ id: 'plan.review.seeDay', message: `See ${day}` });
}

/** What the set would collide with, named. */
export function collisionLine(
  collision: Collision,
  stopName: (stableId: string) => string | null,
): string {
  const a = stopName(collision.stableId) ?? t({ id: 'plan.review.aStop', message: 'a stop' });
  const b = stopName(collision.withId) ?? t({ id: 'plan.review.aStop', message: 'a stop' });
  const minutes = String(collision.minutes);
  return collision.kind === 'overlap'
    ? t({
        id: 'plan.review.collision.overlap',
        message: `${a} would run into ${b}. Untick it, or move one of them on the day first.`,
      })
    : t({
        id: 'plan.review.collision.travel',
        message: `${a} leaves about ${minutes} min too little to get to or from ${b}.`,
      });
}

/** Under the headline: who asked, then whether it fits or what it runs into. */
export function summaryLine(input: {
  /** The crew member who suggested it, when it wasn't the reader or the guide. */
  readonly author: string | null;
  readonly collision: Collision | null;
  readonly stopName: (stableId: string) => string | null;
  readonly calm: boolean;
  readonly ideas: boolean;
}): string {
  const who = input.author ?? '';
  const asked =
    input.author === null
      ? ''
      : `${t({ id: 'plan.review.suggestedBy', message: `${who} suggested this.` })} `;
  const fits =
    input.collision !== null
      ? collisionLine(input.collision, input.stopName)
      : input.calm
        ? calmSummary(input.ideas)
        : t({
            id: 'plan.review.summary.touches',
            message: 'Some of this moves a booking or a must-do. Look before you send.',
          });
  return `${asked}${fits}`;
}

/** "You said yes · 2 of 2 yeses so far · closes in 23 h". */
export function voteLine(input: {
  readonly mine: 'yes' | 'no' | null;
  /** The reader sent the set: sending was their yes. */
  readonly author: boolean;
  readonly yes: number;
  readonly needed: number;
  readonly closesAt: string | null;
  readonly now: Date;
}): string {
  const { yes, needed } = input;
  const own =
    input.mine === null
      ? ''
      : input.mine === 'no'
        ? t({ id: 'plan.review.youSaidNo', message: 'You said not this' })
        : input.author
          ? t({ id: 'plan.review.yourYes', message: 'Your yes is counted' })
          : t({ id: 'plan.review.youSaidYes', message: 'You said yes' });
  const count = tallyLine(yes, needed);
  return [own, count, closesLine(input.closesAt, input.now) ?? '']
    .filter((part) => part !== '')
    .join(' · ');
}
