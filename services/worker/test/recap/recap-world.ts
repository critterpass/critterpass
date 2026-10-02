/**
 * A finished three-day Da Nang trip (2–4 Oct 2026, Asia/Ho_Chi_Minh) for the recap builder: four
 * travellers IN (Anna organises), Eli who dropped out, Finn who declined; a plan of seven stops
 * with a before-sunrise climb of the Marble Mountains; three logged rides (the crew's driver twice,
 * Grab once); five expenses in VND against a locked sweet spot, with two balances still open; a
 * critter set with finds, a missed epic and a legendary out of season; detected visits; an early
 * start; plan edits; and Anna's issued pass. Every number the recap shows follows from these rows.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';

import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export const NAMES = ['anna', 'ben', 'cora', 'dev', 'eli', 'finn'] as const;
export type Name = (typeof NAMES)[number];

const TO_POST_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
  'post_trip',
];

export const PLACES = {
  hotel: { name: 'Riverside Hotel', category: 'stay', lat: 16.0544, lng: 108.2022 },
  bridge: { name: 'Dragon Bridge', category: 'other', lat: 16.0612, lng: 108.227 },
  marble: { name: 'Marble Mountains', category: 'nature', lat: 16.0036, lng: 108.2626 },
  hoian: { name: 'Hoi An Old Town', category: 'market', lat: 15.8801, lng: 108.338 },
  bana: { name: 'Ba Na Hills', category: 'nature', lat: 15.9977, lng: 107.9886 },
} as const;
export type Place = keyof typeof PLACES;

/** The plan, in order: day, place, UTC start (local is UTC+7). */
const PLAN: readonly (readonly [number, Place, string])[] = [
  [1, 'hotel', '2026-10-02T07:00:00Z'],
  [1, 'bridge', '2026-10-02T14:00:00Z'],
  [2, 'marble', '2026-10-02T21:30:00Z'],
  [2, 'hotel', '2026-10-03T05:00:00Z'],
  [2, 'hoian', '2026-10-03T09:00:00Z'],
  [3, 'bana', '2026-10-04T01:00:00Z'],
  [3, 'bana', '2026-10-04T04:00:00Z'],
  [3, 'hotel', '2026-10-04T11:00:00Z'],
];

export interface RecapWorld {
  readonly harness: JobsHarness;
  readonly tripId: string;
  readonly crewId: string;
  readonly users: Readonly<Record<Name, string>>;
  readonly ids: Readonly<Record<string, string>>;
  q<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  addExpense(input: ExpenseInput): Promise<string>;
  stop(): Promise<void>;
}

export interface ExpenseInput {
  readonly by: Name;
  readonly minor: number;
  readonly category: string;
  readonly description: string;
  readonly localDate: string;
  readonly spentAt: string;
}

