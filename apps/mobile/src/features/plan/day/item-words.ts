import { t } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { displayWithHome, useMoneyDisplay } from '@/data/money';
import type { DayItem } from '@/data/plan/plan-model';
import type { PlanMember } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { money } from './format';

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

/**
 * What the cost line can say: a price when it is the stop's own (a booking's, or one a person put
 * on it); "Free" only for a place known to be free (its price level says so); "No estimate yet"
 * for anything else, never "Free" and never the guide's even share of the day's budget, which is
 * the same for every stop and says nothing about this one; nothing for a bare note.
 */
export function costKind(
  amountMinor: number | null,
  priceLevel: number | null,
  hasPlace: boolean,
  own = true,
): 'priced' | 'free' | 'unknown' | 'none' {
  if (own && amountMinor !== null && amountMinor > 0) return 'priced';
  if (priceLevel === 0) return 'free';
  return hasPlace || amountMinor !== null ? 'unknown' : 'none';
}

/** What the facts say, for every look: who is going, the cost line, and whether the trip is one. */
export function useFactWords({
  item,
  members,
  priceLevel = null,
}: {
  readonly item: DayItem;
  readonly members: readonly PlanMember[];
  /** The place's price level (0 = known to be free); null = not known. */
  readonly priceLevel?: number | null;
}) {
  const locale = useLocale();
  const { t } = useLingui();
  useMoneyDisplay();
  const shown = (minor: number, currency: string) =>
    displayWithHome(money(locale, minor, currency), minor, currency, locale);
  // A trip of one: no "each", no "everyone".
  const solo = members.length <= 1;
  const going = members.filter((member) => item.attendeeIds.includes(member.uid));
  const kind = costKind(
    item.amountMinor,
    priceLevel,
    item.poiId !== null,
    item.bookingId !== null || !item.byGuide,
  );
  const cost =
    kind === 'none'
      ? null
      : kind === 'free'
        ? t({ id: 'plan.day.item.costFree', message: 'Free' })
        : kind === 'unknown' || item.amountMinor === null || item.currency === null
          ? t({ id: 'plan.day.item.costUnknown', message: 'No estimate yet' })
          : solo
            ? shown(item.amountMinor, item.currency)
            : item.costModel === 'per_person'
              ? t({
                  id: 'plan.day.item.costEach',
                  message: `${shown(item.amountMinor, item.currency)} each`,
                })
              : t({
                  id: 'plan.day.item.costGroup',
                  message: `${shown(item.amountMinor, item.currency)} for the group`,
                });
  return { solo, going, cost };
}
