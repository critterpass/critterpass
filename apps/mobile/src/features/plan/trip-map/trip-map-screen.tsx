/* eslint-disable lingui/no-unlocalized-strings -- design ids and route params, never copy. */
/**
 * The trip map route's screen over the synced plan (7a-1…7a-3, 7i-1): reads the plan I see and
 * everything around it, keeps the chosen day (the `day` or `date` the link names, else the day last looked
 * at in any of the plan's views, else today during the trip, else the first day with stops), reads
 * that day's legs, opens a tapped stop's sheet over the map and SHARE over it.
 */
import { router } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { useState } from 'react';

import { hrefFor } from '@/lib/navigation/screen-registry';
import type { MapSheetSnap } from '@/ui/sheet/map-sheet-snap';

import { ItemSheetHost } from '../day/item-sheet-host';
import { useDayEditing } from '../day/use-day-editing';
import { hubDay } from '../hub/plan-hub';
import { tripPlanRoutes } from '../hub/routes';
import { useChosenDay, useOpenOnDate } from './chosen-day';
import { legTravel } from '../day-plan/reschedule';
import { useDayRoute } from './day-route';
import { ShareSheet } from './share-sheet';
import { TripMapView } from './trip-map-view';
import { useTripMapModel } from './use-trip-map-model';

export function TripMapScreen({
  tripId,
  day,
  date,
  sheet,
}: {
  readonly tripId: string;
  readonly day?: number | null | undefined;
  /** The day to open on by its date (`YYYY-MM-DD`), when a link names it that way. */
  readonly date?: string | null | undefined;
  readonly sheet?: MapSheetSnap | undefined;
}) {
  const { data, model } = useTripMapModel(tripId);
  const [chosen, setChosen] = useChosenDay(tripId, day);
  const finding = useOpenOnDate(tripId, date, model.days, data.loaded);
  const [sharing, setSharing] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const editor = useDayEditing(data.plan);
  const known = model.days.some((entry) => entry.dayNo === chosen) ? chosen : null;
  const dayNo =
    known ??
    hubDay(
      model.days.map((entry) => ({
        dayNo: entry.dayNo,
        date: entry.date,
        stops: entry.stops.length,
      })),
      data.today,
    );
  const selected = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(data.plan.versionId, selected);
  if (!data.loaded || finding) return null;
  const open = selected?.items.find((entry) => entry.stableId === openId) ?? null;
  return (
    <>
      <TripMapView
        model={model}
        dayNo={dayNo}
        onDayNo={setChosen}
        route={route}
        initialSnap={sheet}
        onShare={() => setSharing(true)}
        onOpenDay={(n) => {
          setChosen(n);
          router.push(tripPlanRoutes.day(tripId, n));
        }}
        onBack={() => goBackOr(hrefFor('3k-1', { tripId }) ?? '/')}
        onOpenStop={setOpenId}
        onOpenPlace={(placeId) => {
          const place = hrefFor('7e-1', { placeId, tripId });
          if (place !== undefined) router.push(place);
        }}
        onMoveStops={() => router.push(tripPlanRoutes.days(tripId))}
      />
      {open === null || selected === null ? null : (
        <ItemSheetHost
          key={open.stableId}
          plan={data.plan}
          item={open}
          slot={{ dayNo: selected.dayNo, date: selected.date ?? '' }}
          editor={editor}
          travel={legTravel(route.legs)}
          onClose={() => setOpenId(null)}
        />
      )}
      {sharing ? (
        <ShareSheet plan={data.plan} days={model.days} onClose={() => setSharing(false)} />
      ) : null}
    </>
  );
}
