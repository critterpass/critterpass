/**
 * What a draft is built from. The trip and its crew come through the guide's own view
 * (`llm.trip_context`, read as `guide_reader` for the organiser): names, taste tags, the budget
 * band. The crew-visible setup rows (must-dos, consented dietary flags, the locked budget plan, the
 * room plan) and our curated places are read as the system; nothing here is C3, and no supplier
 * content exists to read. Editorial places come first; an open-data place joins only as a must-do.
 */
import { withGuideReader, withSystem } from '@cp/db';
import { budgetEstimates, type BudgetEstimateSource } from '@cp/cost-engine';
import { hoursSchema, TASTE_TAGS } from '@cp/domain';
import { defaultDurationMin, type DraftPoi } from '@cp/planner';
import type pg from 'pg';

/** Places offered per destination before the planner narrows them into pools. */
export const MAX_DRAFT_PLACES = 200;

export interface DraftTripData {
  readonly tripId: string;
  readonly crewId: string;
  readonly status: string;
  readonly startDate: string;
  readonly endDate: string;
  readonly tz: string;
  readonly currency: string;
  readonly destinationId: string;
  readonly destination: string;
  readonly guideSlug: string | null;
  readonly members: readonly {
    readonly uid: string;
    readonly name: string;
    readonly tastes: readonly string[];
  }[];
  readonly mustDos: readonly {
    readonly id: string;
    readonly ownerId: string;
    readonly poiId: string | null;
    readonly title: string;
  }[];
  readonly diets: readonly string[];
  /** Who each diet is for (first names), for the progress line. */
  readonly dietsBy: readonly { readonly diet: string; readonly name: string }[];
  /** Per person, in the trip currency. */
  readonly budget: {
    readonly targetMinor: number;
    readonly flightsMinor: number;
    readonly version: number;
  } | null;
  readonly rooms: {
    readonly version: number;
    readonly stays: readonly {
      readonly stayType: string;
      readonly nights: number;
      readonly nightlyPpMinor: number;
    }[];
    readonly bookingId: string | null;
    readonly freeCancelUntil: string | null;
  } | null;
  readonly bands: { readonly foodPpDayMinor: number; readonly funPpDayMinor: number } | null;
}

const DIETS = new Set(['vegetarian', 'vegan', 'pescatarian', 'halal', 'kosher']);

interface ContextRow {
  readonly crew_id: string;
  readonly status: string;
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  readonly destination_country: string | null;
  readonly guide_slug: string | null;
  readonly participants: {
    user_id: string;
    display_name: string | null;
    rsvp: string;
    taste_tags: string[] | null;
  }[];
}

interface RoomWire {
  readonly stay_key: string;
  readonly stay_type: string;
  readonly stay_nights: number;
  readonly capacity: number;
  readonly nightly_minor: number;
}

function staysOf(
  rooms: readonly RoomWire[],
): { stayType: string; nights: number; nightlyPpMinor: number }[] {
  const byKey = new Map<string, RoomWire[]>();
  for (const room of rooms) byKey.set(room.stay_key, [...(byKey.get(room.stay_key) ?? []), room]);
  return [...byKey.entries()]
    .sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true }))
    .map(([, list]) => {
      const beds = list.reduce((sum, r) => sum + r.capacity, 0);
      const nightly = list.reduce((sum, r) => sum + r.nightly_minor, 0);
      const first = list[0] as RoomWire;
      return {
        stayType: first.stay_type,
        nights: first.stay_nights,
        nightlyPpMinor: beds === 0 ? 0 : Math.round(nightly / beds),
      };
    });
}

