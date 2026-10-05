/**
 * Lab scenes for a plan version made a moment ago, over the Bali Six's day: one leg's routed time
 * is still on its way (it reads "Working out the ride…", the day's line "working out the rides",
 * and the map draws that leg straight), and the same day once it has landed (routed minutes, the
 * road on the map). Stored legs are the fixture's own pairs with their estimated minutes rounded,
 * marked as routed.
 */
import { useState, type ReactNode } from 'react';

import { estimateLeg, type StoredLeg } from '@/data/legs/day-legs';
import { legPairKey } from '@/data/legs/version-leg-paths';

import { DayPlanView } from '../../day-plan/day-plan-view';
import { routeOf } from '../day-route';
import type { TripMapModel } from '../sheet-props';
import type { TripDay } from '../trip-days';
import { TripMapView } from '../trip-map-view';
import { labTripModel } from './bali-trip';

const noop = () => undefined;
const DAY = 1;

function storedLegs(day: TripDay): StoredLeg[] {
  const stops = day.stops.flatMap((stop) =>
    stop.place === null ? [] : [{ key: stop.stableId, ...stop.place }],
  );
  const ends =
    day.stay === null
      ? stops
      : [{ key: 'stay', ...day.stay }, ...stops, { key: 'stay', ...day.stay }];
  return ends.slice(1).flatMap((to, index) => {
    const from = ends[index];
    if (from === undefined) return [];
    const leg = estimateLeg(from, to);
    return [
      {
        from_key: from.key,
        to_key: to.key,
        mode: leg.mode,
        minutes: Math.max(1, Math.round(leg.minutes * 0.8)),
        meters: leg.meters,
        source: 'valhalla',
        approx: 0,
      },
    ];
  });
}

/** The lab trip on day 1, with its second leg's routed time still coming or already in. */
function useScene(coming: boolean) {
  const [state] = useState(() => {
    const base = labTripModel();
    const day = base.days.find((entry) => entry.dayNo === DAY) ?? null;
    if (day === null) return { model: base, day, route: { legs: [], after: [] } };
    const stored = storedLegs(day);
    const missing = stored[1];
    const legs = coming ? stored.filter((leg) => leg !== missing) : stored;
    const legPaths =
      !coming || missing === undefined || base.legPaths === undefined
        ? base.legPaths
        : new Map(
            [...base.legPaths].filter(
              ([key]) => key !== legPairKey(missing.from_key, missing.to_key),
            ),
          );
    const model: TripMapModel = { ...base, ...(legPaths === undefined ? {} : { legPaths }) };
    return { model, day, route: routeOf(day, legs, undefined, undefined, coming) };
  });
  return state;
}

function DayScene({ coming }: { readonly coming: boolean }) {
  const { model, day, route } = useScene(coming);
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
      onSelectDay={noop}
      onOpenMap={noop}
      onOpenStop={noop}
      onAdd={noop}
    />
  );
}

function MapScene({ coming }: { readonly coming: boolean }) {
  const { model, route } = useScene(coming);
  return (
    <TripMapView
      model={model}
      dayNo={DAY}
      onDayNo={noop}
      route={route}
      initialSnap="half"
      onShare={noop}
      onOpenDay={noop}
      onBack={noop}
      onOpenStop={noop}
    />
  );
}

export const LEGS_COMING_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'day-plan-legs-coming': () => <DayScene coming />,
  'day-plan-legs-landed': () => <DayScene coming={false} />,
  'trip-map-legs-coming': () => <MapScene coming />,
  'trip-map-legs-landed': () => <MapScene coming={false} />,
};
