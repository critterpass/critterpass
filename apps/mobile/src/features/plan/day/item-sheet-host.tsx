/**
 * A plan item's sheet wired to the plan editor, as the day view (3e-2) and the day plan (7b-1)
 * open it: change the time, move it to another day, take it off the plan or skip it just for me,
 * its comments, and the place or the maps app. A new time or day is timed against the rest of that
 * day before it is saved: the stops after it are pushed only as far as they need, the sheet says
 * so in one line, and a change that would run into a booked or must-do stop can't be saved. Every
 * change goes through the editor (an organiser's applies, a member's becomes a change set), which
 * says what changed, and the sheet closes.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL and wire values, never copy. */
import type { PlanOp } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import { useLiveRows } from '@/data/plan/live-rows';
import { dayItems, type DayItem } from '@/data/plan/plan-model';
import { moveToDayOp, removeOp, resizeOp, type DaySlot } from '@/data/plan/plan-ops';
import type { EditOutcome, PlanEditorEvents } from '@/data/plan/use-plan-editor';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';

import { ItemComments } from '../collab/item-comments';
import { retime, type Retime, type Travel } from '../day-plan/reschedule';
import { guideOf } from '../timeline/day-timeline';
import { closeGap, outOfPlaceOn } from './close-gap';
import { travelMinutes } from './fit-check';
import { dayName } from './format';
import { ItemDetailSheet } from './item-detail-sheet';
import { gapLine, retimePreview } from './retime-copy';
import { mapsUrl, placeRoute, reviewRoute } from './routes';
import { StopDayActions } from './stop-day-actions';

export interface ItemSheetEditor {
  readonly submit: (
    ops: readonly PlanOp[],
    options?: { readonly confirmLocked?: boolean },
  ) => Promise<EditOutcome>;
  readonly skipForMe: (item: DayItem) => Promise<boolean>;
}

export type { PlanEditorEvents };

function openInMaps(item: DayItem): void {
  if (item.place === null) return;
  void Linking.openURL(mapsUrl(item.title, item.place.lat, item.place.lng));
}

/** The open change set that touches `stableId`, if the crew is still deciding on one. */
function openSuggestion(plan: TripPlan, stableId: string): string | null {
  for (const set of plan.openChangesets) {
    if (set.ops?.includes(`"${stableId}"`) === true) return set.id;
  }
  return null;
}

