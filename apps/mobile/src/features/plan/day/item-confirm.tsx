/**
 * The stop sheet's "are you sure" (design in code): taking a stop off the day, or changing one
 * that is booked or somebody's must-do. A must-do says whose it is: "You asked for this one" to
 * the person who did.
 */
import { t } from '@lingui/core/macro';

import type { DayItem } from '@/data/plan/plan-model';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

/** The question, what follows from it and the action, for every look. */
export function confirmWords({
  item,
  removing,
  canApply,
  mustDoMine,
  solo,
  alsoMoves,
}: {
  readonly item: DayItem;
  readonly removing: boolean;
  readonly canApply: boolean;
  readonly mustDoMine: boolean;
  readonly solo: boolean;
  readonly alsoMoves: string | null;
}): { readonly title: string; readonly lines: readonly string[]; readonly confirm: string } {
  const locked = item.lock !== null;
  const title =
    removing && !locked
      ? t({ id: 'plan.day.item.removeTitle', message: `Remove ${item.title}?` })
      : item.lock === 'booking'
        ? t({ id: 'plan.day.item.bookedTitle', message: 'This one is booked' })
        : item.lock === 'user'
          ? t({ id: 'plan.day.item.pinnedTitle', message: 'This one is pinned to its time' })
          : t({ id: 'plan.day.item.lockedTitle', message: 'This one is a must-do' });
  const line =
    item.lock === 'booking'
      ? t({
          id: 'plan.day.item.bookedLine',
          message: 'The booking stays as it is. Check the supplier can change it.',
        })
      : item.lock === 'must_do'
        ? mustDoMine
          ? t({ id: 'plan.day.item.mustDoMineLine', message: 'You asked for this one.' })
          : t({
              id: 'plan.day.item.lockedLine',
              message: 'Someone asked for this one. They’ll see the change.',
            })
        : removing
          ? solo
            ? t({ id: 'plan.day.item.removeLineSolo', message: 'It comes off your day.' })
            : t({
                id: 'plan.day.item.removeLine',
                message: 'It comes off the day for everyone going.',
              })
          : t({ id: 'plan.day.item.pinnedLine', message: 'Someone pinned it where it is.' });
  return {
    title,
    lines: [
      line,
      ...(alsoMoves === null ? [] : [alsoMoves]),
      ...(canApply
        ? []
        : [
            t({
              id: 'plan.day.item.memberLine',
              message: 'The crew okays it before it changes.',
            }),
          ]),
    ],
    confirm: removing
      ? t({ id: 'plan.day.item.removeConfirm', message: 'Remove' })
      : t({ id: 'plan.day.item.changeConfirm', message: 'Change it anyway' }),
  };
}

export function ItemConfirm({
  item,
  removing,
  canApply,
  mustDoMine,
  solo = false,
  alsoMoves = null,
  onConfirm,
  onCancel,
}: {
  readonly item: DayItem;
  readonly removing: boolean;
  readonly canApply: boolean;
  /** The must-do is the reader's own. */
  readonly mustDoMine: boolean;
  /** A trip of one: nobody else to speak of. */
  readonly solo?: boolean;
  /** What else the removal moves on the day, said before it is confirmed. */
  readonly alsoMoves?: string | null;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}) {
  const words = confirmWords({ item, removing, canApply, mustDoMine, solo, alsoMoves });
  return (
    <ConfirmSheet
      mode="button"
      title={words.title}
      consequences={words.lines}
      confirmLabel={words.confirm}
      onConfirm={onConfirm}
      onCancel={onCancel}
      testID="plan-item-confirm"
    />
  );
}
