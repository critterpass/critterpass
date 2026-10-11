/**
 * The plan map's places layer and its filter chips (4.25, 4.34): what the crew saved and the
 * guide's picks under the routes, the chips at peek (the chosen day, Saved, Crew picks, the top
 * categories), and what a chip does: the day chip traces or untraces the day, any other chip
 * fades what it leaves out to 20 % and a second tap lets go. At full the layer steps away.
 */
import { useMemo, useState } from 'react';

import { dateLine } from '../../trip-map/format';
import {
  categoryChips,
  CREW_PICK_BACKERS,
  mapPlaces,
  NO_FILTER,
  type MapFilter,
} from '../../trip-map/map-places';
import { DAY_CHIP, filterChips, nextFilter } from '../../trip-map/trip-map-filters';
import type { TripDay } from '../../trip-map/trip-days';
import type { useTripMapModel } from '../../trip-map/use-trip-map-model';
import type { MapDetent } from '../map';
import type { FilterChip } from './top-bar';

type Model = ReturnType<typeof useTripMapModel>['model'];

export function useMapFilters(input: {
  readonly model: Model;
  readonly day: TripDay | null;
  readonly detent: MapDetent;
  readonly locale: string;
}) {
  const { model, day, detent, locale } = input;
  const [filter, setFilter] = useState<MapFilter>(NO_FILTER);
  const [traced, setTraced] = useState(true);
  const all = useMemo(
    () =>
      mapPlaces({
        ideas: model.ideas,
        curated: model.curated,
        planned: model.planned,
        joinIndex: new Map(model.members.map((member) => [member.uid, member.joinIndex])),
        filter,
        showSuggested: detent === 'peek',
      }),
    [model.ideas, model.curated, model.planned, model.members, filter, detent],
  );
  const crewPicks = all.filter(
    (place) => place.tier === 'saved' && place.backers >= CREW_PICK_BACKERS,
  ).length;
  const chips: readonly FilterChip[] | null =
    detent !== 'peek' || model.empty
      ? null
      : filterChips({
          day,
          dayChosen: traced,
          weekday: day?.date == null ? '' : dateLine(locale, day.date),
          saved: model.ideas.length + model.placedCount,
          crewPicks,
          categories: categoryChips(all),
          filter,
        }).map((chip) => ({
          key: chip.key,
          label: chip.label,
          selected: chip.selected,
          ...(chip.count === undefined ? {} : { count: chip.count }),
          ...(chip.key === DAY_CHIP && day !== null ? { dayNo: day.dayNo } : {}),
        }));
  return {
    places: detent === 'full' ? [] : all,
    chips,
    /** Whether the chosen day's route shows (the day chip turns it off). */
    traced,
    onChip: (key: string) => {
      if (key === DAY_CHIP) setTraced((on) => !on);
      else setFilter((current) => nextFilter(current, key));
    },
  };
}
