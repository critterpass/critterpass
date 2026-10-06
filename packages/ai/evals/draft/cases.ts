/**
 * Turns the golden crews (golden/*.json) into the drafting pipeline's inputs exactly as the job
 * builds them: the city's places as `DraftPoi`s, the trip frame, the planner's candidate pools and
 * the straight-line travel matrix. Member and must-do ids are derived from the case id, so a
 * recording stays valid across runs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { redraftReasonKeySchema } from '@cp/domain';
import {
  candidatePools,
  destinationPhrases,
  instantAt,
  knownPlaceFor,
  resolveWishes,
  routedPairKey,
  straightLineMatrix,
  type RoutedPairs,
  timeWords,
  withOpenDataDefaults,
  type DraftPoi,
  type TripFrame,
} from '@cp/planner';
import { z } from 'zod';

import type { DraftPlanInput } from '../../src/prompts/draft/context';
import { withHeldStops } from '../../src/prompts/draft/held';
import { derivedUuid } from '../../src/prompts/draft/ids';
import { withGoldenFacts } from './typed-input';
import { personaIdSchema } from '../../src/persona/schema';

const GOLDEN = fileURLToPath(new URL('./golden/', import.meta.url));

const hoursSchema = z
  .object({
    weekly: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))),
  })
  .nullable();

const citySchema = z.object({
  guide: personaIdSchema,
  destination: z.string(),
  tz: z.string(),
  bands: z.object({ food_pp_day_minor: z.int(), fun_pp_day_minor: z.int() }),
  /** The destination's own languages (a reader of one sees local place names). */
  languages: z.array(z.string()).default([]),
  pois: z.array(
    z.object({
      id: z.uuid(),
      name: z.string(),
      /** The name in the destination's own language, when our editors gave one. */
      name_local: z.string().optional(),
      category: z.string(),
      lat: z.number(),
      lng: z.number(),
      hours: hoursSchema,
      price_level: z.int().nullable(),
      duration_min: z.int(),
      tags: z.array(z.string()),
      must_see: z.boolean(),
      /** One of the handful a first visit should hold (our editors' second tier). */
      essential: z.boolean().optional(),
      editorial: z.boolean(),
      why_go: z.string().optional(),
      best_time: z.string().optional(),
      /** A row the draft job would read only when a must-do or a typed wish names it. */
      wish_only: z.boolean().optional(),
    }),
  ),
  /** Minutes the routing service gave between two of the places on staging: [a, b, minutes]. */
  routed: z.array(z.tuple([z.uuid(), z.uuid(), z.int()])).default([]),
});

export const crewCaseSchema = z.object({
  id: z.string(),
  city: z.string(),
  start: z.iso.date(),
  days: z.int().min(1).max(7),
  arrival_min: z.int().nullable(),
  departure_min: z.int().nullable(),
  members: z.array(
    z.object({
      name: z.string(),
      tastes: z.array(z.string()),
      chronotype: z.enum(['early_bird', 'night_owl']).nullable(),
    }),
  ),
  diets: z.array(z.string()),
  budget_days_pp_minor: z.int().nullable(),
  stay_type: z.string().nullable(),
  must_dos: z.array(z.object({ poi_id: z.uuid(), owner: z.int() })),
  wishes: z.array(z.string()),
  /** What the draft must do with a typed wish (by its index in `wishes`). */
  expect_wishes: z
    .array(
      z.object({
        wish: z.int().min(0),
        /** The place the wish must land on, by any of these ids (rows of one place). */
        place_ids: z.array(z.uuid()).min(1),
        /** Local "HH:MM" bounds on the stop's start and end. */
        start_before: z.string().optional(),
        start_from: z.string().optional(),
        start_by: z.string().optional(),
        end_after: z.string().optional(),
        weekdays: z.array(z.enum(['mo', 'tu', 'we', 'th', 'fr', 'sa', 'su'])).optional(),
      }),
    )
    .default([]),
  /** The row a picked must-do must be planned at (by its index in `must_dos`). */
  expect_must_dos: z
    .array(z.object({ must_do: z.int().min(0), place_ids: z.array(z.uuid()).min(1) }))
    .default([]),
  /** Every day between the first and last must have lunch, dinner and at least four stops. */
  expect_full_days: z.boolean().default(false),
  /** The day is graded as a traveller would: openers first, meals near, no hole after breakfast. */
  expect_day_rules: z.boolean().default(false),
  /** Hold the plan to the rules of how a day reads (./asserts/plan-rules-asserts.ts). */
  expect_plan_rules: z.boolean().default(false),
  /** Places, by name, the draft must hold (the founder's own trip holds Datanla). */
  expect_places: z.array(z.string()).default([]),
  /** The language the organiser reads: the draft is written in it. */
  locale: z.string().optional(),
  /** How many of the trip's core must-sees the draft must hold at least. */
  expect_core_min: z.int().min(0).default(0),
  /** Stops the organiser placed by hand before the draft: local "HH:MM" on day `day`. */
  held: z
    .array(
      z.object({
        day: z.int().positive(),
        /** The place, or null for a stop on a dropped pin (then `pin` says where). */
        poi_id: z.uuid().nullable(),
        pin: z.object({ name: z.string(), lat: z.number(), lng: z.number() }).optional(),
        start: z.string(),
        end: z.string(),
        kind: z.enum(['activity', 'meal']),
      }),
    )
    .default([]),
});
export type CrewCase = z.infer<typeof crewCaseSchema>;

