/**
 * The Help hub's reads (docs/api-contracts.md §5.5 `/v1/help/context`): the trip's country numbers,
 * its destination's facilities ranked by drive time from where the traveller is, the phrase cards
 * for the destination's language, a place label and the caller's own open Help share. Everything
 * comes from curated, verified catalogue rows; a country with none is "limited coverage".
 */
import {
  buildChecklist,
  emergencyNumbersFor,
  HELP_PHRASE_SLUGS,
  phraseKeysFor,
  phraseLanguageFor,
  PROBLEM_FACILITY_KIND,
  rankFacilities,
  type ChecklistStep,
  type EmergencyLine,
  type HelpContext,
  type HelpFacility,
  type HelpPhrase,
  type HelpProblem,
} from '@cp/domain';
import type pg from 'pg';

import type { RoutingProvider } from '../../routing/provider';

const PLACE_RADIUS_M = 150;
const CITY_RADIUS_M = 25_000;
const MAX_FACILITIES = 12;

export interface HelpTrip {
  readonly id: string;
  readonly country: string | null;
  readonly destination_id: string | null;
  readonly guide: string | null;
}

export async function loadHelpTrip(tx: pg.PoolClient, tripId: string): Promise<HelpTrip> {
  const { rows } = await tx.query<HelpTrip>(
    `SELECT t.id, d.country, t.destination_id, g.slug AS guide
       FROM trips t
       LEFT JOIN destinations d ON d.id = t.destination_id
       LEFT JOIN guides g ON g.id = t.guide_id
      WHERE t.id = $1`,
    [tripId],
  );
  return rows[0] ?? { id: tripId, country: null, destination_id: null, guide: null };
}

export interface Position {
  readonly lat: number;
  readonly lng: number;
}

async function placeLabel(tx: pg.PoolClient, at: Position | null): Promise<string | null> {
  if (at === null) return null;
  const point = 'ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography';
  const poi = await tx.query<{ name: string }>(
    `SELECT name FROM pois WHERE status = 'active' AND ST_DWithin(location, ${point}, $3)
      ORDER BY location <-> ${point} LIMIT 1`,
    [at.lng, at.lat, PLACE_RADIUS_M],
  );
  const city = await tx.query<{ name: string }>(
    `SELECT name FROM cities WHERE ST_DWithin(location, ${point}, $3)
      ORDER BY location <-> ${point} LIMIT 1`,
    [at.lng, at.lat, CITY_RADIUS_M],
  );
  const parts = [poi.rows[0]?.name, city.rows[0]?.name].filter(
    (part): part is string => part !== undefined,
  );
  return parts.length === 0 ? null : parts.join(', ');
}

interface FacilityRow {
  id: string;
  kind: HelpFacility['kind'];
  name: string;
  address: string;
  phone: string | null;
  lat: number;
  lng: number;
  open_24h: boolean | null;
  verified_at: Date;
}

async function facilities(
  tx: pg.PoolClient,
  trip: HelpTrip,
  at: Position | null,
  routing: RoutingProvider,
): Promise<HelpFacility[]> {
  if (trip.destination_id === null) return [];
  const { rows } = await tx.query<FacilityRow>(
    `SELECT id, kind, name, address, phone, lat, lng, open_24h, verified_at
       FROM facilities WHERE destination_id = $1
      ORDER BY CASE WHEN $2::float8 IS NULL THEN 0
                    ELSE (lat - $2::float8) ^ 2 + (lng - $3::float8) ^ 2 END, name
      LIMIT ${MAX_FACILITIES}`,
    [trip.destination_id, at?.lat ?? null, at?.lng ?? null],
  );
  let minutes: readonly (number | null)[] = rows.map(() => null);
  let distances: readonly (number | null)[] = rows.map(() => null);
  let estimate = false;
  if (at !== null && rows.length > 0) {
    const matrix = await routing.matrix({ origins: [at], destinations: rows, mode: 'auto' });
    minutes = matrix.minutes[0] ?? minutes;
    distances = matrix.distanceM[0] ?? distances;
    estimate = matrix.estimate;
  }
  return rankFacilities(
    rows.map((row, index) => ({
      id: row.id,
      kind: row.kind,
      name: row.name,
      address: row.address,
      phone: row.phone,
      lat: row.lat,
      lng: row.lng,
      minutes: minutes[index] ?? null,
      distance_m:
        distances[index] === null || distances[index] === undefined
          ? null
          : Math.round(distances[index]),
      estimate,
      open_now: row.open_24h === true ? true : null,
      insurance_match: false,
      verified_at: row.verified_at.toISOString(),
    })),
  );
}