export function ItemSheetHost({
  plan,
  item,
  slot,
  editor,
  travel,
  onClose,
}: {
  readonly plan: TripPlan;
  readonly item: DayItem;
  readonly slot: DaySlot;
  readonly editor: ItemSheetEditor;
  /** Unused: the editor says how an edit went itself. */
  readonly announce?: (outcome: EditOutcome) => void;
  /** Minutes between two stops (stored legs when the screen has them); straight-line otherwise. */
  readonly travel?: Travel;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const tripId = plan.trip?.id ?? '';
  const tz = plan.trip?.tz ?? item.tz;
  const mustDoId = plan.itemRows.find((row) => row.stable_id === item.stableId)?.must_do_id ?? null;
  const owner = useLiveRows<{ owner_id: string | null }>(
    'SELECT owner_id FROM must_dos WHERE id = ?',
    mustDoId === null ? null : [mustDoId],
    ['must_dos'],
  );
  const price = useLiveRows<{ price_level: number | null }>(
    'SELECT price_level FROM pois WHERE id = ?',
    item.poiId === null ? null : [item.poiId],
    ['pois'],
  );
  const dayLabels = new Map(
    plan.state.days.flatMap((day) =>
      day.date === null ? [] : [[day.day_no, dayName(locale, day.date)] as const],
    ),
  );
  const slotOf = (dayNo: number): DaySlot | null => {
    const date = plan.state.days.find((day) => day.day_no === dayNo)?.date ?? null;
    return date === null ? null : { dayNo, date };
  };
  /** The day `dayNo` with this stop at its new time: what else has to move, or why it can't. */
  const timed = (change: { start: number; end: number; dayNo: number }): Retime | null => {
    const to = slotOf(change.dayNo);
    if (to === null) return null;
    const there = dayItems(plan.state, change.dayNo, plan.display, tz);
    const stops =
      change.dayNo === item.dayNo
        ? there
        : [...there, { ...item, dayNo: change.dayNo, start: null, end: null }];
    const straight = travelMinutes(stops);
    const between: Travel = travel ?? ((from, next) => straight(from.stableId, next.stableId) ?? 0);
    return retime(stops, { stableId: item.stableId, ...change }, to, between);
  };
  const pushes = (change: { start: number; end: number; dayNo: number }): readonly PlanOp[] => {
    const result = timed(change);
    return result?.ok === true ? result.ops : [];
  };
  // Taking the stop off its day: later stops that sit later than they belong move back earlier.
  const here = dayItems(plan.state, item.dayNo, plan.display, tz);
  const straightHere = travelMinutes(here);
  const gap = closeGap(
    here,
    item.stableId,
    slot,
    travel ?? ((from, next) => straightHere(from.stableId, next.stableId) ?? 0),
    outOfPlaceOn(slot.date, tz),
  );
  const suggestionId = plan.proposed.has(item.stableId)
    ? openSuggestion(plan, item.stableId)
    : null;
  const suggester = plan.members.find((member) => member.uid === plan.proposed.get(item.stableId));
  // Her own draft, before the crew has a plan: nobody else is on it yet, so there is nothing to
  // skip "just me", no day-of actions and no thread to comment in.
  const onDraft = plan.mode === 'draft';
  const skipForMe = () => {
    void editor.skipForMe(item).then(() =>
      toast.show({
        id: 'plan-skipped',
        title: t({ id: 'plan.day.skippedToast', message: 'Skipped, just for you' }),
      }),
    );
    onClose();
  };

  return (
    <ItemDetailSheet
      item={item}
      dayNos={plan.state.days.map((candidate) => candidate.day_no)}
      dayLabels={dayLabels}
      members={plan.members}
      canApply={plan.canApply}
      priceLevel={price.rows[0]?.price_level ?? null}
      removeLine={gapLine(gap)}
      mustDoMine={owner.rows[0]?.owner_id != null && owner.rows[0].owner_id === plan.uid}
      suggestion={
        suggestionId === null
          ? null
          : {
              line:
                suggester === undefined || suggester.uid === plan.uid
                  ? t({ id: 'plan.day.item.suggestedByYou', message: 'You suggested a change' })
                  : t({
                      id: 'plan.day.item.suggestedBy',
                      message: `${suggester.name} suggested a change`,
                    }),
              onSee: () => {
                onClose();
                router.push(reviewRoute(tripId, suggestionId));
              },
            }
      }
      lead={
        onDraft ? null : (
          <StopDayActions
            tripId={tripId}
            item={item}
            date={slot.date}
            tz={tz}
            onClose={onClose}
            onSkipForMe={skipForMe}
            solo={plan.members.length <= 1}
          />
        )
      }
      preview={(change) => {
        const result = timed(change);
        if (result === null) return { line: null, blocked: false };
        const toDay = change.dayNo === item.dayNo ? null : (dayLabels.get(change.dayNo) ?? null);
        const there = retimePreview(result, locale, toDay);
        const back =
          toDay === null || there.blocked ? null : gapLine(gap, dayLabels.get(item.dayNo));
        return back === null ? there : { ...there, line: `${there.line ?? ''} ${back}`.trim() };
      }}
      comments={
        onDraft ? null : (
          <ItemComments
            tripId={tripId}
            uid={plan.uid}
            item={item}
            members={plan.members}
            guide={guideOf(plan.trip?.guide_slug ?? null)}
          />
        )
      }
      actions={{
        onClose,
        onSave: (start, end, confirmLocked) => {
          const others = pushes({ start, end, dayNo: item.dayNo });
          void editor.submit([resizeOp(item, slot, start, end), ...others], { confirmLocked });
          onClose();
        },
        onMoveToDay: (target, confirmLocked, times) => {
          const to = slotOf(target);
          if (to === null) return;
          const start = times?.start ?? item.start;
          const end = times?.end ?? item.end;
          const others =
            start === null || end === null ? [] : pushes({ start, end, dayNo: target });
          void editor.submit([moveToDayOp({ ...item, start, end }, to), ...others, ...gap.ops], {
            confirmLocked,
          });
          onClose();
        },
        onRemove: (confirmLocked) => {
          void editor.submit([removeOp(item), ...gap.ops], { confirmLocked });
          onClose();
        },
        onSkipForMe: onDraft ? null : skipForMe,
        onOpenPlace: (poiId) => {
          const href = placeRoute(poiId, tripId);
          if (href !== undefined) router.push(href);
        },
        onOpenMaps: () => openInMaps(item),
      }}
    />
  );
}