export const redraftCaseSchema = z.object({
  id: z.string(),
  crew: z.string(),
  day: z.int().positive(),
  reasons: z.array(redraftReasonKeySchema),
  note: z.string().nullable(),
  chat: z.array(z.object({ author: z.string(), text: z.string() })),
  /** The language the organiser reads (the redraft writes in it). */
  locale: z.string().optional(),
  /** The day as staging held it, by place name in order (default: the baseline's day). */
  base_day: z.array(z.string()).optional(),
});
export type RedraftCase = z.infer<typeof redraftCaseSchema>;

function load<T>(file: string, schema: z.ZodType<T>): T {
  return schema.parse(JSON.parse(readFileSync(resolve(GOLDEN, file), 'utf8')));
}

/** The hand-made guide cities, and real place sets read from staging (curated, automatic picks). */
export const CITIES = {
  ...load('cities.json', z.record(z.string(), citySchema)),
  ...load('real-cities.json', z.record(z.string(), citySchema)),
};
export const CREWS = load('crews.json', z.array(crewCaseSchema));
export const INJECTION_DRAFTS = load('injection-drafts.json', z.array(crewCaseSchema));
export const REDRAFTS = load('redrafts.json', z.array(redraftCaseSchema));

/** The id a case's `i`th picked must-do has. */
export function mustDoId(crew: Pick<CrewCase, 'id'>, i: number): string {
  return derivedUuid(`${crew.id}:must_do:${i}`);
}

/** The id a case's `i`th typed wish has (also its must-do id). */
export function wishId(crew: Pick<CrewCase, 'id'>, i: number): string {
  return derivedUuid(`${crew.id}:wish:${i}`);
}

function datesFrom(start: string, days: number): string[] {
  return Array.from({ length: days }, (_, i) => {
    const at = new Date(`${start}T00:00:00Z`);
    at.setUTCDate(at.getUTCDate() + i);
    return at.toISOString().slice(0, 10);
  });
}

