/**
 * The local rows every critter screen reads: the name-free catalogue (`catalog` stream), the
 * viewer's own finds, eggs and guide skins (`me`), crew counts (`crew_people`), the trip's spawn
 * rules (`trip_pack`) and legendary windows. Names only ever come from the viewer's own verified
 * `collection_entries`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import type { Rarity } from '@cp/domain';

export const SETS_SQL = `SELECT id, code, name, country, rank, set_group, destination_id,
    hero_critter_key, guide_slug
  FROM critter_sets ORDER BY rank, country`;
export const SETS_TABLES = ['critter_sets'];

export interface SetRow {
  readonly id: string;
  readonly code: string | null;
  readonly name: string;
  readonly country: string;
  readonly rank: number | null;
  readonly set_group: number | null;
  readonly destination_id: string | null;
  readonly hero_critter_key: string | null;
  readonly guide_slug: string | null;
}

export const CRITTERS_SQL = `SELECT id, key, set_id, no, city, canonical_seed FROM critters
  ORDER BY no`;
export const CRITTERS_TABLES = ['critters'];

export interface CritterRow {
  readonly id: string;
  readonly key: string;
  readonly set_id: string;
  readonly no: number;
  readonly city: string | null;
  readonly canonical_seed: number | null;
}

export const FORMS_SQL = `SELECT id, key, critter_id, rarity, palette, pose, edge, requirement_copy,
    xp
  FROM critter_forms`;
export const FORMS_TABLES = ['critter_forms'];

export interface FormRow {
  readonly id: string;
  readonly key: string | null;
  readonly critter_id: string;
  readonly rarity: Rarity;
  /** JSON (`Palette`). */
  readonly palette: string | null;
  readonly pose: string | null;
  readonly edge: string | null;
  readonly requirement_copy: string | null;
  readonly xp: number | null;
}

export const ENTRIES_SQL = `SELECT e.id, e.form_id, e.critter_id, e.verification, e.critter_name,
    e.form_name, e.found_at, e.poi_id, e.trip_id, e.source, e.encounter_id, p.name AS poi_name
  FROM collection_entries e LEFT JOIN pois p ON p.id = e.poi_id
  WHERE e.user_id = ? ORDER BY e.found_at`;
export const ENTRIES_TABLES = ['collection_entries', 'pois'];

export interface EntryRow {
  readonly id: string;
  readonly form_id: string;
  readonly critter_id: string;
  readonly verification: 'pending' | 'verified' | 'revoked';
  readonly critter_name: string | null;
  readonly form_name: string | null;
  readonly found_at: string | null;
  readonly poi_id: string | null;
  readonly trip_id: string | null;
  readonly source: string | null;
  readonly encounter_id: string | null;
  readonly poi_name: string | null;
}

export const WINDOWS_SQL = `SELECT id, key, form_id, place_line, rule, months, solar, challenge
  FROM legendary_windows`;
export const WINDOWS_TABLES = ['legendary_windows'];

export interface WindowRow {
  readonly id: string;
  readonly key: string | null;
  readonly form_id: string;
  readonly place_line: string | null;
  /** JSON (`WindowRule`). */
  readonly rule: string | null;
  /** JSON array of month numbers. */
  readonly months: string | null;
  readonly solar: string | null;
  readonly challenge: string | null;
}

/** Me, my home country and my Explore at home setting. */
export const ME_SQL = `SELECT u.id, u.display_name, u.home_country, s.explore_at_home,
    s.hide_collection, s.active_crew_id
  FROM users u LEFT JOIN user_settings s ON s.user_id = u.id WHERE u.id = ?`;
export const ME_TABLES = ['users', 'user_settings'];

export interface MeRow {
  readonly id: string;
  readonly display_name: string | null;
  readonly home_country: string | null;
  readonly explore_at_home: number | null;
  readonly hide_collection: number | null;
  readonly active_crew_id: string | null;
}

/**
 * My trips that are travelling or about to, newest start first, with the destination's set and
 * my egg. Trips I dropped out of are left out (no egg for an RSVP out).
 */
export const TRIPS_SQL = `SELECT t.id, t.crew_id, t.status, t.start_date, t.end_date,
    coalesce(t.tz, d.tz) AS tz, t.destination_id, d.name AS destination_name, d.country AS destination_country,
    d.colour, d.geofence AS destination_geofence, cs.country AS set_country,
    d.critter_set_id, g.slug AS guide_slug, g.name AS guide_name, g.id AS guide_id,
    p.landed_at, p.rsvp, eg.id AS egg_id, eg.form_id AS egg_form_id,
    eg.hatched_at AS egg_hatched_at, eg.trigger AS egg_trigger
  FROM trips t
  JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = ?
  LEFT JOIN destinations d ON d.id = t.destination_id
  LEFT JOIN critter_sets cs ON cs.id = d.critter_set_id
  LEFT JOIN guides g ON g.id = t.guide_id
  LEFT JOIN eggs eg ON eg.trip_id = t.id AND eg.user_id = p.user_id
  WHERE t.status IN ('pre_trip', 'in_trip') AND coalesce(p.rsvp, 'in') <> 'out'
  ORDER BY t.status = 'in_trip' DESC, t.start_date`;
export const TRIPS_TABLES = [
  'trips',
  'trip_participants',
  'destinations',
  'critter_sets',
  'guides',
  'eggs',
];

export interface TripRow {
  readonly id: string;
  readonly crew_id: string;
  readonly status: 'pre_trip' | 'in_trip';
  readonly start_date: string | null;
  readonly end_date: string | null;
  readonly tz: string | null;
  readonly destination_id: string | null;
  readonly destination_name: string | null;
  /** The destination's country as its row spells it (a name, "Vietnam"), for display only. */
  readonly destination_country: string | null;
  /** The destination's area (a PostGIS geography as synced), for the arrival check. */
  readonly destination_geofence?: string | null;
  /** The destination set's ISO country code ("VN"). */
  readonly set_country?: string | null;
  readonly colour: string | null;
  readonly critter_set_id: string | null;
  readonly guide_slug: string | null;
  readonly guide_name: string | null;
  readonly guide_id: string | null;
  readonly landed_at: string | null;
  readonly rsvp: string | null;
  readonly egg_id: string | null;
  readonly egg_form_id: string | null;
  readonly egg_hatched_at: string | null;
  readonly egg_trigger: string | null;
}

/** Crewmates' counts in my active crew (members hiding their collection have no row). */
export const CREW_COUNTS_SQL = `SELECT c.user_id, c.critters, c.forms, u.display_name
  FROM crew_collection_counts c LEFT JOIN users u ON u.id = c.user_id
  WHERE c.crew_id = ? AND c.user_id <> ? ORDER BY c.critters DESC, u.display_name`;
export const CREW_COUNTS_TABLES = ['crew_collection_counts', 'users'];

export interface CrewCountRow {
  readonly user_id: string;
  readonly critters: number;
  readonly forms: number;
  readonly display_name: string | null;
}

export const SKINS_SQL = `SELECT guide_id, form_id FROM guide_skins WHERE user_id = ?`;
export const SKINS_TABLES = ['guide_skins'];

export interface SkinRow {
  readonly guide_id: string;
  readonly form_id: string | null;
}

/** JSON column → value, or `fallback` when missing or unreadable. */
export function parseJson<T>(text: string | null | undefined, fallback: T): T {
  if (text === null || text === undefined || text === '') return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
