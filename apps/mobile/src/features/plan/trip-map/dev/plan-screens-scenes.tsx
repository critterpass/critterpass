/**
 * Lab scenes for the section 7 plan screens over the Bali Six's trip: the trip map at peek, half
 * and full, the empty trip, the day plan, its map open and all days. Built through the same views
 * as the app with the legs estimated; the sheets, chips and the day chips work, links go nowhere.
 */
/* eslint-disable lingui/no-unlocalized-strings -- scene names, only in the (dev) lab. */
import { useState, type ReactNode } from 'react';

import type { MapSheetSnap } from '@/ui/sheet/map-sheet-snap';

import type { DayItem } from '@/data/plan/plan-model';

import { AllDaysView } from '../../all-days/all-days-view';
import { MovePreview, MoveStopSheet } from '../../all-days/move-preview';
import { planMove, type MovePlan } from '../../all-days/use-cross-day-drag';
import { DayMapView } from '../../day-plan/day-map-view';
import { DayPlanView } from '../../day-plan/day-plan-view';
import { estimatedRoute } from '../day-route';
import type { TripMapModel } from '../sheet-props';
import { TripMapView } from '../trip-map-view';
import { labEmptyModel, labTripModel } from './bali-trip';

const noop = () => undefined;

function useLabDay(model: TripMapModel) {
  const [dayNo, setDayNo] = useState(3);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = day === null ? { legs: [], startsAtStay: false } : estimatedRoute(day);
  return { dayNo, setDayNo, day, route };
}

function TripMapScene({
  snap,
  empty = false,
}: {
  readonly snap: MapSheetSnap;
  readonly empty?: boolean;
}) {
  const [model] = useState(() => (empty ? labEmptyModel() : labTripModel()));
  const { dayNo, setDayNo, route } = useLabDay(model);
  return (
    <TripMapView
      model={model}
      dayNo={dayNo}
      onDayNo={setDayNo}
      route={route}
      initialSnap={snap}
      onShare={noop}
      onOpenDay={noop}
    />
  );
}

function DayPlanScene() {
  const [model] = useState(() => labTripModel());
  const { setDayNo, day, route } = useLabDay(model);
  if (day === null) return null;
  return (
    <DayPlanView
      model={model}
      day={day}
      route={route}
      order={null}
      rain={day.dayNo === 3 ? 'Rain likely 13–15' : null}
      here={[]}
      drag={null}
      onBack={noop}
      onAllDays={noop}
      onShare={noop}
      onSelectDay={setDayNo}
      onOpenMap={noop}
      onOpenStop={noop}
      onAdd={noop}
    />
  );
}

function DayMapScene() {
  const [model] = useState(() => labTripModel());
  const { dayNo, setDayNo, route } = useLabDay(model);
  return (
    <DayMapView
      model={model}
      dayNo={dayNo}
      onDayNo={setDayNo}
      route={route}
      versionId={null}
      onBack={noop}
      onOpenStop={noop}
    />
  );
}

/** All days with "Move a stop" and the move's preview working (nothing is sent). */
function AllDaysScene({ member = false }: { readonly member?: boolean }) {
  const [model] = useState(() => labTripModel({ organiser: !member }));
  const [menuDay, setMenuDay] = useState<number | null>(null);
  const [preview, setPreview] = useState<{ stop: DayItem; plan: MovePlan } | null>(null);
  const menu = model.days.find((day) => day.dayNo === menuDay);
  return (
    <>
      <AllDaysView
        model={model}
        from={model.days[2] ?? null}
        over={null}
        dragging={false}
        measureKey={0}
        onBack={noop}
        onShare={noop}
        onOpenDay={noop}
        onMoveMenu={setMenuDay}
        onRect={noop}
        onHold={noop}
        onDrag={noop}
        onDrop={noop}
      />
      {menu === undefined ? null : (
        <MoveStopSheet
          day={menu}
          days={model.days}
          onPick={(stop, to) => {
            setMenuDay(null);
            const target = model.days.find((day) => day.dayNo === to);
            if (target !== undefined) {
              setPreview({ stop, plan: planMove(stop, menu, target, () => 20) });
            }
          }}
          onClose={() => setMenuDay(null)}
        />
      )}
      {preview === null ? null : (
        <MovePreview
          stop={preview.stop}
          plan={preview.plan}
          canApply={!member}
          onConfirm={() => setPreview(null)}
          onClose={() => setPreview(null)}
        />
      )}
    </>
  );
}

export const PLAN_SCREENS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'trip-map': () => <TripMapScene snap="peek" />,
  'trip-map-day': () => <TripMapScene snap="half" />,
  'trip-map-whole-trip': () => <TripMapScene snap="full" />,
  'trip-map-nothing-saved': () => <TripMapScene snap="half" empty />,
  'day-plan': () => <DayPlanScene />,
  'day-plan-map-open': () => <DayMapScene />,
  'all-days': () => <AllDaysScene />,
  'all-days-member': () => <AllDaysScene member />,
};
