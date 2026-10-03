/**
 * The day view over the local plan: rows (or the timeline in planning mode), the item sheet and
 * the add sheet. Every change goes through the plan editor, so an organiser's edit applies and a
 * member's becomes a change set for the crew; both show on the day at once from the queue.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import { AddItemSheet } from './add-item-sheet';
import type { DayRowState } from './day-list';
import { DayView } from './day-view';
import { dayFit, type FitWarning } from './fit-check';
import { clockRange } from './format';
import { ItemDetailSheet } from './item-detail-sheet';
import { dayItems, type DayItem } from './plan-model';
import { addOp, moveToDayOp, removeOp, resizeOp, type DaySlot } from './plan-ops';
import { mapsUrl, placeRoute } from './routes';
import { DayTimeline, guideOf, useDayOverlays } from '../timeline/day-timeline';
import { ItemComments } from '../collab/item-comments';
import { itemAnchor, usePlanPresence } from '../collab/use-presence';
import { useDayEditing } from './use-day-editing';
import type { EditOutcome } from './use-plan-editor';
import { useTripPlan } from './use-trip-plan';
import { useFormats } from '@/lib/i18n/formats';

function openInMaps(item: DayItem): void {
  if (item.place === null) return;
  void Linking.openURL(mapsUrl(item.title, item.place.lat, item.place.lng));
}

export function DayScreen({
  tripId,
  dayNo,
  item,
}: {
  readonly tripId: string;
  readonly dayNo: number;
  /** An item to open on arrival (a map pin links here with it). */
  readonly item?: string | undefined;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  useFormats();
  const plan = useTripPlan(tripId);
  const editor = useDayEditing(plan);
  const sync = useSyncStatus();
  const [planning, setPlanning] = useState(false);
  const [openId, setOpenId] = useState<string | null>(item ?? null);
  const [adding, setAdding] = useState(false);
  const day = plan.state.days.find((candidate) => candidate.day_no === dayNo) ?? null;
  const tz = plan.trip?.tz ?? 'UTC';
  const items = dayItems(plan.state, dayNo, plan.display, tz);
  const slot: DaySlot = { dayNo, date: day?.date ?? '' };
  const editable =
    plan.trip !== null && plan.trip.status !== 'cancelled' && plan.trip.status !== 'ended';
  const members = plan.members.map((member) => member.uid);

  const titleOf = (id: string | undefined, all: readonly DayItem[]) =>
    all.find((item) => item.stableId === id)?.title ?? '';
  const warningText = (warning: FitWarning, all: readonly DayItem[]) =>
    warning.code === 'OVERLAP'
      ? t({ id: 'plan.day.fit.overlap', message: `Overlaps ${titleOf(warning.relatedId, all)}` })
      : t({
          id: 'plan.day.fit.travel',
          message: `${warning.minutes ?? 0} min short to get here from ${titleOf(warning.relatedId, all)}`,
        });
  const warnings = day?.date == null ? [] : dayFit(items, day.date, members);
  const states = new Map<string, DayRowState>(
    items.map((item) => {
      const warning = warnings.find((w) => w.stableId === item.stableId);
      return [
        item.stableId,
        {
          queued: plan.queued.has(item.stableId),
          proposed: plan.proposed.has(item.stableId),
          warning: warning === undefined ? null : warningText(warning, items),
        },
      ];
    }),
  );
  const meta = (item: DayItem) => {
    const going = plan.members.filter((member) => item.attendeeIds.includes(member.uid));
    return [
      item.start === null || item.end === null ? null : clockRange(locale, item.start, item.end),
      going.length === 0 ? null : going.map((member) => member.name).join(', '),
    ]
      .filter(Boolean)
      .join(' · ');
  };
  const announce = (outcome: EditOutcome) => {
    if (outcome.kind === 'proposed') {
      impact('success');
      toast.show({
        id: 'plan-proposed',
        title: t({ id: 'plan.day.proposedToast', message: 'Sent to the crew' }),
        subtitle: t({ id: 'plan.day.proposedLine', message: 'It changes once they say yes.' }),
      });
    } else if (outcome.kind === 'applied') {
      impact('success');
    }
  };
  const open = items.find((item) => item.stableId === openId) ?? null;
  // The open item went (someone else removed it, or a link named one that's gone): say so.
  const gone = openId !== null && plan.loaded && open === null;
  useEffect(() => {
    if (!gone) return;
    impact('warning');
    toast.show({
      id: 'plan-item-gone',
      title: t({ id: 'plan.day.item.goneTitle', message: 'This one’s off the plan' }),
      subtitle: t({
        id: 'plan.day.item.goneLine',
        message: 'Someone removed it while you had it open.',
      }),
    });
  }, [gone, t]);
  const overlays = useDayOverlays(plan, slot, items);
  const presence = usePlanPresence(tripId, 'day', dayNo);
  const { setCursor } = presence;
  useEffect(() => {
    setCursor(openId === null ? null : itemAnchor(openId));
    // The cursor follows the open item; `setCursor` is stable in effect (latest wins).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId]);

  return (
    <>
      <DayView
        dayNo={dayNo}
        dayCount={plan.state.days.length}
        date={day?.date ?? null}
        theme={day?.theme == null ? null : (plan.themes.get(day.theme) ?? day.theme)}
        here={presence.here.map((member) => ({
          key: member.uid,
          name: member.name ?? '',
          joinIndex: plan.members.find((m) => m.uid === member.uid)?.joinIndex ?? 0,
        }))}
        rain={overlays.rain.kind === 'rain' ? overlays.rain : null}
        forecastMissing={overlays.rain.kind === 'unavailable'}
        planning={planning}
        onTogglePlanning={() => {
          impact('snap');
          setPlanning((on) => !on);
        }}
        items={items}
        states={states}
        meta={meta}
        loading={!plan.loaded}
        offline={sync.phase === 'offline'}
        editable={editable}
        onOpen={(item) => setOpenId(item.stableId)}
        onAdd={() => setAdding(true)}
        timeline={
          <DayTimeline
            plan={plan}
            day={slot}
            items={items}
            meta={meta}
            editable={editable}
            rain={overlays.rain}
            ghost={overlays.ghost}
            presence={presence}
            onOpen={(item) => setOpenId(item.stableId)}
            onCommit={(ops) => void editor.submit(ops).then(announce)}
          />
        }
        footer={planning ? overlays.banner : undefined}
      />
      {open === null ? null : (
        <ItemDetailSheet
          key={openId}
          item={open}
          dayNos={plan.state.days.map((candidate) => candidate.day_no)}
          members={plan.members}
          canApply={plan.canApply}
          {...(open === null
            ? {}
            : {
                comments: (
                  <ItemComments
                    tripId={tripId}
                    uid={plan.uid}
                    item={open}
                    members={plan.members}
                    guide={guideOf(plan.trip?.guide_slug ?? null)}
                  />
                ),
              })}
          actions={{
            onClose: () => setOpenId(null),
            onSave: (start, end, confirmLocked) => {
              if (open === null) return;
              void editor
                .submit([resizeOp(open, slot, start, end)], { confirmLocked })
                .then(announce);
              setOpenId(null);
            },
            onMoveToDay: (target, confirmLocked) => {
              const to = plan.state.days.find((candidate) => candidate.day_no === target);
              if (open === null || to?.date == null) return;
              void editor
                .submit([moveToDayOp(open, { dayNo: target, date: to.date })], { confirmLocked })
                .then(announce);
              setOpenId(null);
            },
            onRemove: (confirmLocked) => {
              if (open === null) return;
              void editor.submit([removeOp(open)], { confirmLocked }).then(announce);
              setOpenId(null);
            },
            onSkipForMe: () => {
              if (open === null) return;
              void editor.skipForMe(open).then(() =>
                toast.show({
                  id: 'plan-skipped',
                  title: t({ id: 'plan.day.skippedToast', message: 'Skipped, just for you' }),
                }),
              );
              setOpenId(null);
            },
            onOpenPlace: (poiId) => router.push(placeRoute(poiId)),
            onOpenMaps: () => open !== null && openInMaps(open),
          }}
        />
      )}
      {adding && day?.date != null ? (
        <AddItemSheet
          destinationId={plan.trip?.destination_id ?? null}
          date={day.date}
          items={items}
          tz={tz}
          members={members}
          canApply={plan.canApply}
          warningText={warningText}
          onClose={() => setAdding(false)}
          onAdd={(draft) => {
            setAdding(false);
            void editor.submit([addOp(slot, { ...draft, tz }, draft.stableId)]).then(announce);
          }}
        />
      ) : null}
    </>
  );
}
