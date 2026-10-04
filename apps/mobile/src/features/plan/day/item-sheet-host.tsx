/**
 * A plan item's sheet wired to the plan editor, as the day view (3e-2) and the day plan (7b-1)
 * open it: change the time, move it to another day, take it off the plan or skip it just for me,
 * its comments, and the place or the maps app. Every change goes through the editor (an
 * organiser's applies, a member's becomes a change set), and the sheet closes.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { Linking } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import { moveToDayOp, removeOp, resizeOp, type DaySlot } from '@/data/plan/plan-ops';
import type { EditOutcome, PlanEditorEvents } from '@/data/plan/use-plan-editor';
import type { TripPlan } from '@/data/plan/use-trip-plan';
import { toast } from '@/motion/island-toast';
import type { PlanOp } from '@cp/domain';

import { ItemComments } from '../collab/item-comments';
import { guideOf } from '../timeline/day-timeline';
import { ItemDetailSheet } from './item-detail-sheet';
import { mapsUrl, placeRoute } from './routes';

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

export function ItemSheetHost({
  plan,
  item,
  slot,
  editor,
  announce,
  onClose,
}: {
  readonly plan: TripPlan;
  readonly item: DayItem;
  readonly slot: DaySlot;
  readonly editor: ItemSheetEditor;
  readonly announce: (outcome: EditOutcome) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  return (
    <ItemDetailSheet
      item={item}
      dayNos={plan.state.days.map((candidate) => candidate.day_no)}
      members={plan.members}
      canApply={plan.canApply}
      comments={
        <ItemComments
          tripId={plan.trip?.id ?? ''}
          uid={plan.uid}
          item={item}
          members={plan.members}
          guide={guideOf(plan.trip?.guide_slug ?? null)}
        />
      }
      actions={{
        onClose,
        onSave: (start, end, confirmLocked) => {
          void editor.submit([resizeOp(item, slot, start, end)], { confirmLocked }).then(announce);
          onClose();
        },
        onMoveToDay: (target, confirmLocked) => {
          const to = plan.state.days.find((candidate) => candidate.day_no === target);
          if (to?.date == null) return;
          void editor
            .submit([moveToDayOp(item, { dayNo: target, date: to.date })], { confirmLocked })
            .then(announce);
          onClose();
        },
        onRemove: (confirmLocked) => {
          void editor.submit([removeOp(item)], { confirmLocked }).then(announce);
          onClose();
        },
        onSkipForMe: () => {
          void editor.skipForMe(item).then(() =>
            toast.show({
              id: 'plan-skipped',
              title: t({ id: 'plan.day.skippedToast', message: 'Skipped, just for you' }),
            }),
          );
          onClose();
        },
        onOpenPlace: (poiId) => router.push(placeRoute(poiId)),
        onOpenMaps: () => openInMaps(item),
      }}
    />
  );
}
