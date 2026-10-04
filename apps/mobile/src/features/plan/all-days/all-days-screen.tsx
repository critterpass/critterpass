/**
 * All days route's screen (7b-3) over the synced plan: the grid, a stop held on one card and
 * dropped on another (or picked through "Move a stop"), the preview of both days rerouted, and the
 * move itself through the plan editor (an organiser's applies, a member's becomes a change set).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { estimateLeg } from '@/data/legs/day-legs';
import type { DayItem } from '@/data/plan/plan-model';
import { impact } from '@/motion/feedback';
import { toast } from '@/motion/island-toast';
import { makeStyles } from '@/ui/theme';

import { refusalLine } from '../day-plan/refusal';
import type { Travel } from '../day-plan/reschedule';
import { announceEdit, useDayEditing } from '../day/use-day-editing';
import { tripPlanRoutes } from '../hub/routes';
import { ShareSheet } from '../trip-map/share-sheet';
import { useTripMapModel } from '../trip-map/use-trip-map-model';
import { AllDaysView } from './all-days-view';
import { MovePreview, MoveStopSheet } from './move-preview';
import { planMove, useCrossDayDrag, type MovePlan } from './use-cross-day-drag';

const GHOST = 22;

const useStyles = makeStyles((t) => ({
  ghost: {
    position: 'absolute',
    width: GHOST,
    height: GHOST,
    borderRadius: GHOST / 2,
    borderWidth: 2,
    borderColor: t.color.paper.bright,
  },
}));

/** Straight-line minutes between two stops (the preview is "about" until the legs land). */
const travel: Travel = (from, to) =>
  from.place === null || to.place === null
    ? 0
    : estimateLeg({ key: from.stableId, ...from.place }, { key: to.stableId, ...to.place }).minutes;

export function AllDaysScreen({
  tripId,
  from,
}: {
  readonly tripId: string;
  readonly from: number | null;
}) {
  const { data, model } = useTripMapModel(tripId);
  const editor = useDayEditing(data.plan);
  const drag = useCrossDayDrag();
  const [measureKey, setMeasureKey] = useState(0);
  const [menuDay, setMenuDay] = useState<number | null>(null);
  const [sharing, setSharing] = useState(false);
  const [preview, setPreview] = useState<{ stop: DayItem; plan: MovePlan } | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const styles = useStyles();
  if (!data.loaded) return null;
  const menuStopDay = model.days.find((day) => day.dayNo === menuDay);
  const heldColor = model.days.find((day) => day.dayNo === drag.held?.from)?.color ?? 'transparent';

  const propose = (stop: DayItem, fromDay: number, toDay: number) => {
    const source = model.days.find((day) => day.dayNo === fromDay);
    const target = model.days.find((day) => day.dayNo === toDay);
    if (source === undefined || target === undefined) return;
    setPreview({ stop, plan: planMove(stop, source, target, travel) });
  };
  return (
    <>
      <AllDaysView
        model={model}
        from={model.days.find((day) => day.dayNo === from) ?? null}
        over={drag.over}
        dragging={drag.held !== null}
        measureKey={measureKey}
        onBack={() =>
          router.canGoBack()
            ? router.back()
            : router.replace(tripPlanRoutes.day(tripId, from ?? model.days[0]?.dayNo ?? 1))
        }
        onShare={() => setSharing(true)}
        onOpenDay={(dayNo) => router.push(tripPlanRoutes.day(tripId, dayNo))}
        onMoveMenu={setMenuDay}
        onRect={drag.setRect}
        onHold={(stop, dayNo) => {
          impact('peel');
          setMeasureKey((key) => key + 1);
          drag.start(stop, dayNo);
        }}
        onDrag={(x, y) => {
          setPointer({ x, y });
          drag.move(x, y);
        }}
        onDrop={(x, y) => {
          setPointer(null);
          const dropped = drag.end(x, y);
          if (dropped.kind === 'refused') {
            impact('error');
            toast.show({ id: 'all-days-refused', title: refusalLine(dropped.refusal) });
          } else if (dropped.kind === 'move') {
            impact('snap');
            propose(dropped.stop, dropped.from, dropped.to);
          }
        }}
      />
      {drag.held === null || pointer === null ? null : (
        <View
          pointerEvents="none"
          style={[
            styles.ghost,
            { left: pointer.x - GHOST / 2, top: pointer.y - GHOST / 2, backgroundColor: heldColor },
          ]}
          testID="all-days-held"
        />
      )}
      {menuStopDay === undefined ? null : (
        <MoveStopSheet
          day={menuStopDay}
          days={model.days}
          onPick={(stop, to) => {
            setMenuDay(null);
            propose(stop, stop.dayNo, to);
          }}
          onClose={() => setMenuDay(null)}
        />
      )}
      {preview === null ? null : (
        <MovePreview
          stop={preview.stop}
          plan={preview.plan}
          canApply={data.plan.canApply}
          onConfirm={() => {
            const plan = preview.plan;
            setPreview(null);
            if (plan.ok) void editor.submit(plan.ops).then(announceEdit);
          }}
          onClose={() => setPreview(null)}
        />
      )}
      {sharing ? <ShareSheet plan={data.plan} onClose={() => setSharing(false)} /> : null}
    </>
  );
}