export async function startRecapWorld(): Promise<RecapWorld> {
  const harness = await startJobsHarness();
  const q = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> =>
    withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
  const one = async (sql: string, params: readonly unknown[] = []): Promise<string> =>
    ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;

  const users = {} as Record<Name, string>;
  for (const name of NAMES) {
    users[name] = randomUUID();
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      users[name],
      name,
    ]);
  }
  const { anna, ben, cora, dev, eli, finn } = users;

  const guide = await one(
    "INSERT INTO guides (slug, name, colour) VALUES ('recap-gecko', 'Gecko', 'orange') RETURNING id",
  );
  const destination = await one(
    `INSERT INTO destinations (slug, name, country, tz)
     VALUES ('recap-da-nang', 'Da Nang', 'VN', 'Asia/Ho_Chi_Minh') RETURNING id`,
  );
  const places = {} as Record<Place, string>;
  for (const [key, place] of Object.entries(PLACES) as [Place, (typeof PLACES)[Place]][]) {
    places[key] = await one(
      `INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [destination, place.name, place.category, place.lat, place.lng],
    );
  }

  const crewId = await one(
    "INSERT INTO crews (name, created_by, settlement_currency) VALUES ('Da Nang Six', $1, 'VND') RETURNING id",
    [anna],
  );
  const tripId = await one(
    `INSERT INTO trips (crew_id, status, destination_id, guide_id, tz, start_date, end_date)
     VALUES ($1, 'voting', $2, $3, 'Asia/Ho_Chi_Minh', '2026-10-02', '2026-10-04') RETURNING id`,
    [crewId, destination, guide],
  );
  const rsvp: Record<Name, string> = {
    anna: 'in',
    ben: 'in',
    cora: 'in',
    dev: 'in',
    eli: 'out',
    finn: 'out',
  };
  for (const name of NAMES) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      users[name],
      name === 'anna' ? 'organiser' : 'member',
    ]);
    await q(
      'INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, $4)',
      [tripId, users[name], name === 'anna' ? 'organiser' : 'member', rsvp[name]],
    );
  }
  await q('INSERT INTO trip_dropouts (trip_id, user_id) VALUES ($1, $2)', [tripId, eli]);

  // The plan: one current version, three days, eight items at five places.
  const versionId = await one(
    `INSERT INTO itinerary_versions (trip_id, visibility, status) VALUES ($1, 'crew', 'current')
     RETURNING id`,
    [tripId],
  );
  const days: string[] = [];
  for (const [index, date] of ['2026-10-02', '2026-10-03', '2026-10-04'].entries()) {
    days.push(
      await one(
        'INSERT INTO plan_days (version_id, trip_id, day_no, date) VALUES ($1, $2, $3, $4) RETURNING id',
        [versionId, tripId, index + 1, date],
      ),
    );
  }
  const items: { place: Place; id: string; stable: string }[] = [];
  for (const [day, place, startsAt] of PLAN) {
    const [row] = await q<{ id: string; stable_id: string }>(
      `INSERT INTO plan_items (version_id, day_id, trip_id, poi_id, starts_at, tz, category, status)
       VALUES ($1, $2, $3, $4, $5, 'Asia/Ho_Chi_Minh', $6, 'confirmed') RETURNING id, stable_id`,
      [versionId, days[day - 1], tripId, places[place], startsAt, PLACES[place].category],
    );
    items.push({ place, id: row!.id, stable: row!.stable_id });
  }
  await q('UPDATE trips SET current_version_id = $2 WHERE id = $1', [tripId, versionId]);
  const item = (place: Place) => items.find((entry) => entry.place === place)!;
  // Plan edits walk the change set machine: Anna's two applied, Ben's one rejected.
  for (const [author, path] of [
    [anna, ['proposed', 'approved', 'applied']],
    [anna, ['proposed', 'approved', 'applied']],
    [ben, ['proposed', 'rejected']],
  ] as const) {
    const changeSet = await one(
      `INSERT INTO change_sets (trip_id, base_version_id, trigger, scope, author_kind, author_id,
         status, ops)
       VALUES ($1, $2, 'manual', 'group', 'user', $3, 'draft', '[]') RETURNING id`,
      [tripId, versionId, author],
    );
    for (const status of path) {
      await q('UPDATE change_sets SET status = $2 WHERE id = $1', [changeSet, status]);
    }
  }

  // The early start for the Marble Mountains: leave at 04:00 local; Anna up, Dev gone, Ben asleep.
  const leaveBy = await one(
    `INSERT INTO leave_bys (trip_id, plan_item_id, plan_item_stable_id, local_date, starts_at,
       leave_at, tz, participant_ids)
     VALUES ($1, $2, $3, '2026-10-03', '2026-10-02T21:30:00Z', '2026-10-02T21:00:00Z',
       'Asia/Ho_Chi_Minh', ARRAY[$4, $5, $6]::uuid[]) RETURNING id`,
    [tripId, item('marble').id, item('marble').stable, anna, ben, dev],
  );
  for (const [uid, state] of [
    [anna, 'up'],
    [ben, 'not_up'],
    [dev, 'left'],
  ] as const) {
    await q(
      'INSERT INTO readiness (leave_by_id, trip_id, user_id, state) VALUES ($1, $2, $3, $4)',
      [leaveBy, tripId, uid, state],
    );
  }

  // Rides: the crew's driver to the Marble Mountains and to Ba Na Hills, Grab to Hoi An.
  const driver = await one(
    `INSERT INTO providers (trip_id, kind, name, added_by) VALUES ($1, 'driver', 'Anh Tuấn', $2)
     RETURNING id`,
    [tripId, ben],
  );
  for (const [place, provider, mode, providerId, by] of [
    ['marble', 'driver', 'guide_driver', driver, ben],
    ['hoian', 'grab', 'app_link', null, cora],
    ['bana', 'driver', 'guide_driver', driver, ben],
  ] as const) {
    await q(
      `INSERT INTO rides (trip_id, leg_ref, provider, mode, provider_id, attendee_ids, logged_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [tripId, item(place).stable, provider, mode, providerId, [anna, ben, cora, dev], by],
    );
  }

  const world: RecapWorld = {
    harness,
    tripId,
    crewId,
    users,
    ids: { destination, guide, versionId, driver, ...places },
    q,
    async addExpense(input) {
      return one(
        `INSERT INTO expenses (crew_id, trip_id, payer_id, amount_minor, currency,
           crew_amount_minor, crew_currency, split_mode, category, description, local_date,
           spent_at, created_by)
         VALUES ($1, $2, $3, $4, 'VND', $4, 'VND', 'equal', $5, $6, $7, $8, $3) RETURNING id`,
        [
          crewId,
          tripId,
          users[input.by],
          input.minor,
          input.category,
          input.description,
          input.localDate,
          input.spentAt,
        ],
      );
    },
    async stop() {
      await harness.stopAll();
      await harness.close();
    },
  };

  // Money: five expenses, two open balances, a sweet spot of 1,500,000 VND each.
  const stays = await world.addExpense({
    by: 'anna',
    minor: 3_000_000,
    category: 'stays',
    description: 'Riverside Hotel',
    localDate: '2026-10-02',
    spentAt: '2026-10-02T08:00:00Z',
  });
  await world.addExpense({
    by: 'ben',
    minor: 400_000,
    category: 'food',
    description: 'Bánh mì',
    localDate: '2026-10-02',
    spentAt: '2026-10-02T12:00:00Z',
  });
  const dinner = await world.addExpense({
    by: 'ben',
    minor: 600_000,
    category: 'food',
    description: 'Seafood dinner',
    localDate: '2026-10-03',
    spentAt: '2026-10-03T12:00:00Z',
  });
  await world.addExpense({
    by: 'ben',
    minor: 500_000,
    category: 'transit',
    description: 'Driver to the Marble Mountains',
    localDate: '2026-10-03',
    spentAt: '2026-10-03T00:00:00Z',
  });
  await world.addExpense({
    by: 'cora',
    minor: 1_200_000,
    category: 'fun',
    description: 'Ba Na Hills tickets',
    localDate: '2026-10-04',
    spentAt: '2026-10-04T02:00:00Z',
  });
  for (const [debtor, creditor, minor, source] of [
    [cora, anna, 300_000, stays],
    [dev, ben, 200_000, dinner],
  ] as const) {
    await q(
      `INSERT INTO ledger_entries (crew_id, trip_id, debtor_id, creditor_id, amount_minor, currency,
         source_kind, source_id)
       VALUES ($1, $2, $3, $4, $5, 'VND', 'expense', $6)`,
      [crewId, tripId, debtor, creditor, minor, source],
    );
  }
  await q(
    "INSERT INTO budget_plans (trip_id, target_minor, currency) VALUES ($1, 1500000, 'VND')",
    [tripId],
  );

  // Critters: a common and a rare found, an epic seen twice and missed, a legendary out of season.
  const release = await one(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('forms', 1, 'recap-test', 'Test', 'published', 'publish', repeat('0', 64), '{}', 0, $1,
       now(), now())
     RETURNING id`,
    [anna],
  );
  const set = await one(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       hero_critter_key, month_hints, destination_id, release_id)
     VALUES ('rdn', 'Da Nang', 'VN', 1, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'cp-801', '[]',
       $1, $2)
     RETURNING id`,
    [destination, release],
  );
  const forms: Record<string, string> = {};
  const critters: Record<string, string> = {};
  for (const [no, rarity] of [
    [801, 'common'],
    [802, 'rare'],
    [803, 'epic'],
    [804, 'legendary'],
  ] as const) {
    critters[no] = await one(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note,
         release_id)
       VALUES ($1, $2, $3, 'Da Nang', 'Gecko', '{}', 7, 'Test.', $4) RETURNING id`,
      [`cp-${no}`, set, no, release],
    );
    forms[no] = await one(
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp,
         release_id)
       VALUES ($1, $2, $3, '{}', 'none', 'Test.', 'Be there', 25, $4) RETURNING id`,
      [`cp-${no}:${rarity}`, critters[no], rarity, release],
    );
  }
  const window = await one(
    `INSERT INTO legendary_windows (key, form_id, place_line, rule, months, source_url, release_id)
     VALUES ('rdn-fireworks', $1, 'Da Nang · Fireworks',
       '{"type":"annual_range","start":"06-01","end":"06-02"}', '{6}', 'https://example.org', $2)
     RETURNING id`,
    [forms[804], release],
  );
  const rule = (key: string, form: string, kind: string, place: Place, windowId: string | null) =>
    one(
      `INSERT INTO spawn_rules (key, form_id, kind, set_id, destination_id, poi_ids, dwell_s,
         window_id, copy, release_id)
       VALUES ($1, $2, $3, $4, $5, ARRAY[$6::uuid], 300, $7, 'Here', $8) RETURNING id`,
      [key, form, kind, set, destination, places[place], windowId, release],
    );
  await rule('cp-802:rare#1', forms[802]!, 'presence', 'bridge', null);
  const epicRule = await rule('cp-803:epic#1', forms[803]!, 'presence', 'hoian', null);
  await rule('cp-804:legendary#1', forms[804]!, 'window', 'marble', window);
  for (const [uid, form, critter, at, source] of [
    [anna, forms[801], critters[801], '2026-10-02T05:00:00Z', 'hatch'],
    [ben, forms[802], critters[802], '2026-10-03T03:00:00Z', 'grant'],
    [cora, forms[801], critters[801], '2026-10-03T04:00:00Z', 'grant'],
  ] as const) {
    await q(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, trip_id, source,
         verification)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
      [uid, form, critter, at, tripId, source],
    );
  }
  for (const [uid, state, at] of [
    [dev, 'wandered_off', '2026-10-03T08:00:00Z'],
    [cora, 'abandoned', '2026-10-03T08:30:00Z'],
  ] as const) {
    await q(
      `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, poi_id, state, dwell_s,
         started_at, resolved_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 120, $8::timestamptz - interval '5 minutes', $8)`,
      [randomUUID(), uid, tripId, epicRule, forms[803], places.hoian, state, at],
    );
  }

  // Detected visits: Dev at Hoi An twice and the Marble Mountains, Cora at the Marble Mountains.
  for (const [uid, place, at] of [
    [dev, 'hoian', '2026-10-03T09:30:00Z'],
    [dev, 'hoian', '2026-10-03T11:00:00Z'],
    [dev, 'marble', '2026-10-02T21:50:00Z'],
    [cora, 'marble', '2026-10-02T22:00:00Z'],
  ] as const) {
    await q(
      `INSERT INTO visits (id, user_id, trip_id, poi_id, source, arrived_at)
       VALUES ($1, $2, $3, $4, 'geofence', $5)`,
      [randomUUID(), uid, tripId, places[place], at],
    );
  }

  // Anna's issued pass, home stamp No. 1.
  const pass = await one(
    `INSERT INTO passes (user_id, status, number, issued_at)
     VALUES ($1, 'issued', app.format_pass_number(nextval('pass_number_seq')), now()) RETURNING id`,
    [anna],
  );
  await q(
    `INSERT INTO stamps (pass_id, user_id, kind, seq_no, iata, country, stamped_at)
     VALUES ($1, $2, 'home', 1, 'SGN', 'VN', now())`,
    [pass, anna],
  );

  for (const status of TO_POST_TRIP) {
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);
  }
  void finn;
  return {
    ...world,
    ids: {
      ...world.ids,
      ...Object.fromEntries(Object.entries(forms).map(([no, id]) => [`form_${no}`, id])),
      ...Object.fromEntries(Object.entries(critters).map(([no, id]) => [`critter_${no}`, id])),
      stays,
    },
  };
}
