/**
 * The review's rows from the change set (7h-7): each change with its day tag, what it does
 * ("+ PLACE"), the time, what the time was, and why in words; and the ideas left for the person
 * under NEEDS YOU with where SEE leads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and op kinds, never copy. */
import type { FitReason } from '@cp/domain';
import type { Href } from 'expo-router';

import { hrefFor } from '@/lib/navigation/screen-registry';

import { dayTileColour, weekdayOf } from '../overview/day-card';
import { changeReason, leftLine, needsMoveExplainer, placedReason, wasLine } from './changes-copy';
import type { ChangeRow, NeedsYouRow } from './changes-review-view';
import type { LeftForYou } from './data/use-review-extras';
import type { ChangeCard } from './model/review-model';

const SPLIT_IDS = ['7e-3', '7e-1', '3d-3'] as const;
const PLACE_IDS = ['7e-1', '3d-3'] as const;
const IDEAS_ID = '7f-2';

export function changeRows(input: {
  readonly cards: readonly ChangeCard[];
  readonly days: readonly { readonly dayNo: number; readonly date: string | null }[];
  readonly locale: string;
  /** Placed ideas carry fit reasons; every other set carries its own reason per change. */
  readonly placedReasons: ReadonlyMap<string, readonly FitReason[]> | null;
  readonly stopName: (stableId: string) => string | null;
}): ChangeRow[] {
  return input.cards.map((card) => {
    const side = card.after ?? card.before;
    const dayNo = side?.dayNo ?? card.before?.dayNo ?? null;
    const date = input.days.find((day) => day.dayNo === dayNo)?.date ?? null;
    const mark = card.op === 'add' ? '+' : card.op === 'remove' ? '−' : '→';
    const why =
      input.placedReasons === null
        ? changeReason(card.reason)
        : placedReason(input.placedReasons.get(card.target) ?? [], input.stopName);
    const was =
      card.before?.time != null && card.after?.time != null && card.before.time !== card.after.time
        ? wasLine(card.before.time)
        : '';
    return {
      key: card.target,
      dayTag: weekdayOf(date, input.locale).toUpperCase(),
      dayColor: dayTileColour(dayNo ?? 1),
      title: `${mark} ${(side?.label ?? '').toUpperCase()}`,
      detail: [side?.time ?? '', was, why].filter((part) => part !== '').join(' · '),
      accepted: card.accepted,
    };
  });
}

export function needsYouRows(input: {
  readonly left: readonly LeftForYou[];
  readonly tripId: string;
  readonly explained: ReadonlySet<string>;
  readonly stopName: (stableId: string) => string | null;
  readonly onExplain: (ideaId: string) => void;
  readonly onOpen: (href: Href) => void;
}): NeedsYouRow[] {
  const { tripId, stopName } = input;
  return input.left.map((idea) => {
    const stop = idea.needsMove === null ? null : stopName(idea.needsMove);
    return {
      key: idea.ideaId,
      name: idea.name.toUpperCase(),
      line: leftLine(idea, stopName),
      explainer: input.explained.has(idea.ideaId) ? needsMoveExplainer(stop) : null,
      onSee: () => {
        if (idea.reason === 'needs_move') {
          input.onExplain(idea.ideaId);
          return;
        }
        const params = { tripId, placeId: idea.poiId ?? '' };
        const ids = idea.reason === 'split' ? SPLIT_IDS : PLACE_IDS;
        const href =
          idea.poiId === null
            ? hrefFor(IDEAS_ID, { tripId })
            : ids.map((id) => hrefFor(id, params)).find((found) => found !== undefined);
        if (href !== undefined) input.onOpen(href);
      },
    };
  });
}
