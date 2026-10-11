/**
 * The plan check's problems opened in place on the plan sheet (4.43): each open fix is put under
 * its day, so on the whole trip a day's problem tag opens its panel under the row, and on one day
 * at half the head's "Rain · fix" chip opens it under the head. Mounted only where the rows or the
 * half sheet show, so the check's cards are read only then.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { useCheckCards } from '../../check/use-check-cards';
import { DayHead, type DayHeadProps } from './day-head';
import { FixPanel, type DayFix } from './fix-panel';
import { TripRows, type TripRowsProps } from './trip-rows';

/** The check's open fixes by day number. */
export function useDayFixes(tripId: string): ReadonlyMap<number, readonly DayFix[]> {
  const { plan, fixes, cards, keep } = useCheckCards(tripId);
  const byDay = new Map<number, DayFix[]>();
  fixes.forEach((issue, index) => {
    const card = cards[index];
    const dayNo = plan.dayRows.find((row) => row.id === issue.day_id)?.day_no;
    if (card === undefined || dayNo === undefined) return;
    byDay.set(dayNo, [...(byDay.get(dayNo) ?? []), { card, onKeep: () => keep(issue) }]);
  });
  return byDay;
}

const checkHref = (tripId: string) =>
  ({ pathname: '/[tripId]/check', params: { tripId } }) as const;

export function TripFixRows(props: TripRowsProps & { readonly tripId: string }) {
  const { tripId, ...rows } = props;
  const fixes = useDayFixes(tripId);
  return <TripRows {...rows} fixes={fixes} onOtherWays={() => router.push(checkHref(tripId))} />;
}

function HalfDayHead(props: DayHeadProps & { readonly tripId: string }) {
  const { tripId, ...head } = props;
  const { t } = useLingui();
  const fixes = useDayFixes(tripId).get(head.dayNo) ?? [];
  const [open, setOpen] = useState(false);
  const first = fixes[0];
  const kind = first?.card.tags[0]?.label ?? '';
  return (
    <View style={{ gap: 10 }}>
      <DayHead
        {...head}
        problem={
          first === undefined
            ? null
            : {
                label: t({ id: 'plan.premium.fix.chip', message: `${kind} · fix` }),
                onPress: () => setOpen((value) => !value),
              }
        }
      />
      {open && first !== undefined ? (
        <FixPanel fix={first} onOtherWays={() => router.push(checkHref(tripId))} inset={false} />
      ) : null}
    </View>
  );
}

/** The chosen day's head: at half it carries the day's first problem and opens its fix in place. */
export function PlanDayHead(props: DayHeadProps & { readonly tripId: string }) {
  return props.size === 'half' ? <HalfDayHead {...props} /> : <DayHead {...props} />;
}
