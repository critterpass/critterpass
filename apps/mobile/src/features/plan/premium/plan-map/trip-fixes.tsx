/**
 * The whole-trip rows with the plan check's problems opened in place (4.43): each open fix is put
 * under its day, so a day's problem tag opens its panel right there. Mounted only while the sheet
 * is at full, so the check's cards are read only when the rows show.
 */
import { router } from 'expo-router';

import { useCheckCards } from '../../check/use-check-cards';
import type { DayFix } from './fix-panel';
import { TripRows, type TripRowsProps } from './trip-rows';

export function TripFixRows(props: TripRowsProps & { readonly tripId: string }) {
  const { tripId, ...rows } = props;
  const { plan, fixes, cards, keep } = useCheckCards(tripId);
  const byDay = new Map<number, DayFix[]>();
  fixes.forEach((issue, index) => {
    const card = cards[index];
    const dayNo = plan.dayRows.find((row) => row.id === issue.day_id)?.day_no;
    if (card === undefined || dayNo === undefined) return;
    byDay.set(dayNo, [...(byDay.get(dayNo) ?? []), { card, onKeep: () => keep(issue) }]);
  });
  return (
    <TripRows
      {...rows}
      fixes={byDay}
      onOtherWays={() => router.push({ pathname: '/[tripId]/check', params: { tripId } })}
    />
  );
}
