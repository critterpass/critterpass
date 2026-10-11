/**
 * The premium plan map's model over the synced plan: the trip's days, the chosen day (the link's,
 * else the one last looked at, else today during the trip, else the first with stops), its legs,
 * the timeline rows with the order a held stop would leave, the day chips, the whole-trip rows,
 * and the hold-to-reorder wiring (an organiser's order applies, a member's is suggested; a booked
 * or pinned stop refuses and says why).
 */
import { useMemo } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';

import { useDayEditing } from '../../day/use-day-editing';
import { legTravel, reschedule } from '../../day-plan/reschedule';
import { dropResult, useReorder } from '../../day-plan/use-reorder';
import { hubDay } from '../../hub/plan-hub';
import { useChosenDay } from '../../trip-map/chosen-day';
import { useDayRoute } from '../../trip-map/day-route';
import { dateLine, dayOfTrip, stopsLine, tagLabel } from '../../trip-map/format';
import { dayChips } from '../../trip-map/sheet-copy';
import { buildStopRows, columnClock } from '../../trip-map/stop-rows';
import { useTripMapModel } from '../../trip-map/use-trip-map-model';
import type { TimelineRow } from './timeline';
import type { TripRow } from './trip-rows';

export function usePlanMap(tripId: string, openedDay: number | null) {
  const locale = useLocale();
  const { data, model } = useTripMapModel(tripId);
  const [chosen, setChosen] = useChosenDay(tripId, openedDay);
  const known = model.days.some((day) => day.dayNo === chosen) ? chosen : null;
  const dayNo =
    known ??
    hubDay(
      model.days.map((day) => ({ dayNo: day.dayNo, date: day.date, stops: day.stops.length })),
      data.today,
    );
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(data.plan.versionId, day);
  const editor = useDayEditing(data.plan);
  const travel = useMemo(() => legTravel(route.legs), [route.legs]);
  const slot = { dayNo: dayNo ?? 1, date: day?.date ?? '' };
  const reorder = useReorder({
    stops: day?.stops ?? [],
    slot,
    travel,
    submit: (ops) => editor.submit(ops),
    editable: !model.readOnly && day?.date != null,
  });

  const rows = useMemo((): TimelineRow[] => {
    if (day === null) return [];
    const built = buildStopRows({
      locale,
      day,
      after: route.after,
      gaps: [],
      members: model.members,
      me: model.me,
    });
    const byId = new Map(built.map((row) => [row.stop.stableId, row]));
    const order = reorder.preview ?? day.stops.map((stop) => stop.stableId);
    return order.flatMap((id, index) => {
      const row = byId.get(id);
      if (row === undefined) return [];
      return [
        {
          id,
          n: index + 1,
          time: row.time,
          title: row.stop.title,
          meta: row.detail ?? null,
          booked: row.stop.bookingId !== null,
          legAfter: row.legAfter,
        },
      ];
    });
  }, [day, locale, model.members, model.me, reorder.preview, route.after]);

  /** Where the held stop would start in its new place ("13:00"). */
  const liftedTime = useMemo(() => {
    if (day === null || reorder.preview === null || reorder.lifted === null) return null;
    const id = day.stops[reorder.lifted]?.stableId;
    const timed = reschedule(day.stops, reorder.preview, slot, travel);
    const start = id === undefined || !timed.ok ? undefined : timed.starts.get(id);
    return id === undefined
      ? null
      : { id, time: start === undefined ? null : columnClock(locale, start) };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- slot follows the day
  }, [day, reorder.preview, reorder.lifted, travel, locale]);

  const tripRows = useMemo(
    (): TripRow[] =>
      model.days.map((entry) => {
        const date = entry.date === null ? '' : dateLine(locale, entry.date);
        const title = entry.theme ?? entry.area?.name ?? dayOfTrip(entry.dayNo, model.days.length);
        return {
          dayNo: entry.dayNo,
          date,
          title,
          tag: entry.tag === null ? null : { tag: entry.tag, label: tagLabel(entry.tag, true) },
          pace: entry.pace,
          accessibilityLabel: `${date} ${title}`,
        };
      }),
    [model.days, locale],
  );

  return {
    data,
    model,
    day,
    dayNo,
    setDay: setChosen,
    route,
    editor,
    reorder,
    dropResult,
    rows,
    liftedTime,
    chips: dayChips(model.days, locale, data.today),
    tripRows,
    dayLine: day === null ? null : stopsLine(day.stops.length, route.legs),
    eyebrow:
      day === null
        ? ''
        : `${day.date === null ? '' : `${dateLine(locale, day.date)} · `}${dayOfTrip(day.dayNo, model.days.length)}`,
    locale,
  };
}