async function phrases(
  tx: pg.PoolClient,
  country: string | null,
  slugs: readonly string[],
): Promise<HelpPhrase[]> {
  const keys = phraseKeysFor(phraseLanguageFor(country), slugs);
  if (keys.length === 0) return [];
  const { rows } = await tx.query<HelpPhrase>(
    `SELECT key, context, language, text, romanisation, gloss, audio_key
       FROM phrase_cards WHERE key = ANY ($1::text[])
      ORDER BY array_position($1::text[], key)`,
    [keys],
  );
  return rows;
}

export async function readHelpContext(
  tx: pg.PoolClient,
  input: { readonly trip: HelpTrip; readonly uid: string; readonly at: Position | null },
  routing: RoutingProvider,
): Promise<HelpContext> {
  const { trip } = input;
  const numbers = await tx.query<{
    numbers: EmergencyLine[];
    verified_at: Date;
    source_url: string;
  }>('SELECT numbers, verified_at, source_url FROM emergency_numbers WHERE country = $1', [
    trip.country,
  ]);
  const row = numbers.rows[0];
  const lines = emergencyNumbersFor(row?.numbers ?? null);
  const share = await tx.query<{ share_id: string; ends_at: Date }>(
    `SELECT id AS share_id, ends_at FROM location_shares
      WHERE trip_id = $1 AND user_id = $2 AND reason = 'help' AND ends_at > now()
      ORDER BY starts_at DESC LIMIT 1`,
    [trip.id, input.uid],
  );
  const active = share.rows[0];
  return {
    trip_id: trip.id,
    country: trip.country,
    coverage: row === undefined ? 'limited' : 'full',
    place_label: await placeLabel(tx, input.at),
    numbers: {
      general: lines.general,
      lines: [...lines.lines],
      verified_at: row?.verified_at.toISOString() ?? null,
      source_url: row?.source_url ?? null,
    },
    facilities: await facilities(tx, trip, input.at, routing),
    phrases: await phrases(tx, trip.country, HELP_PHRASE_SLUGS.hub),
    active_share:
      active === undefined
        ? null
        : { share_id: active.share_id, ends_at: active.ends_at.toISOString() },
  };
}

/** The curated steps for one problem, facts filled from the Help context. */
export async function readChecklistSteps(
  tx: pg.PoolClient,
  problem: HelpProblem,
  context: HelpContext,
): Promise<ChecklistStep[]> {
  const lead = PROBLEM_FACILITY_KIND[problem];
  const facility =
    lead === 'medical'
      ? context.facilities.find((f) => f.kind === 'clinic' || f.kind === 'hospital')
      : undefined;
  const embassy =
    lead === 'embassy' ? context.facilities.find((f) => f.kind === 'embassy') : undefined;
  const police = context.numbers.lines.find(
    (line) => line.service === 'police' || line.service === 'tourist_police',
  );
  const [phrase] = await phrases(tx, context.country, HELP_PHRASE_SLUGS[problem]);
  return buildChecklist(problem, {
    general: context.numbers.general,
    police: police?.number ?? null,
    facility:
      facility === undefined
        ? null
        : { id: facility.id, name: facility.name, minutes: facility.minutes },
    embassy:
      embassy === undefined ? null : { id: embassy.id, name: embassy.name, phone: embassy.phone },
    phrase:
      phrase === undefined ? null : { key: phrase.key, text: phrase.text, gloss: phrase.gloss },
  });
}
