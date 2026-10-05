/**
 * What the change card in crew chat says the change is: for one change by a person, the place,
 * the day and the time in a sentence ("Minh wants to add Bà Nà Hills, Wed 07:00"), so nobody
 * says yes without knowing to what. Several changes, or the guide's own (for the rain, a delay),
 * keep the counted headline.
 */
import { t } from '@lingui/core/macro';

import type { ChangeCard } from './model/review-model';
import { reviewTitle } from './review-copy';

export interface ChangeTitleInput {
  readonly cards: readonly ChangeCard[];
  readonly trigger: string | null;
  /** The author's first name; null for the guide's own change set. */
  readonly author: string | null;
  /** The reader wrote it. */
  readonly mine: boolean;
  /** "Wed" for a plan day, in the reader's language; null while the trip has no dates. */
  readonly dayLabel: (dayNo: number) => string | null;
}

/** "Wed 07:00", "Wed", "07:00" or '' for where a change lands. */
function when(card: ChangeCard, dayLabel: ChangeTitleInput['dayLabel']): string {
  const side = card.after ?? card.before;
  const day = side?.dayNo == null ? null : dayLabel(side.dayNo);
  return [day, side?.time ?? null].filter((part) => part !== null && part !== '').join(' ');
}

export function changeTitle(input: ChangeTitleInput): string {
  const accepted = input.cards.filter((card) => card.accepted);
  const [card] = accepted;
  const place = (card?.after ?? card?.before)?.label ?? '';
  if (accepted.length !== 1 || card === undefined || place === '') {
    return reviewTitle(input.trigger, input.cards.length);
  }
  if (input.author === null && !input.mine) return reviewTitle(input.trigger, input.cards.length);
  const name = input.author ?? '';
  const at = when(card, input.dayLabel);
  const where = at === '' ? place : `${place}, ${at}`;
  switch (card.op) {
    case 'add':
      return input.mine
        ? t({ id: 'plan.card.title.addMine', message: `You want to add ${where}` })
        : t({ id: 'plan.card.title.add', message: `${name} wants to add ${where}` });
    case 'remove':
      return input.mine
        ? t({ id: 'plan.card.title.removeMine', message: `You want to drop ${place}` })
        : t({ id: 'plan.card.title.remove', message: `${name} wants to drop ${place}` });
    case 'move':
    case 'retime':
      return input.mine
        ? t({ id: 'plan.card.title.moveMine', message: `You want to move ${place} to ${at}` })
        : t({ id: 'plan.card.title.move', message: `${name} wants to move ${place} to ${at}` });
    case 'swap':
      return input.mine
        ? t({ id: 'plan.card.title.swapMine', message: `You want to swap in ${where}` })
        : t({ id: 'plan.card.title.swap', message: `${name} wants to swap in ${where}` });
  }
}
