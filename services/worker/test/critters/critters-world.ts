/**
 * A migrated Postgres with a published critter set for Da Nang (a presence spawn at the Dragon
 * Bridge, one at Hanoi, a co-presence spawn at the Marble Mountains, a dated legendary window), a
 * crew of `size` travellers on a trip under way whose eggs have hatched, and a pg-boss producer
 * with the critter queues. `befriended()` writes what `befriend_critter` leaves behind.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { CRITTER_QUEUES, type AttestationClaim, type EvidenceBundle } from '@cp/domain';
import type { PgBoss } from 'pg-boss';

import { startJobsHarness, type JobsHarness } from '../helpers/jobs-harness';

export interface CritterWorld {
  readonly harness: JobsHarness;
  readonly boss: PgBoss;
  readonly members: readonly string[];
  readonly crewId: string;
  readonly tripId: string;
  readonly ids: Readonly<Record<string, string>>;
  q<T>(sql: string, params?: readonly unknown[]): Promise<T[]>;
  befriended(input: BefriendedInput): Promise<string>;
  jobs(queue: string): Promise<Record<string, unknown>[]>;
  stop(): Promise<void>;
}

export interface BefriendedInput {
  readonly uid: string;
  readonly rule: 'bridge' | 'hanoi' | 'marble';
  readonly at: Date;
  readonly dwellS?: number;
  readonly evidence?: Partial<EvidenceBundle>;
  readonly attestation?: AttestationClaim;
}

export const cleanEvidence = (at: Date): EvidenceBundle => ({
  samples_hash: 'c'.repeat(64),
  dwell: { count: 40, mean_accuracy_m: 10, max_speed_mps: 1, duration_s: 320, inside_s: 305 },
  mock_flags: 0,
  device_ts: at.toISOString(),
});

const TO_IN_TRIP = [
  'won',
  'setup',
  'drafting',
  'draft_review',
  'proposed',
  'confirmed',
  'pre_trip',
  'in_trip',
];

export async function startCritterWorld(size: number): Promise<CritterWorld> {
  const harness = await startJobsHarness();
  const boss = await harness.startRuntime([]);
  for (const queue of Object.values(CRITTER_QUEUES)) {
    if ((await boss.getQueue(queue)) === null)
      await boss.createQueue(queue, { policy: 'exclusive' });
  }
  const q = async <T>(sql: string, params: readonly unknown[] = []): Promise<T[]> =>
    withSystem(harness.pool, async (tx) => (await tx.query(sql, [...params])).rows as T[]);
  const one = async (sql: string, params: readonly unknown[]): Promise<string> =>
    ((await q<{ id: string }>(sql, params))[0] as { id: string }).id;

  const members = Array.from({ length: size }, () => randomUUID());
  for (const [i, uid] of members.entries()) {
    await q("INSERT INTO users (id, status, display_name) VALUES ($1, 'registered', $2)", [
      uid,
      `Member${i} X`,
    ]);
  }
  const [lead] = members as [string];
  const release = await one(
    `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum, artifact,
       item_count, approved_by, approved_at, published_at)
     VALUES ('forms', 1, 'worker-test', 'Test', 'published', 'publish', repeat('0', 64), '{}', 0, $1, now(), now())
     RETURNING id`,
    [lead],
  );
  const destination = await one(
    "INSERT INTO destinations (slug, name, country, tz) VALUES ('da-nang', 'Da Nang', 'VN', 'Asia/Ho_Chi_Minh') RETURNING id",
    [],
  );
  const set = await one(
    `INSERT INTO critter_sets (code, name, country, set_group, tz, currency, languages, coverage,
       hero_critter_key, month_hints, destination_id, release_id)
     VALUES ('dn', 'Da Nang', 'VN', 1, 'Asia/Ho_Chi_Minh', 'VND', '{vi}', 'live', 'cp-801', '[]', $1, $2)
     RETURNING id`,
    [destination, release],
  );
  await q('UPDATE destinations SET critter_set_id = $2 WHERE id = $1', [destination, set]);
  const forms: Record<string, string> = {};
  const critters: Record<string, string> = {};
  for (const [no, rarity] of [
    [801, 'common'],
    [802, 'rare'],
    [803, 'epic'],
    [804, 'legendary'],
  ] as const) {
    critters[no] = await one(
      `INSERT INTO critters (key, set_id, no, city, species, art_params, canonical_seed, note, release_id)
       VALUES ($1, $2, $3, 'Da Nang', 'Gecko', '{}', 7, 'Test.', $4) RETURNING id`,
      [`cp-${no}`, set, no, release],
    );
    forms[rarity] = await one(
      `INSERT INTO critter_forms (key, critter_id, rarity, palette, edge, note, requirement_copy, xp, release_id)
       VALUES ($1, $2, $3, '{}', 'none', 'Test.', 'Be there', 25, $4) RETURNING id`,
      [`cp-${no}:${rarity}`, critters[no], rarity, release],
    );
    await q(
      "INSERT INTO critter_names (critter_id, locale, name, release_id) VALUES ($1, 'en', $2, $3)",
      [critters[no], `Critter${no}`, release],
    );
  }
  const poi = async (name: string, lat: number, lng: number) =>
    one(
      "INSERT INTO pois (destination_id, name, category, lat, lng) VALUES ($1, $2, 'other', $3, $4) RETURNING id",
      [destination, name, lat, lng],
    );
  const bridge = await poi('Dragon Bridge', 16.0612, 108.227);
  const hanoi = await poi('Hanoi Old Quarter', 21.0285, 105.8542);
  const marble = await poi('Marble Mountains', 16.0036, 108.2626);
  const rule = async (key: string, form: string, kind: string, place: string, min: number | null) =>
    one(
      `INSERT INTO spawn_rules (key, form_id, kind, set_id, destination_id, poi_ids, dwell_s, min_members, copy, release_id)
       VALUES ($1, $2, $3, $4, $5, ARRAY[$6::uuid], 300, $7, 'Here', $8) RETURNING id`,
      [key, form, kind, set, destination, place, min, release],
    );
  const ids = {
    destination,
    bridge,
    hanoi,
    marble,
    ruleBridge: await rule('cp-802:rare#1', forms['rare'] as string, 'presence', bridge, null),
    ruleHanoi: await rule('cp-803:epic#1', forms['epic'] as string, 'presence', hanoi, null),
    ruleMarble: await rule(
      'cp-804:legendary#2',
      forms['legendary'] as string,
      'co_presence',
      marble,
      2,
    ),
    window: await one(
      `INSERT INTO legendary_windows (key, form_id, place_line, rule, months, source_url, release_id)
       VALUES ('dn-fireworks', $1, 'Da Nang · Fireworks', '{"type":"annual_range","start":"06-01","end":"06-02"}',
         '{6}', 'https://example.org', $2) RETURNING id`,
      [forms['legendary'], release],
    ),
    ...Object.fromEntries(Object.entries(forms).map(([k, v]) => [`form_${k}`, v])),
    ...Object.fromEntries(Object.entries(critters).map(([k, v]) => [`critter_${k}`, v])),
  };
  const crewId = await one(
    "INSERT INTO crews (name, created_by) VALUES ('Crit', $1) RETURNING id",
    [lead],
  );
  const tripId = await one(
    "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
    [crewId, destination],
  );
  for (const [i, uid] of members.entries()) {
    await q('INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, $3)', [
      crewId,
      uid,
      i === 0 ? 'organiser' : 'member',
    ]);
    await q(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, $3, 'in')",
      [tripId, uid, i === 0 ? 'organiser' : 'member'],
    );
  }
  await q(
    "UPDATE trips SET tz = 'Asia/Ho_Chi_Minh', start_date = current_date - 1, end_date = current_date + 2 WHERE id = $1",
    [tripId],
  );
  for (const status of TO_IN_TRIP)
    await q('UPDATE trips SET status = $2 WHERE id = $1', [tripId, status]);

  const ruleOf = { bridge: ids.ruleBridge, hanoi: ids.ruleHanoi, marble: ids.ruleMarble };
  const placeOf = { bridge, hanoi, marble };
  return {
    harness,
    boss,
    members,
    crewId,
    tripId,
    ids,
    q,
    async befriended(input) {
      const id = randomUUID();
      const dwell = input.dwellS ?? 305;
      const [form] = await q<{ form_id: string; critter_id: string }>(
        'SELECT r.form_id, f.critter_id FROM spawn_rules r JOIN critter_forms f ON f.id = r.form_id WHERE r.id = $1',
        [ruleOf[input.rule]],
      );
      await q(
        `INSERT INTO encounters (id, user_id, trip_id, spawn_rule_id, form_id, poi_id, state, dwell_s,
           started_at, ready_at, resolved_at, verification)
         VALUES ($1, $2, $3, $4, $5, $6, 'befriended', $7::int,
           $8::timestamptz - make_interval(secs => $7::int),
           $8, $8, 'pending')`,
        [
          id,
          input.uid,
          tripId,
          ruleOf[input.rule],
          form?.form_id,
          placeOf[input.rule],
          dwell,
          input.at,
        ],
      );
      const evidence = { ...cleanEvidence(input.at), ...input.evidence };
      await q(
        `INSERT INTO encounter_evidence (encounter_id, user_id, evidence, attestation, received_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, input.uid, evidence, input.attestation ?? { status: 'unavailable' }, input.at],
      );
      if (input.rule !== 'marble') {
        await q(
          `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, poi_id, trip_id, source,
             encounter_id, verification)
           VALUES ($1, $2, $3, $4, $5, $6, 'encounter', $7, 'pending') ON CONFLICT DO NOTHING`,
          [input.uid, form?.form_id, form?.critter_id, input.at, placeOf[input.rule], tripId, id],
        );
      }
      return id;
    },
    async jobs(queue) {
      const { rows } = await harness.pool.query<{ data: Record<string, unknown> }>(
        'SELECT data FROM pgboss.job WHERE name = $1 ORDER BY created_on',
        [queue],
      );
      return rows.map((row) => row.data);
    },
    async stop() {
      await harness.stopAll();
      await harness.close();
    },
  };
}
