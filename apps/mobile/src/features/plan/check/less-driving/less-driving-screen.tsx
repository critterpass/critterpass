/**
 * Less driving (7h-3) for one day: the server's best order for the day (booked stops fixed), the
 * drive counting down from the old time to the new, and USE THIS ORDER, which an organiser applies
 * and a member sends to the crew; "Send it to the crew first" asks the crew either way.
 */
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { selectOrdinal, t } from '@lingui/core/macro';

import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { useMotionMode } from '@/motion/motion-mode';
import { toast } from '@/motion/island-toast';

import { fixerPaths, readReorder, useFixerRead } from '../data/fixer-api';
import { useCheckContext } from '../data/use-check-context';
import { dayTag, driveTitle } from '../format';
import { planOpsOf } from '../plan-ops';
import { checkRoutes } from '../routes';
import { LessDrivingView, type OrderRow } from './less-driving-view';

const COUNT_MS = 1200;

/** The drive shown while it counts down from `from` to `to` (straight to `to` without motion). */
function useCountdown(from: number, to: number, run: boolean): number {
  const [tick, setTick] = useState<{ readonly start: number; readonly now: number } | null>(null);
  useEffect(() => {
    if (!run || from <= to) return undefined;
    const start = Date.now();
    const timer = setInterval(() => {
      const now = Date.now();
      setTick({ start, now });
      if (now - start >= COUNT_MS) clearInterval(timer);
    }, 50);
    return () => clearInterval(timer);
  }, [from, to, run]);
  if (!run || from <= to) return to;
  if (tick === null) return from;
  const k = Math.min(1, (tick.now - tick.start) / COUNT_MS);
  return Math.round(from - (from - to) * k);
}

export function wasLabel(position: number, time: string, moved: boolean): string {
  return moved
    ? t({
        id: 'plan.check.lessDriving.wasPlace',
        message: selectOrdinal(position, {
          one: 'WAS #ST',
          two: 'WAS #ND',
          few: 'WAS #RD',
          other: 'WAS #TH',
        }),
      })
    : t({ id: 'plan.check.lessDriving.wasTime', message: `WAS ${time}` });
}

export function LessDrivingScreen({
  tripId,
  dayId,
}: {
  readonly tripId: string;
  readonly dayId: string;
}) {
  const plan = useTripPlan(tripId);
  const editor = useDayEditing(plan);
  const ctx = useCheckContext(plan);
  const [motionMode] = useMotionMode();
  const version = plan.trip?.current_version_id ?? null;
  const path = useMemo(() => fixerPaths.reorder(tripId, dayId), [tripId, dayId]);
  const read = useFixerRead(path, version, readReorder);
  const [busy, setBusy] = useState(false);
  const answer = read.data;
  const reduced = motionMode !== 'full';
  const shown = useCountdown(
    answer?.beforeMin ?? 0,
    answer?.afterMin ?? 0,
    !reduced && answer?.found === true,
  );
  const date = ctx.dayDate(dayId);
  const point = (stableId: string) => plan.display.get(stableId)?.place ?? null;
  const points = (order: readonly string[]) =>
    order.flatMap((id) => {
      const place = point(id);
      return place === null ? [] : [place];
    });
  const stayRow = plan.itemRows.find((row) => row.category === 'stay' && row.poi_lat !== null);
  const stay =
    stayRow?.poi_lat == null || stayRow.poi_lng == null
      ? null
      : { lat: stayRow.poi_lat, lng: stayRow.poi_lng };

  const rows: OrderRow[] = (answer?.afterOrder ?? []).map((stableId, index) => {
    const slot = answer?.schedule.find((entry) => entry.stableId === stableId);
    const was = answer?.was.find((entry) => entry.stableId === stableId) ?? null;
    const moved = was !== null && was.position !== index + 1;
    return {
      key: stableId,
      time: slot === undefined ? '' : ctx.clock(slot.startsAt, dayId),
      name: ctx.name(stableId),
      booked: answer?.locked.includes(stableId) === true,
      was: was === null ? null : wasLabel(was.position, ctx.clock(was.startsAt, dayId), moved),
    };
  });

  const ops = planOpsOf(answer?.ops ?? []);
  const done = (outcome: { kind: string }) => {
    setBusy(false);
    if (outcome.kind === 'unavailable') return;
    toast.show({
      id: 'plan-less-driving-done',
      title:
        outcome.kind === 'applied'
          ? t({ id: 'plan.check.lessDriving.applied', message: 'New order, less driving' })
          : t({ id: 'plan.check.toast.sent', message: 'Sent to the crew' }),
    });
    router.back();
  };

  return (
    <LessDrivingView
      backLabel={date === null ? '' : dayTag(date)}
      onBack={() => router.back()}
      state={answer === null ? 'loading' : answer.found ? 'ready' : 'none'}
      before={driveTitle(answer?.beforeMin ?? 0)}
      after={driveTitle(shown)}
      beforeStops={points(answer?.beforeOrder ?? [])}
      afterStops={points(answer?.afterOrder ?? [])}
      stay={stay}
      rows={rows}
      primary={{
        label: plan.canApply
          ? t({ id: 'plan.check.lessDriving.use', message: 'Use this order' })
          : t({ id: 'plan.check.lessDriving.suggest', message: 'Suggest this order' }),
        busy,
        onPress: () => {
          setBusy(true);
          void editor.submit(ops).then(done);
        },
      }}
      send={plan.canApply ? () => void editor.propose(ops, plan.state).then(done) : null}
      onOpenCheck={() => router.replace(checkRoutes.check(tripId))}
      reducedMotion={reduced}
    />
  );
}
