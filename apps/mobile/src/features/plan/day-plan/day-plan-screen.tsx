/**
 * The day plan route's screen (7b-1) over the synced plan: the day's stops with legs and the
 * check's notes, the reorder (organiser applies, member proposes; an impossible order says why),
 * the item sheet for a tapped stop, the add bar (search scoped to the day once registered, the
 * earlier add sheet until then), SHARE and who else is on the day right now. The day shown is the
 * trip's chosen day, shared with the trip map, the open day map and all days; "← TRIP" lands on
 * the trip map whatever is stacked in between, and today's day links to day-of.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design ids, route params and toast ids, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { estimateLeg } from '@/data/legs/day-legs';
import { addOp, type DaySlot } from '@/data/plan/plan-ops';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';

import { usePlanPresence } from '../collab/use-presence';
import { AddItemSheet } from '../day/add-item-sheet';
import { ItemSheetHost } from '../day/item-sheet-host';
import { announceEdit, useDayEditing } from '../day/use-day-editing';
import { tripPlanRoutes } from '../hub/routes';
import { useChosenDay, useOpenOnDate } from '../trip-map/chosen-day';
import { useDayRoute } from '../trip-map/day-route';
import { ShareSheet } from '../trip-map/share-sheet';
import { useTripMapModel } from '../trip-map/use-trip-map-model';
import { useRainWindow } from '../timeline/use-rain-window';
import { clock } from '../day/format';
import { useLocale } from '@/lib/i18n/use-locale';
import { useBackToTrip } from './back-to-trip';
import { DayGone } from './day-gone';
import { DayPlanView } from './day-plan-view';
import { refusalLine } from './refusal';
import type { Travel } from './reschedule';
import { useReorder } from './use-reorder';

export function DayPlanScreen({
  tripId,
  dayNo: initialDay,
  date,
  item,
}: {
  readonly tripId: string;
  readonly dayNo: number;
  /** The day to open on by its date (`YYYY-MM-DD`), when a link names it that way. */
  readonly date?: string | null | undefined;
  readonly item?: string | undefined;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const { data, model } = useTripMapModel(tripId);
  const { plan } = data;
  const [chosen, setDayNo] = useChosenDay(tripId, date == null ? initialDay : null);
  const finding = useOpenOnDate(tripId, date, model.days, data.loaded);
  const dayNo = chosen ?? initialDay;
  const [openId, setOpenId] = useState<string | null>(item ?? null);
  const backToTrip = useBackToTrip(tripId);
  // Day-of for today (when to leave, who is up), once that screen has joined the registry.
  const dayOf = hrefFor('3k-2', { tripId });
  const [adding, setAdding] = useState(false);
  const [sharing, setSharing] = useState(false);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = useDayRoute(plan.versionId, day);
  const editor = useDayEditing(plan);
  const search = useScreenHref('7d-1', {
    tripId,
    scope: 'day',
    ...(day?.dayId == null ? {} : { dayId: day.dayId }),
  });
  const presence = usePlanPresence(tripId, 'day', dayNo);
  const rainWindow = useRainWindow(plan.trip?.destination_id ?? null, day?.date ?? null, model.tz);
  const slot: DaySlot = { dayNo, date: day?.date ?? '' };
  const travel: Travel = (from, to) => {
    const stored = route.legs.find((leg) => leg.from === from.stableId && leg.to === to.stableId);
    if (stored !== undefined) return stored.minutes;
    if (from.place === null || to.place === null) return 0;
    return estimateLeg({ key: from.stableId, ...from.place }, { key: to.stableId, ...to.place })
      .minutes;
  };
  const reorder = useReorder({
    stops: day?.stops ?? [],
    slot,
    travel,
    submit: (ops) => editor.submit(ops),
    editable: !model.readOnly && day?.date != null,
  });
  if (!data.loaded || finding) return null;
  if (day === null) return <DayGone onBack={backToTrip} />;

  const rainIssue = day.issues.find((issue) => issue.kind === 'rain');
  const rain =
    rainIssue?.kind === 'rain'
      ? t({
          id: 'plan.dayPlan.rain',
          message: `Rain likely ${rainIssue.params.from}–${rainIssue.params.to}`,
        })
      : rainWindow.kind === 'rain'
        ? t({
            id: 'plan.dayPlan.rainForecast',
            message: `Rain likely ${clock(locale, rainWindow.start)}–${clock(locale, rainWindow.end)}`,
          })
        : null;
  const open = day.items.find((entry) => entry.stableId === openId) ?? null;
  const refuse = (line: string) => {
    impact('error');
    toast.show({ id: 'day-plan-refused', title: line });
  };
  return (
    <>
      <DayPlanView
        model={model}
        day={day}
        route={route}
        order={reorder.preview}
        rain={rain}
        here={presence.here.map((member) => ({
          key: member.uid,
          name: member.name ?? '',
          joinIndex: plan.members.find((one) => one.uid === member.uid)?.joinIndex ?? 0,
        }))}
        picked={openId}
        drag={
          model.readOnly
            ? null
            : {
                onLift: (index) => {
                  const lifted = reorder.lift(index);
                  if (!lifted.ok) refuse(refusalLine(lifted.refusal));
                  return lifted.ok;
                },
                onCross: reorder.cross,
                onDrop: async () => {
                  const dropped = await reorder.drop();
                  if (dropped.kind === 'refused') refuse(refusalLine(dropped.refusal));
                  if (dropped.kind === 'sent') announceEdit(dropped.outcome);
                  return dropped.kind === 'sent';
                },
              }
        }
        onBack={backToTrip}
        // Back to day-of when it is underneath (the day was opened from it), else onto it.
        onDayOf={dayOf === undefined ? undefined : () => router.dismissTo(dayOf)}
        onAllDays={() => router.push(tripPlanRoutes.days(tripId, dayNo))}
        onShare={() => setSharing(true)}
        onSelectDay={(n) => {
          // A stop's sheet belongs to the day it was opened on.
          setOpenId(null);
          setDayNo(n);
        }}
        onOpenMap={() => router.push(tripPlanRoutes.dayMap(tripId, dayNo))}
        onOpenStop={setOpenId}
        onAdd={() => (search === undefined ? setAdding(true) : router.push(search))}
      />
      {open === null ? null : (
        <ItemSheetHost
          key={open.stableId}
          plan={plan}
          item={open}
          slot={slot}
          editor={editor}
          announce={announceEdit}
          onClose={() => setOpenId(null)}
        />
      )}
      {adding && day.date !== null ? (
        <AddItemSheet
          destinationId={plan.trip?.destination_id ?? null}
          tripId={plan.trip?.id ?? null}
          date={day.date}
          items={day.items}
          tz={model.tz}
          members={plan.members.map((member) => member.uid)}
          canApply={plan.canApply}
          warningText={() => ''}
          onClose={() => setAdding(false)}
          onAdd={(draft) => {
            setAdding(false);
            void editor
              .submit([addOp(slot, { ...draft, tz: model.tz }, draft.stableId)])
              .then(announceEdit);
          }}
        />
      ) : null}
      {sharing ? (
        <ShareSheet plan={plan} days={model.days} onClose={() => setSharing(false)} />
      ) : null}
    </>
  );
}
