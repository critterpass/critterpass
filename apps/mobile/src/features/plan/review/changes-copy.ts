/**
 * The review's words in the section 7 layout (7h-7): the headline for a set Tokek placed ("6
 * PLACED, 2 FOR YOU") and for fixes and swaps, the calm summary when nothing booked or must-do
 * moved, each placed stop's short reason ("before the crowds", "on the way"), the line under an
 * idea left for the person, and the driving total ("+1H20 DRIVING").
 */
/* eslint-disable lingui/no-unlocalized-strings -- reason codes and trigger names, never copy (every line is worded through `t`). */
import { i18n } from '@lingui/core';
import { upper } from '@cp/i18n';
import type { FitReason, StoredFit } from '@cp/domain';
import { plural, t } from '@lingui/core/macro';

import { fixReasonWords } from '../check/fix-copy';
import type { LeftForYou } from './data/use-review-extras';
import { reviewTitle } from './review-copy';

export function placedHeadline(placed: number, forYou: number): string {
  const first = t({
    id: 'plan.review.placed',
    message: plural(placed, { one: '# PLACED', other: '# PLACED' }),
  });
  if (forYou === 0) return first;
  const second = t({
    id: 'plan.review.forYou',
    message: plural(forYou, { one: '# FOR YOU', other: '# FOR YOU' }),
  });
  return t({ id: 'plan.review.placedForYou', message: `${first},\n${second}` });
}

/** Fixes and swaps say what they are; other triggers keep the headline they have today. */
export function changesHeadline(trigger: string | null, count: number): string {
  if (trigger === 'check') {
    return t({
      id: 'plan.review.title.check',
      message: plural(count, { one: '# FIX', other: '# FIXES' }),
    });
  }
  if (trigger === 'swap') {
    return t({
      id: 'plan.review.title.swap',
      message: plural(count, { one: '# CHANGE FOR THE SWAP', other: '# CHANGES FOR THE SWAP' }),
    });
  }
  if (trigger === 'gap') {
    return t({
      id: 'plan.review.title.gap',
      message: plural(count, { one: '# FOR THE FREE TIME', other: '# FOR THE FREE TIME' }),
    });
  }
  return upper(reviewTitle(trigger, count), i18n.locale || 'en');
}

const REASON_KEY = /^[a-z0-9]+(?:_[a-z0-9]+)+$/u;

/**
 * Why a change is in the set, in words: the plan check's fixes are worded by the check itself
 * (one table for every screen), the guide's other keys here, and what a person wrote is shown as
 * written.
 */
export function changeReason(reason: string): string {
  const key = reason.replace(/^undo: /u, '');
  const fix = fixReasonWords(key);
  if (fix !== null) return fix;
  switch (key) {
    case 'closed':
      return t({ id: 'plan.review.reason.closed', message: 'moved to when it’s open' });
    case 'rain':
      return t({ id: 'plan.review.reason.rain', message: 'moved out of the rain' });
    case 'crowds':
      return t({ id: 'plan.review.reason.crowds', message: 'moved to a quieter hour' });
    default:
      return REASON_KEY.test(key)
        ? t({ id: 'plan.review.reason.fix', message: 'moved so the day works' })
        : reason;
  }
}

/** "was 15:00" beside a new time. */
export function wasLine(time: string): string {
  return t({ id: 'plan.review.was', message: `was ${time}` });
}

/** The organiser's own way in: straight into the plan, no vote. */
export function addNowLabel(ideas: boolean): string {
  return ideas
    ? t({ id: 'plan.review.addNow', message: 'ADD THEM NOW' })
    : t({ id: 'plan.review.putInNow', message: 'PUT IT IN THE PLAN NOW' });
}

export function askCrewLabel(): string {
  return t({ id: 'plan.review.askCrew', message: 'Ask the crew first' });
}

export function appliedToast(count: number, ideas: boolean): string {
  return ideas
    ? t({
        id: 'plan.review.toast.placed',
        message: plural(count, {
          one: '# place added to the plan',
          other: '# places added to the plan',
        }),
      })
    : t({
        id: 'plan.review.toast.applied',
        message: plural(count, {
          one: '# change is in the plan',
          other: '# changes are in the plan',
        }),
      });
}

export function sentToast(): { readonly title: string; readonly subtitle: string } {
  return {
    title: t({ id: 'plan.review.toast.sent', message: 'Sent to the crew' }),
    subtitle: t({
      id: 'plan.review.toast.sentLine',
      message: 'Your yes is counted. It goes in once enough of them say yes.',
    }),
  };
}

