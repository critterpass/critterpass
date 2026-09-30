/**
 * The overview's MAP and CALENDAR tabs over the plan I see (my own plan when I have one): the map
 * draws from the downloaded region when there is one, and the calendar carries the export actions.
 */
import { router } from 'expo-router';
import { useMemo, type ReactNode } from 'react';

import { useRegionPack } from '@/data/places/useRegionPack';
import { useSyncStatus } from '@/data/status/use-sync-status';

import type { PlanData } from '../overview/data/use-plan-data';
import { todayIn } from '../overview/data/use-plan-data';
import type { PlanItem } from '../overview/model/plan-model';
import { planRoutes } from '../overview/routes';
import { calendarMonths } from './model/views-model';
import { PlanCalendar } from './plan-calendar';
import { PlanMap } from './plan-map';

export function PlanMapTab({
  data,
  items,
}: {
  readonly data: PlanData;
  readonly items: readonly PlanItem[];
}) {
  const sync = useSyncStatus();
  const pack = useRegionPack(data.trip?.destination_id ?? '', data.trip?.destination_slug ?? '');
  const tripId = data.trip?.id ?? '';
  const downloaded = pack.status === 'downloaded' ? pack.localPmtilesUri : null;
  return (
    <PlanMap
      days={data.days}
      items={items}
      destinationSlug={data.trip?.destination_slug ?? null}
      localRegionUri={downloaded}
      offlineUnavailable={sync.phase === 'offline' && downloaded === null}
      onDownload={
        pack.status === 'idle' && data.trip?.destination_id ? () => void pack.download() : null
      }
      onOpenItem={(pin) => router.push(planRoutes.item(tripId, pin.dayNo, pin.stableId))}
    />
  );
}

export function PlanCalendarTab({
  data,
  items,
  onOpenDay,
  actions,
}: {
  readonly data: PlanData;
  readonly items: readonly PlanItem[];
  readonly onOpenDay: (dayNo: number) => void;
  readonly actions?: ReactNode;
}) {
  const inTrip = data.trip?.phase === 'in';
  const tz = data.trip?.tz ?? null;
  const months = useMemo(
    () => calendarMonths(data.days, items, inTrip ? todayIn(tz) : null),
    [data.days, items, inTrip, tz],
  );
  return <PlanCalendar months={months} onOpenDay={onOpenDay} actions={actions} />;
}
