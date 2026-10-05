/**
 * What a draft is built from. The trip and its crew come through the guide's own view
 * (`llm.trip_context`, read as `guide_reader` for the organiser): names, taste tags, the budget
 * band. The crew-visible setup rows (must-dos, consented dietary flags, the locked budget plan, the
 * room plan, and when the flights and trains the crew can see leave and land: a personal flight
 * shows its times unless its owner opted out) are read as the system; nothing here is C3, and no supplier content exists to read. The places themselves are read in `./load-places`.
 */
import { withGuideReader, withSystem } from '@cp/db';
import { budgetEstimates, type BudgetEstimateSource } from '@cp/cost-engine';
import { TASTE_TAGS } from '@cp/domain';
import type pg from 'pg';

export { loadDraftPlaces } from './load-places';

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
  /**
   * The destination's own languages: those of its set of the dex, else of its country's set (a
   * destination's slug leads with its country code, `vn-da-lat`). Empty when neither is known.
   */
  readonly languages?: readonly string[];
  /** When each flight or train shared with the crew leaves and lands (ISO instants). */
  readonly transport: readonly {
    readonly startsAt: string | null;
    readonly endsAt: string | null;
  }[];
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
    const transport = await tx.query<{ starts_at: Date | null; ends_at: Date | null }>(
      `SELECT starts_at, ends_at FROM bookings
        WHERE trip_id = $1 AND deleted_at IS NULL AND status = 'booked'
          AND ((type = 'rail' AND visibility = 'crew')
            OR (type = 'flight' AND (visibility = 'crew' OR flight_crew_visible)))
        ORDER BY starts_at, id`,
      [tripId],
    );
    const languages = await tx.query<{ languages: string[] }>(
      `SELECT s.languages FROM critter_sets s JOIN destinations d ON d.id = $1
        WHERE s.destination_id = d.id OR s.country = upper(split_part(d.slug, '-', 1))
        ORDER BY (s.destination_id = d.id) DESC NULLS LAST, s.code LIMIT 1`,
      [context.destination_id],
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
      transport: transport.rows,
      languages: languages.rows[0]?.languages ?? [],
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
    languages: rest.languages,
    transport: rest.transport.map((row) => ({
      startsAt: row.starts_at?.toISOString() ?? null,
      endsAt: row.ends_at?.toISOString() ?? null,
    })),
  };
}