function has(reasons: readonly FitReason[], code: FitReason['code']): boolean {
  return reasons.some((reason) => reason.code === code);
}

/** A placed stop's short reason, after its time ("08:00 · before the crowds"). */
export function placedReason(
  reasons: readonly FitReason[],
  stopName: (stableId: string) => string | null,
): string {
  const after = reasons.find(
    (reason): reason is Extract<FitReason, { code: 'after_item' }> => reason.code === 'after_item',
  );
  const afterName = after === undefined ? null : stopName(after.params.stable_id);
  if (has(reasons, 'quiet_until') || has(reasons, 'busy_from')) {
    return t({ id: 'plan.review.why.crowds', message: 'before the crowds' });
  }
  if (has(reasons, 'on_the_way'))
    return t({ id: 'plan.review.why.onTheWay', message: 'on the way' });
  if (afterName !== null) {
    return t({ id: 'plan.review.why.after', message: `after ${afterName}` });
  }
  if (has(reasons, 'opens_at')) return t({ id: 'plan.review.why.opens', message: 'as it opens' });
  if (has(reasons, 'dry_window') || has(reasons, 'dry_mornings')) {
    return t({ id: 'plan.review.why.dry', message: 'while it’s dry' });
  }
  if (has(reasons, 'free_day'))
    return t({ id: 'plan.review.why.freeDay', message: 'on the free day' });
  return t({ id: 'plan.review.why.gap', message: 'in a free gap' });
}

function splitCounts(fit: StoredFit | null): { want: number; ratherNot: number } | null {
  for (const day of fit?.days ?? []) {
    for (const reason of day.reasons) {
      if (reason.code === 'crew_split') {
        return { want: reason.params.want, ratherNot: reason.params.rather_not };
      }
    }
  }
  return null;
}

/** The line under an idea left for the person. */
export function leftLine(idea: LeftForYou, stopName: (stableId: string) => string | null): string {
  if (idea.reason === 'split') {
    const counts = splitCounts(idea.fit);
    if (counts === null)
      return t({ id: 'plan.review.left.splitPlain', message: 'The crew is split' });
    const { want, ratherNot } = counts;
    return t({ id: 'plan.review.left.split', message: `The crew is split ${want}–${ratherNot}` });
  }
  if (idea.reason === 'needs_move') {
    const stop = idea.needsMove === null ? null : stopName(idea.needsMove);
    return stop === null
      ? t({ id: 'plan.review.left.needsMovePlain', message: 'Only fits if a stop moves' })
      : t({ id: 'plan.review.left.needsMove', message: `Only fits if ${stop} moves` });
  }
  if (idea.reason === 'full') {
    return t({ id: 'plan.review.left.full', message: 'The days it fits are full' });
  }
  return t({ id: 'plan.review.left.noDay', message: 'No day takes it yet' });
}

/** What SEE says for an idea that needs a stop moved (undesigned: the explainer under its row). */
export function needsMoveExplainer(stop: string | null, guideName: string): string {
  return stop === null
    ? t({
        id: 'plan.review.left.explainPlain',
        message: `${guideName} never moves a stop for an idea. Move one on the day plan, then add it.`,
      })
    : t({
        id: 'plan.review.left.explain',
        message: `${guideName} never moves a stop for an idea. Move ${stop} on the day plan, then add it.`,
      });
}

/** "+1H20 DRIVING", "−20 MIN DRIVING"; null when the drive doesn't change. */
export function drivingChip(minutes: number): string | null {
  if (minutes === 0) return null;
  const sign = minutes > 0 ? '+' : '−';
  const abs = Math.abs(minutes);
  const hours = String(Math.floor(abs / 60));
  const rest = String(abs % 60).padStart(2, '0');
  const mins = String(abs);
  if (abs < 60)
    return t({ id: 'plan.review.driving.minutes', message: `${sign}${mins} MIN DRIVING` });
  return t({ id: 'plan.review.driving.hours', message: `${sign}${hours}H${rest} DRIVING` });
}

export function onlyYouLabel(): string {
  return t({ id: 'plan.review.onlyYou', message: 'ONLY YOU SEE THIS' });
}

export function backIdeasLabel(): string {
  return t({ id: 'plan.review.backIdeas', message: 'Ideas' });
}

/** "1 of 3 yeses so far" under a vote. */
export function tallyLine(yes: number, needed: number): string {
  return t({
    id: 'plan.review.tallySoFar',
    message: plural(needed, { one: `${yes} of # yes so far`, other: `${yes} of # yeses so far` }),
  });
}
