/**
 * A small Critterdex as sync writes it into a phone's local database, for the critter screen
 * tests: two sets (Vietnam, the home set, and Indonesia with Bali's Tokek as its hero), their
 * forms, my own finds (one verified Chép with its name, one pending Tokek with none), Maya's
 * crew count, and the Bali trip with my egg.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values and SQL. */
import { tokens } from '@cp/design-tokens';
import { toLocalWallTime } from '@cp/domain';
import type { AbstractPowerSyncDatabase } from '@powersync/common';

import { OWNER_UID_KEY } from '@/data/powersync/local-tables';

export const CRITTER_TZ = 'Asia/Makassar';
export const CREW = '0192f000-0000-7000-8000-00000000c2e1';
export const MAYA = '0192f000-0000-7000-8000-0000000000b2';
export const TRIP = '0192f000-0000-7000-8000-00000000f201';
export const DEST = '0192f000-0000-7000-8000-00000000d201';
export const GUIDE = '0192f000-0000-7000-8000-00000000e201';
export const EGG = '0192f000-0000-7000-8000-00000000e9e1';
export const SET_VN = '0192f000-0000-7000-8000-0000000051a1';
export const SET_ID = '0192f000-0000-7000-8000-0000000051b1';
export const RUA = '0192f000-0000-7000-8000-0000000c0001';
export const CHEP = '0192f000-0000-7000-8000-0000000c0002';
export const MAO = '0192f000-0000-7000-8000-0000000c0003';
export const TOKEK = '0192f000-0000-7000-8000-0000000c0010';
export const PAPAYA = '0192f000-0000-7000-8000-0000000c0011';
export const TOKEK_COMMON = '0192f000-0000-7000-8000-0000000f0010';
export const TOKEK_RARE = '0192f000-0000-7000-8000-0000000f0011';
export const TOKEK_EPIC = '0192f000-0000-7000-8000-0000000f0012';
export const TOKEK_LEGENDARY = '0192f000-0000-7000-8000-0000000f0013';
export const CHEP_COMMON = '0192f000-0000-7000-8000-0000000f0002';
export const WINDOW = '0192f000-0000-7000-8000-0000000a0001';
export const COPRESENCE_RULE = '0192f000-0000-7000-8000-0000000a5c01';

const PALETTE = JSON.stringify({
  f: [tokens.tier.common.color, tokens.tier.rare.color, tokens.tier.epic.color],
});

