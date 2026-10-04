/**
 * The overview's MAP and CALENDAR tabs over the plan I see (my own plan when I have one): the map
 * draws from the downloaded region when there is one, and the calendar carries the export actions.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { useVersionLegPaths } from '@/data/legs/version-leg-paths';
import { useRegionPack } from '@/data/places/useRegionPack';
import { useSyncStatus } from '@/data/status/use-sync-status';
import { PillButton } from '@/ui/buttons/PillButton';

import type { PlanData } from '../overview/data/use-plan-data';
import { todayIn } from '../overview/data/use-plan-data';
import type { PlanItem } from '../overview/model/plan-model';
import { planRoutes } from '../overview/routes';
import { myEvents, useCalendarWriter } from './data/calendar-export';
import { ExportSheet } from './export-sheet';
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
  const legPaths = useVersionLegPaths(data.versionId);
  return (
    <PlanMap
      days={data.days}
      legPaths={legPaths}
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
}: {
  readonly data: PlanData;
  readonly items: readonly PlanItem[];
  readonly onOpenDay: (dayNo: number) => void;
}) {
  const inTrip = data.trip?.phase === 'in';
  const tz = data.trip?.tz ?? null;
  const months = useMemo(
    () => calendarMonths(data.days, items, inTrip ? todayIn(tz) : null),
    [data.days, items, inTrip, tz],
  );
  const [exporting, setExporting] = useState(false);
  const writer = useCalendarWriter();
  const events = useMemo(() => myEvents(items, data.uid ?? '', tz), [items, data.uid, tz]);
  return (
    <>
      <PlanCalendar
        months={months}
        onOpenDay={onOpenDay}
        actions={
          months.length > 0 ? (
            <PillButton
              label={t({ id: 'plan.calendar.export', message: 'Put it in my calendar' })}
              variant="secondary"
              block
              onPress={() => setExporting(true)}
              testID="plan-calendar-export"
            />
          ) : null
        }
      />
      {exporting ? (
        <ExportSheet
          tripId={data.trip?.id ?? ''}
          events={events}
          writer={writer}
          onClose={() => setExporting(false)}
        />
      ) : null}
    </>
  );
}
