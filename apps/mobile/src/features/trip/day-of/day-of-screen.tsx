/**
 * The day-of screen (3k-2): its data and actions are `useDayOf`; this draws them, with "running
 * late" under the hero and the alarm permission sheet over it.
 */
import { LateEntry } from '@/features/plan';

import { AlarmPermissionSheet } from '../alarm/alarm-permission-sheet';
import { DayOfView } from './day-of-view';
import { useDayOf } from './use-day-of';

export function DayOfScreen({ tripId, date }: { readonly tripId: string; readonly date: string }) {
  const day = useDayOf(tripId, date);
  const { late, ...props } = day.props;
  return (
    <DayOfView
      {...props}
      late={late === null ? null : <LateEntry onPick={late} testID="trip-day-late" />}
      overlay={
        day.sheet === null ? null : (
          <AlarmPermissionSheet
            kind={day.sheet}
            guideName={day.guideName}
            onPrimary={() => void day.onSheetPrimary()}
            onClose={() => day.setSheet(null)}
          />
        )
      }
    />
  );
}
