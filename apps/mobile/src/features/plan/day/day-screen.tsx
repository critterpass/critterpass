/**
 * The day view over the local plan: rows (or the timeline in planning mode), the item sheet and
 * the add sheet. Every change goes through the plan editor, so an organiser's edit applies and a
 * member's becomes a change set for the crew; both show on the day at once from the queue.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect, useState } from 'react';

import { useSyncStatus } from '@/data/status/use-sync-status';
import { useLocale } from '@/lib/i18n/use-locale';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';

import { AddItemSheet } from './add-item-sheet';
import type { DayRowState } from './day-list';
import { DayView } from './day-view';
import { dayFit } from './fit-check';
import { clockRange } from './format';
import { ItemSheetHost } from './item-sheet-host';
import { DayTimeline, useDayOverlays } from '../timeline/day-timeline';
import { itemAnchor, usePlanPresence } from '../collab/use-presence';
import { announceEdit, fitWarningText, useDayEditing } from './use-day-editing';
import { useFormats } from '@/lib/i18n/formats';
import { type DayItem, dayItems } from '@/data/plan/plan-model';
import { addOp, type DaySlot } from '@/data/plan/plan-ops';
import { useTripPlan } from '@/data/plan/use-trip-plan';

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

  const warningText = fitWarningText;
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
  const announce = announceEdit;
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
        <ItemSheetHost
          key={openId}
          plan={plan}
          item={open}
          slot={slot}
          editor={editor}
          announce={announce}
          onClose={() => setOpenId(null)}
        />
      )}
      {adding && day?.date != null ? (
        <AddItemSheet
          destinationId={plan.trip?.destination_id ?? null}
          tripId={plan.trip?.id ?? null}
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
