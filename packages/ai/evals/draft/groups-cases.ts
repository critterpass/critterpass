/**
 * Trips planned in day groups (src/prompts/draft/groups.ts): a Đà Nẵng trip with a day in Hội An,
 * and a trip of two nights in Đà Nẵng then two in Huế. Each group is built the way the draft job
 * builds it: its own city's places, its own dates, and when the crew is there on them.
 */
import { candidatePools, dayTripReach, destinationPhrases, type TripFrame } from '@cp/planner';

import type { DraftModel, DraftPlanInput } from '../../src/prompts/draft/context';
import { runGroupedDraftPlan, type DayGroup } from '../../src/prompts/draft/groups';
import { gradeGroups, type GroupExpect } from './asserts/group-asserts';
import { planInput, type CrewCase } from './cases';

interface GroupSpec {
  readonly city: string;
  readonly dayNos: readonly number[];
  readonly edges: Pick<TripFrame, 'arrivalDay' | 'leavingDay' | 'reach'> &
    Partial<Pick<TripFrame, 'arrivalMin' | 'departureMin'>>;
  /** The area's name, for the one day of a day trip. */
  readonly dayTrip?: string;
}

export interface GroupCase {
  readonly id: string;
  readonly crew: CrewCase;
  readonly groups: readonly GroupSpec[];
  readonly expect: GroupExpect;
}

const CREW: Omit<CrewCase, 'id' | 'city' | 'days'> = {
  start: '2026-10-21',
  arrival_min: 600,
  departure_min: 1260,
  members: [
    { name: 'Khánh', tastes: ['history', 'street_food'], chronotype: null },
    { name: 'Linh', tastes: ['markets', 'photo_spots'], chronotype: 'early_bird' },
  ],
  diets: [],
  budget_days_pp_minor: null,
  stay_type: 'hotel',
  must_dos: [],
  wishes: [],
  expect_wishes: [],
  expect_must_dos: [],
  expect_full_days: false,
  expect_day_rules: false,
  expect_plan_rules: false,
  expect_places: [],
  expect_core_min: 0,
  held: [],
};

/** Hội An is about 45 minutes by car from Đà Nẵng; Huế about two and a half hours by train. */
const HOI_AN_MIN = 45;
const HUE_MIN = 150;

export const GROUP_CASES: readonly GroupCase[] = [
  {
    id: 'danang-hoi-an-1',
    crew: { ...CREW, id: 'danang-hoi-an-1', city: 'da-nang', days: 4 },
    groups: [
      { city: 'da-nang', dayNos: [1, 2, 4], edges: {} },
      {
        city: 'hoi-an',
        dayNos: [3],
        dayTrip: 'Hội An',
        edges: {
          arrivalDay: null,
          leavingDay: null,
          arrivalMin: null,
          departureMin: null,
          reach: { 1: dayTripReach(HOI_AN_MIN) },
        },
      },
    ],
    expect: { dayTrip: { dayNo: 3, ...dayTripReach(HOI_AN_MIN) } },
  },
  {
    id: 'danang-hue-1',
    crew: { ...CREW, id: 'danang-hue-1', city: 'da-nang', days: 5 },
    groups: [
      { city: 'da-nang', dayNos: [1, 2], edges: { leavingDay: null, departureMin: null } },
      {
        city: 'hue',
        dayNos: [3, 4, 5],
        // Off at nine, in by half past eleven.
        edges: { arrivalMin: 9 * 60 + HUE_MIN },
      },
    ],
    expect: { arrival: { dayNo: 3, fromMin: 9 * 60 + HUE_MIN } },
  },
];

/** One group's input: its city's places and a frame holding only its days. */
function groupInput(groupCase: GroupCase, spec: GroupSpec): DraftPlanInput {
  const base = planInput({ ...groupCase.crew, city: spec.city });
  const frame: TripFrame = {
    ...base.frame,
    dates: spec.dayNos.map((dayNo) => base.frame.dates[dayNo - 1] ?? ''),
    ...spec.edges,
  };
  return {
    ...base,
    frame,
    pools: candidatePools({
      pois: [...base.pois.values()],
      frame,
      tastes: base.tastes,
      ignoreNames: destinationPhrases(base.destination),
      ...(base.routed === undefined ? {} : { routed: base.routed }),
    }),
  };
}

export function caseGroups(groupCase: GroupCase): DayGroup[] {
  return groupCase.groups.map((spec) => ({
    destinationId: spec.city,
    dayNos: spec.dayNos,
    input: groupInput(groupCase, spec),
    ...(spec.dayTrip === undefined ? {} : { dayTrip: { name: spec.dayTrip } }),
  }));
}

export async function runGroupCase(groupCase: GroupCase, model: DraftModel) {
  const groups = caseGroups(groupCase);
  const result = await runGroupedDraftPlan(model, groups);
  const name = (id: string | null) => result.input.pois.get(id ?? '')?.name ?? id;
  const output = result.itinerary.days
    .map((d) => `${d.day_no}. ${d.theme}: ${d.items.map((i) => name(i.poi_id)).join(' → ')}`)
    .join(' / ');
  return {
    failures: gradeGroups(groups, result, groupCase.expect),
    output,
    firstPassClean: result.first.ok,
  };
}