/** Everything but the places; `null` when the trip has no dates or destination yet. */
export async function loadDraftTrip(
  pool: pg.Pool,
  tripId: string,
  organiserUid: string,
): Promise<DraftTripData | null> {
  const context = await withGuideReader(pool, organiserUid, tripId, async (tx) => {
    const { rows } = await tx.query<ContextRow>(
      `SELECT crew_id, status, start_date::text AS start_date, end_date::text AS end_date, tz,
              destination_id, destination_name, destination_country, guide_slug, participants
         FROM llm.trip_context`,
    );
    return rows[0];
  });
  if (
    context === undefined ||
    context.start_date === null ||
    context.end_date === null ||
    context.destination_id === null
  ) {
    return null;
  }
  const rest = await withSystem(pool, async (tx) => {
    const mustDos = await tx.query<{
      id: string;
      owner_id: string;
      poi_id: string | null;
      title: string;
    }>(
      `SELECT id, owner_id, poi_id, title FROM must_dos
        WHERE trip_id = $1 AND deleted_at IS NULL ORDER BY created_at, id`,
      [tripId],
    );
    const flags = await tx.query<{ user_id: string; flags: string[] }>(
      'SELECT user_id, flags FROM participant_dietary_flags WHERE trip_id = $1 ORDER BY user_id',
      [tripId],
    );
    const budget = await tx.query<{
      target_minor: string;
      breakdown: { flights?: number };
      version: number;
      is_stale: boolean;
    }>('SELECT target_minor, breakdown, version, is_stale FROM budget_plans WHERE trip_id = $1', [
      tripId,
    ]);
    const rooms = await tx.query<{
      rooms: RoomWire[];
      version: number;
      stay_booking_id: string | null;
      free_cancel_until: Date | null;
    }>(
      'SELECT rooms, version, stay_booking_id, free_cancel_until FROM room_plans WHERE trip_id = $1',
      [tripId],
    );
    const inputs = await tx.query<{ inputs: BudgetEstimateSource }>(
      'SELECT app.setup_budget_inputs($1) AS inputs',
      [tripId],
    );
    return {
      mustDos: mustDos.rows,
      flags: flags.rows,
      budget: budget.rows[0],
      rooms: rooms.rows[0],
      inputs: inputs.rows[0]?.inputs,
    };
  });
  const estimates = rest.inputs === undefined ? null : budgetEstimates(rest.inputs);
  const index = estimates?.index ?? null;
  const going = context.participants.filter((p) => p.rsvp !== 'out' && p.rsvp !== 'waitlisted');
  const plan = rest.budget;
  return {
    tripId,
    crewId: context.crew_id,
    status: context.status,
    startDate: context.start_date,
    endDate: context.end_date,
    tz: context.tz,
    currency: estimates?.currency ?? 'USD',
    destinationId: context.destination_id,
    destination: [context.destination_name, context.destination_country].filter(Boolean).join(', '),
    guideSlug: context.guide_slug,
    members: going.map((p) => ({
      uid: p.user_id,
      name: (p.display_name ?? 'A member').split(/\s+/u)[0] ?? 'A member',
      tastes: (p.taste_tags ?? []).filter((tag) => (TASTE_TAGS as readonly string[]).includes(tag)),
    })),
    mustDos: rest.mustDos.map((m) => ({
      id: m.id,
      ownerId: m.owner_id,
      poiId: m.poi_id,
      title: m.title,
    })),
    diets: [
      ...new Set(rest.flags.flatMap((row) => row.flags).filter((flag) => DIETS.has(flag))),
    ].sort(),
    dietsBy: rest.flags.flatMap((row) => {
      const member = going.find((p) => p.user_id === row.user_id);
      const name = (member?.display_name ?? '').split(/\s+/u)[0] ?? '';
      return name.length === 0
        ? []
        : row.flags.filter((f) => DIETS.has(f)).map((diet) => ({ diet, name }));
    }),
    budget:
      plan === undefined || plan.is_stale
        ? null
        : {
            targetMinor: Number(plan.target_minor),
            flightsMinor: plan.breakdown.flights ?? 0,
            version: plan.version,
          },
    rooms:
      rest.rooms === undefined
        ? null
        : {
            version: rest.rooms.version,
            stays: staysOf(rest.rooms.rooms),
            bookingId: rest.rooms.stay_booking_id,
            freeCancelUntil: rest.rooms.free_cancel_until?.toISOString() ?? null,
          },
    bands:
      index === null
        ? null
        : {
            foodPpDayMinor: Number(index.foodPpDayMinor),
            funPpDayMinor: Number(index.funPpDayMinor),
          },
  };
}

interface PoiRow {
  readonly id: string;
  readonly name: string;
  readonly category: string;
  readonly lat: number;
  readonly lng: number;
  readonly timezone: string;
  readonly hours: unknown;
  readonly price_level: number | null;
  readonly tags: string[] | null;
  readonly editorial: unknown;
  readonly curation: string;
}

/** Our curated places for the destination (editorial first), plus every must-do's place. */
export async function loadDraftPlaces(
  pool: pg.Pool,
  destinationId: string,
  mustDoPoiIds: readonly string[],
): Promise<DraftPoi[]> {
  const { rows } = await withSystem(pool, (tx) =>
    tx.query<PoiRow>(
      `(SELECT p.id, p.name, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
               p.hours, p.price_level, p.tags, p.editorial, p.curation
          FROM pois p JOIN destinations d ON d.id = p.destination_id
         WHERE p.destination_id = $1 AND p.status = 'active' AND p.curation = 'editorial'
           AND p.category NOT IN ('transit', 'stay', 'health')
         ORDER BY (p.editorial->>'must_see')::boolean IS TRUE DESC, p.id
         LIMIT $3)
       UNION
       (SELECT p.id, p.name, p.category, p.lat, p.lng, coalesce(p.timezone, d.tz) AS timezone,
               p.hours, p.price_level, p.tags, p.editorial, p.curation
          FROM pois p JOIN destinations d ON d.id = p.destination_id
         WHERE p.id = ANY($2::uuid[]) AND p.status = 'active')`,
      [destinationId, mustDoPoiIds, MAX_DRAFT_PLACES],
    ),
  );
  return rows.map((row) => {
    const editorial = (row.editorial ?? {}) as { time_needed_min?: unknown; must_see?: unknown };
    const hours = hoursSchema.safeParse(row.hours);
    return {
      id: row.id,
      name: row.name,
      category: row.category,
      lat: row.lat,
      lng: row.lng,
      tz: row.timezone,
      hours: hours.success && Object.keys(hours.data.weekly).length > 0 ? hours.data : null,
      priceLevel: row.price_level,
      tags: row.tags ?? [],
      durationMin:
        typeof editorial.time_needed_min === 'number' && editorial.time_needed_min > 0
          ? Math.round(editorial.time_needed_min)
          : defaultDurationMin(row.category),
      editorial: row.curation === 'editorial',
      mustSee: editorial.must_see === true,
    };
  });
}