export function isoDate(offsetDays: number, tz = CRITTER_TZ): string {
  const today = toLocalWallTime(new Date(), tz).date;
  return new Date(Date.parse(`${today}T00:00:00Z`) + offsetDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export interface CritterSeedOptions {
  /** The Bali trip's state: under way (default) or a week out. */
  readonly tripStatus?: 'pre_trip' | 'in_trip';
  /** My egg: whole (default), hatched, or none at all. */
  readonly egg?: 'whole' | 'hatched' | 'none';
  /** Maya hides her collection: no counts row. */
  readonly mayaHidden?: boolean;
  /** No finds at all (a fresh account). */
  readonly fresh?: boolean;
  /** Tokek's common and rare forms verified (instead of the pending rare). */
  readonly tokekFound?: boolean;
}

export async function seedCritters(
  db: AbstractPowerSyncDatabase,
  me: string,
  options: CritterSeedOptions = {},
): Promise<void> {
  const status = options.tripStatus ?? 'in_trip';
  const x = (sql: string, params: unknown[] = []) => db.execute(sql, params);
  await x('INSERT OR REPLACE INTO local_state (id, value) VALUES (?, ?)', [OWNER_UID_KEY, me]);
  await x("INSERT INTO users (id, display_name, home_country) VALUES (?, 'Winston', 'VN')", [me]);
  await x("INSERT INTO users (id, display_name) VALUES (?, 'Maya')", [MAYA]);
  await x('INSERT INTO user_settings (id, user_id, active_crew_id) VALUES (?, ?, ?)', [
    `us-${me}`,
    me,
    CREW,
  ]);
  await x("INSERT INTO crews (id, name) VALUES (?, 'The Bali Six')", [CREW]);
  await x(
    `INSERT INTO critter_sets (id, code, name, country, rank, hero_critter_key, guide_slug)
     VALUES (?, 'vn', 'Vietnam', 'VN', 12, 'cp-091', NULL),
            (?, 'id', 'Indonesia', 'ID', 1, 'cp-112', 'tokek')`,
    [SET_VN, SET_ID],
  );
  await x(
    `INSERT INTO critters (id, key, set_id, no, city, canonical_seed) VALUES
       (?, 'cp-091', ?, 91, 'Hà Nội', 91), (?, 'cp-092', ?, 92, 'Hội An', 92),
       (?, 'cp-093', ?, 93, 'Sài Gòn', 93), (?, 'cp-112', ?, 112, 'Bali', 7),
       (?, 'cp-113', ?, 113, 'Ubud', 113)`,
    [RUA, SET_VN, CHEP, SET_VN, MAO, SET_VN, TOKEK, SET_ID, PAPAYA, SET_ID],
  );
  await x(
    `INSERT INTO critter_forms (id, critter_id, rarity, palette, edge, requirement_copy, xp) VALUES
       (?, ?, 'common', ?, 'none', 'Be in Bali', 50),
       (?, ?, 'rare', ?, 'none', 'Three water temples', 150),
       (?, ?, 'epic', ?, 'epic', 'Batur by sunrise', 300),
       (?, ?, 'legendary', ?, 'legendary', 'All six at the top', 1000),
       (?, ?, 'common', ?, 'none', 'Be in Hội An', 50)`,
    [
      TOKEK_COMMON,
      TOKEK,
      PALETTE,
      TOKEK_RARE,
      TOKEK,
      PALETTE,
      TOKEK_EPIC,
      TOKEK,
      PALETTE,
      TOKEK_LEGENDARY,
      TOKEK,
      PALETTE,
      CHEP_COMMON,
      CHEP,
      PALETTE,
    ],
  );
  await x(
    `INSERT INTO legendary_windows (id, key, form_id, place_line, rule)
     VALUES (?, 'golden-tokek', ?, 'Bali · all six on Batur by sunrise', ?)`,
    [
      WINDOW,
      TOKEK_LEGENDARY,
      JSON.stringify({
        type: 'annual_range',
        start: isoDate(1).slice(5),
        end: isoDate(3).slice(5),
      }),
    ],
  );
  await x(
    `INSERT INTO spawn_rules (id, key, form_id, kind, set_id, destination_id, poi_ids, geofences,
       dwell_s, window_id, min_members, foreground_only, copy)
     VALUES (?, 'golden-tokek', ?, 'co_presence', ?, ?, '[]', '[]', 600, ?, 6, 0, 'All six on Batur')`,
    [COPRESENCE_RULE, TOKEK_LEGENDARY, SET_ID, DEST, WINDOW],
  );
  if (options.fresh !== true) {
    await x(
      `INSERT INTO collection_entries (id, user_id, form_id, critter_id, verification, critter_name,
         form_name, found_at, source)
       VALUES ('ce-chep', ?, ?, ?, 'verified', 'Chép', 'Chép', '2026-09-20T03:42:00Z', 'encounter'),
              ('ce-tokek', ?, ?, ?, 'pending', NULL, NULL, '2026-09-30T03:42:00Z', 'encounter')`,
      [me, CHEP_COMMON, CHEP, me, TOKEK_RARE, TOKEK],
    );
  }
  if (options.tokekFound === true) {
    await x(
      "UPDATE collection_entries SET verification = 'verified', critter_name = 'Tokek', form_name = 'Temple Tokek' WHERE id = 'ce-tokek'",
    );
    await x(
      `INSERT INTO collection_entries (id, user_id, form_id, critter_id, verification, critter_name,
         form_name, found_at, source)
       VALUES ('ce-tokek-c', ?, ?, ?, 'verified', 'Tokek', 'Tokek', '2026-09-29T03:42:00Z', 'hatch')`,
      [me, TOKEK_COMMON, TOKEK],
    );
  }
  if (options.mayaHidden !== true) {
    await x(
      `INSERT INTO crew_collection_counts (id, crew_id, user_id, critters, forms)
       VALUES ('cc-maya', ?, ?, 14, 19)`,
      [CREW, MAYA],
    );
  }
  await x("INSERT INTO guides (id, slug, name) VALUES (?, 'tokek', 'Tokek')", [GUIDE]);
  await x(
    `INSERT INTO destinations (id, slug, name, country, tz, critter_set_id)
     VALUES (?, 'bali', 'Bali', 'ID', ?, ?)`,
    [DEST, CRITTER_TZ, SET_ID],
  );
  await x(
    `INSERT INTO trips (id, crew_id, status, destination_id, guide_id, start_date, end_date, tz)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      TRIP,
      CREW,
      status,
      DEST,
      GUIDE,
      isoDate(status === 'in_trip' ? 0 : 7),
      isoDate(status === 'in_trip' ? 7 : 14),
      CRITTER_TZ,
    ],
  );
  await x("INSERT INTO trip_participants (id, trip_id, user_id, rsvp) VALUES (?, ?, ?, 'in')", [
    `tp-${me}`,
    TRIP,
    me,
  ]);
  const egg = options.egg ?? 'whole';
  if (egg !== 'none') {
    await x(
      `INSERT INTO eggs (id, user_id, trip_id, form_id, granted_at, hatched_at, trigger)
       VALUES (?, ?, ?, ?, '2026-09-30T00:00:00Z', ?, ?)`,
      [
        EGG,
        me,
        TRIP,
        TOKEK_COMMON,
        egg === 'hatched' ? '2026-10-01T05:50:00Z' : null,
        egg === 'hatched' ? 'landed' : null,
      ],
    );
  }
}