export function planInput(
  crew: CrewCase,
  skeletonRoute: DraftPlanInput['skeletonRoute'] = 'draft.skeleton',
  /** Plan from typed place facts, as the job does while `planner.typed_places` is on. */
  typed = false,
): DraftPlanInput {
  const city = CITIES[crew.city];
  if (city === undefined) throw new Error(`no golden city ${crew.city}`);
  const pois = new Map<string, DraftPoi>(
    city.pois.map((p) => [
      p.id,
      {
        id: p.id,
        name: p.name,
        ...(p.name_local === undefined ? {} : { nameLocal: p.name_local }),
        category: p.category,
        lat: p.lat,
        lng: p.lng,
        tz: city.tz,
        hours: p.hours,
        priceLevel: p.price_level,
        tags: p.tags,
        durationMin: p.duration_min,
        editorial: p.editorial,
        mustSee: p.must_see,
        ...(p.essential === true ? { essential: true } : {}),
        whyGo: p.why_go ?? null,
        bestTime: p.best_time ?? null,
      },
    ]),
  );
  for (const p of city.pois) {
    const poi = withOpenDataDefaults(pois.get(p.id) as DraftPoi);
    pois.set(p.id, typed ? withGoldenFacts(poi, p) : poi);
  }
  const members = crew.members.map((_, i) => derivedUuid(`${crew.id}:member:${i}`));
  const ignore = destinationPhrases(city.destination);
  const wishes = crew.wishes.map((text, i) => ({ id: wishId(crew, i), text }));
  const wished = resolveWishes(wishes, [...pois.values()], ignore);
  const knownRow = (poiId: string) => {
    const own = pois.get(poiId);
    return own === undefined ? poiId : knownPlaceFor(own, [...pois.values()], ignore).id;
  };
  // Rows the job reads only for a must-do or a wish are dropped unless one names them.
  const named = new Set([
    ...crew.must_dos.map((m) => m.poi_id),
    ...wished.places.values(),
    ...wished.offered,
    ...[...wished.options.values()].flat(),
  ]);
  const wishOnly = new Set(city.pois.filter((p) => p.wish_only === true).map((p) => p.id));
  const mustDoRows = new Map(crew.must_dos.map((m) => [m.poi_id, knownRow(m.poi_id)]));
  for (const id of wishOnly) if (!named.has(id)) pois.delete(id);
  const frame: TripFrame = {
    tz: city.tz,
    currency: 'USD',
    dates: datesFrom(crew.start, crew.days),
    members,
    chronotypes: Object.fromEntries(
      crew.members.flatMap((m, i): [string, 'early_bird' | 'night_owl'][] =>
        m.chronotype === null ? [] : [[members[i] as string, m.chronotype]],
      ),
    ),
    diets: crew.diets,
    arrivalMin: crew.arrival_min,
    departureMin: crew.departure_min,
    budgetPpMinor: crew.budget_days_pp_minor,
    mustDos: [
      ...crew.must_dos.map((m, i) => ({
        id: mustDoId(crew, i),
        ownerId: members[m.owner] ?? (members[0] as string),
        // Planned at the well-known row of the same spot, the way the draft job does.
        poiId: mustDoRows.get(m.poi_id) ?? m.poi_id,
        title: pois.get(m.poi_id)?.name ?? 'must-do',
      })),
      // Typed must-dos, matched to places the way the draft job does.
      ...wishes.map((wish) => ({
        id: wish.id,
        ownerId: members[0] as string,
        poiId: wished.places.get(wish.id) ?? null,
        title: wish.text,
        when: timeWords(wish.text),
      })),
    ],
    closures: [],
  };
  const tastes: Record<string, number> = {};
  for (const member of crew.members) {
    for (const tag of member.tastes) tastes[tag] = (tastes[tag] ?? 0) + 1;
  }
  // Her own stops, as the draft job passes them: kept out of what the guide is offered.
  const minuteOf = (time: string) => {
    const [h = 0, m = 0] = time.split(':').map(Number);
    return h * 60 + m;
  };
  const held = crew.held.map((stop, i) => {
    const date = frame.dates[stop.day - 1] as string;
    const at = (time: string) => instantAt(date, minuteOf(time), city.tz).toISOString();
    return {
      dayNo: stop.day,
      item: {
        stable_id: derivedUuid(`${crew.id}:held:${i}`),
        kind: stop.kind,
        poi_id: stop.poi_id,
        starts_at: at(stop.start),
        ends_at: at(stop.end),
        tz: city.tz,
        must_do_id: null,
        booking_id: null,
        locked_reason: 'user' as const,
        cost_model: 'per_person' as const,
        amount_minor: 0,
        currency: 'USD',
        travel_min: 0,
        note: null,
      },
      ...(stop.pin === undefined ? {} : { pin: stop.pin }),
    };
  });
  const heldPlaces = new Set(crew.held.map((stop) => stop.poi_id));
  const routed: RoutedPairs = new Map(
    city.routed.map(([a, b, minutes]) => [routedPairKey(a, b), minutes]),
  );
  const plain: DraftPlanInput = {
    guide: city.guide,
    destination: city.destination,
    frame,
    pois,
    ...(crew.locale === undefined ? {} : { locale: crew.locale }),
    destinationLanguages: city.languages,
    pools: candidatePools({
      pois: [...pois.values()].filter((poi) => !heldPlaces.has(poi.id)),
      frame,
      tastes,
      include: wished.offered,
      ignoreNames: ignore,
      routed,
    }),
    tastes,
    bands: {
      foodPpDayMinor: city.bands.food_pp_day_minor,
      funPpDayMinor: city.bands.fun_pp_day_minor,
    },
    travel: straightLineMatrix(pois, routed),
    routed,
    stayType: crew.stay_type,
    names: Object.fromEntries(
      crew.members.map((m, i): [string, string] => [members[i] as string, m.name]),
    ),
    wishes: wishes.map((wish) => ({ ...wish, options: wished.options.get(wish.id) ?? [] })),
    idFor: (key) => derivedUuid(`${crew.id}:${key}`),
    skeletonRoute,
  };
  return held.length > 0 ? withHeldStops(plain, held) : plain;
}
