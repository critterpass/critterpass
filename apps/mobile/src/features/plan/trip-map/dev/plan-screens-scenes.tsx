/**
 * Lab scenes for the section 7 plan screens over the Bali Six's trip: the trip map at peek, half
 * and full, the empty trip, the day plan, its map open and all days. Built through the same views
 * as the app with the leg minutes estimated and the lines along recorded roads; the sheets, chips and the day chips work, links go nowhere.
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
import {
  labDayTripModel,
  labDraftModel,
  labEmptyDaysModel,
  labEmptyModel,
  labNoPlanYetModel,
  labTripModel,
} from './bali-trip';
import { LEGS_COMING_SCENES } from './legs-coming-scenes';

const noop = () => undefined;

function useLabDay(model: TripMapModel) {
  const [dayNo, setDayNo] = useState(3);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = day === null ? { legs: [], after: [] } : estimatedRoute(day);
  return { dayNo, setDayNo, day, route };
}

/** 10:00 on the trip's third day (Wed 14 Oct, Bali): the day shown is today and GO appears. */
const ON_DAY_3 = new Date('2026-10-14T02:00:00Z');

/** The Bali Six's trip map at a snap (the backdrop of the lab's export sheet too). */
export function TripMapScene({
  snap,
  empty = false,
  today = false,
  noPack = false,
  before,
}: {
  readonly snap: MapSheetSnap;
  readonly empty?: boolean;
  /** The trip is under way and the day shown is today. */
  readonly today?: boolean;
  /** The destination has no region pack: a slug the tiles host has never heard of. */
  readonly noPack?: boolean;
  /** Before the crew has a plan: her own draft, or the trip's days with nothing on them yet. */
  readonly before?: 'draft' | 'days' | 'member';
}) {
  const [model] = useState(() => ({
    ...(before === 'draft'
      ? labDraftModel()
      : before === 'days'
        ? labEmptyDaysModel()
        : before === 'member'
          ? labNoPlanYetModel()
          : empty
            ? labEmptyModel()
            : labTripModel()),
    ...(today ? { now: ON_DAY_3 } : {}),
    ...(noPack ? { destinationSlug: 'lab-no-region-pack' } : {}),
  }));
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
      onBack={noop}
      onOpenStop={noop}
    />
  );
}

/** The Bali Six's third day in the day plan (the backdrop of the lab's stop sheets too). */
export function DayPlanScene({
  today = false,
  before,
}: {
  readonly today?: boolean;
  readonly before?: 'draft' | 'days';
}) {
  const [model] = useState(() => ({
    ...(before === 'draft'
      ? labDraftModel()
      : before === 'days'
        ? labEmptyDaysModel()
        : labTripModel()),
    ...(today ? { now: ON_DAY_3 } : {}),
  }));
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
function AllDaysScene({
  member = false,
  menuOpen = false,
}: {
  readonly member?: boolean;
  /** Opens on "Move a stop" for Tuesday, as a hold on its card does. */
  readonly menuOpen?: boolean;
}) {
  const [model] = useState(() => labTripModel({ organiser: !member }));
  const [menuDay, setMenuDay] = useState<number | null>(menuOpen ? 2 : null);
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

/** The boat day of the trip as a day trip to Nusa Penida (about 1 h 30 by boat each way). */
const DAY_TRIP_DAY = 5;

/** The trip with a day trip, on that day: the map is the area's, whose pack is not on the phone. */
function useDayTripLab() {
  const [model] = useState(() => ({ ...labDayTripModel(), destinationSlug: 'lab-no-region-pack' }));
  const [dayNo, setDayNo] = useState(DAY_TRIP_DAY);
  const day = model.days.find((entry) => entry.dayNo === dayNo) ?? null;
  const route = day === null ? { legs: [], after: [] } : estimatedRoute(day);
  return { model, dayNo, setDayNo, day, route };
}

function DayTripMapScene({ snap }: { readonly snap: MapSheetSnap }) {
  const { model, dayNo, setDayNo, route } = useDayTripLab();
  return (
    <TripMapView
      model={model}
      dayNo={dayNo}
      onDayNo={setDayNo}
      route={route}
      initialSnap={snap}
      onShare={noop}
      onOpenDay={noop}
      onBack={noop}
      onOpenStop={noop}
    />
  );
}

function DayTripPlanScene() {
  const { model, setDayNo, day, route } = useDayTripLab();
  if (day === null) return null;
  return (
    <DayPlanView
      model={model}
      day={day}
      route={route}
      order={null}
      rain={null}
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

function DayTripAllDaysScene() {
  const { model } = useDayTripLab();
  return (
    <AllDaysView
      model={model}
      from={model.days[DAY_TRIP_DAY - 1] ?? null}
      over={null}
      dragging={false}
      measureKey={0}
      onBack={noop}
      onShare={noop}
      onOpenDay={noop}
      onMoveMenu={noop}
      onRect={noop}
      onHold={noop}
      onDrag={noop}
      onDrop={noop}
    />
  );
}

export const PLAN_SCREENS_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'trip-map': () => <TripMapScene snap="peek" />,
  'trip-map-day': () => <TripMapScene snap="half" />,
  'trip-map-day-today': () => <TripMapScene snap="half" today />,
  'trip-map-whole-trip': () => <TripMapScene snap="full" />,
  'trip-map-nothing-saved': () => <TripMapScene snap="half" empty />,
  'trip-map-no-pack': () => <TripMapScene snap="peek" noPack />,
  'trip-map-day-no-pack': () => <TripMapScene snap="half" noPack />,
  // Before the crew has a plan: the trip's days with nothing on them, and her draft with the
  // check's tags on its days.
  'trip-map-days-before-draft': () => <TripMapScene snap="half" before="days" />,
  'trip-map-no-plan-yet': () => <TripMapScene snap="half" before="member" />,
  'trip-map-own-draft': () => <TripMapScene snap="peek" before="draft" />,
  'trip-map-own-draft-day': () => <TripMapScene snap="half" before="draft" />,
  'day-plan-days-before-draft': () => <DayPlanScene before="days" />,
  'day-plan-own-draft': () => <DayPlanScene before="draft" />,
  'day-plan': () => <DayPlanScene />,
  'day-plan-today': () => <DayPlanScene today />,
  'day-plan-map-open': () => <DayMapScene />,
  'all-days': () => <AllDaysScene />,
  'all-days-move': () => <AllDaysScene menuOpen />,
  'all-days-member': () => <AllDaysScene member menuOpen />,
  // A day spent in a linked area: its name on every screen, its travel line, its own map.
  'trip-map-day-trip': () => <DayTripMapScene snap="half" />,
  'trip-map-day-trip-whole-trip': () => <DayTripMapScene snap="full" />,
  'day-plan-day-trip': () => <DayTripPlanScene />,
  'all-days-day-trip': () => <DayTripAllDaysScene />,
  ...LEGS_COMING_SCENES,
};
