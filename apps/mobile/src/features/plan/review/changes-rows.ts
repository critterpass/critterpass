/**
 * The review's rows from the change set (7h-7): each change with its day tag, what it does
 * ("+ PLACE"), the time, what the time was, and why in words; and the ideas left for the person
 * under NEEDS YOU with where SEE leads.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids and op kinds, never copy. */
import { upper } from '@cp/i18n';
import type { FitReason } from '@cp/domain';
import type { Href } from 'expo-router';

import { driverPickDetail } from '@/features/drivers';
import { hrefFor } from '@/lib/navigation/screen-registry';

import { weekdayOf } from '../day/format';
import { dayTileColour } from '../overview/model/day-colour';
import { changeReason, leftLine, needsMoveExplainer, placedReason, wasLine } from './changes-copy';
import { driverPickName } from './chat-card-title';
import type { ChangeRow, NeedsYouRow } from './changes-review-view';
import type { LeftForYou } from './data/use-review-extras';
import type { ChangeCard } from './model/review-model';

const SPLIT_IDS = ['7e-3', '7e-1'] as const;
const PLACE_IDS = ['7e-1'] as const;
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
    if (card.driverPick !== null) {
      // A driver pick sits on its first day: the driver, then his days and the terms voted on.
      const first = card.driverPick.days[0]?.date ?? null;
      const day = input.days.find((d) => d.date === first);
      return {
        key: card.target,
        dayTag: upper(weekdayOf(first, input.locale), input.locale),
        dayColor: dayTileColour(day?.dayNo ?? 1),
        title: `→ ${upper(driverPickName(card.driverPick.name), input.locale)}`,
        detail: driverPickDetail(card.driverPick, input.locale),
        accepted: card.accepted,
      };
    }
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
      dayTag: upper(weekdayOf(date, input.locale), input.locale),
      dayColor: dayTileColour(dayNo ?? 1),
      title: `${mark} ${upper(side?.label ?? '', input.locale)}`,
      detail: [side?.time ?? '', was, why].filter((part) => part !== '').join(' · '),
      accepted: card.accepted,
    };
  });
}

export function needsYouRows(input: {
  readonly left: readonly LeftForYou[];
  readonly locale: string;
  readonly tripId: string;
  readonly explained: ReadonlySet<string>;
  readonly stopName: (stableId: string) => string | null;
  /** The trip's guide, named in the explainer. */
  readonly guideName: string;
  readonly onExplain: (ideaId: string) => void;
  readonly onOpen: (href: Href) => void;
}): NeedsYouRow[] {
  const { tripId, stopName } = input;
  return input.left.map((idea) => {
    const stop = idea.needsMove === null ? null : stopName(idea.needsMove);
    return {
      key: idea.ideaId,
      name: upper(idea.name, input.locale),
      line: leftLine(idea, stopName),
      explainer: input.explained.has(idea.ideaId)
        ? needsMoveExplainer(stop, input.guideName)
        : null,
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
