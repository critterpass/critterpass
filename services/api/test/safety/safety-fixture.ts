/**
 * A crew on a Bali trip (Ubud, country ID) in its trip days, with the curated safety catalogue a
 * published release would hold: Indonesia's emergency numbers, two medical facilities near Ubud and
 * the Indonesian help phrases. Maya organises, Rin and Jordan travel, Sam is in the crew but not on
 * the trip, and Olly is an outsider. The doors run the safety commands and routes with a started
 * job producer; routing is the straight-line estimate and the model gateway is set per suite.
 */
import { randomBytes, randomUUID } from 'node:crypto';

import type { Gateway } from '@cp/ai';
import { withSystem } from '@cp/db';
import type { PgBoss } from 'pg-boss';

import { registerSafetyCommands } from '../../src/commands/safety';
import { startJobProducer } from '../../src/jobs/producer';
import { registerHelpContextRoutes } from '../../src/routes/help-context';
import { straightLineRoutingProvider } from '../../src/routing/eta';
import { intoTripDays } from '../live-map/live-map-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

export const UBUD = { lat: -8.5069, lng: 115.2625 };
export const keyring = { activeKeyId: 'k1', keys: { k1: randomBytes(32) } };

export interface SafetyHarness {
  readonly doors: CommandDoorsHarness;
  readonly producer: PgBoss;
  /** The gateway the checklist route uses; `undefined` = no model key. */
  gateway: Pick<Gateway, 'callModel'> | undefined;
  stop(): Promise<void>;
}

export async function startSafetyHarness(
  registerMore: Parameters<typeof startCommandDoors>[0] = () => undefined,
): Promise<SafetyHarness> {
  const box: { gateway: Pick<Gateway, 'callModel'> | undefined } = { gateway: undefined };
  const doors = await startCommandDoors(
    (registry) => {
      registerSafetyCommands(registry, keyring);
      registerMore(registry);
    },
    (app, deps) =>
      registerHelpContextRoutes(app, {
        ...deps,
        routing: straightLineRoutingProvider,
        keyring,
        get gateway() {
          return box.gateway;
        },
      }),
  );
  const { connectionString } = (doors.pool as unknown as { options: { connectionString: string } })
    .options;
  const producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  return {
    doors,
    producer,
    get gateway() {
      return box.gateway;
    },
    set gateway(gateway) {
      box.gateway = gateway;
    },
    async stop() {
      await producer.stop({ graceful: false });
      await doors.stop();
    },
  };
}

export interface SafetyTrip {
  readonly maya: SignedIn;
  readonly rin: SignedIn;
  readonly jordan: SignedIn;
  readonly sam: SignedIn;
  readonly olly: SignedIn;
  readonly tripId: string;
  readonly crewId: string;
  readonly clinicId: string;
}

async function seedCatalogue(harness: SafetyHarness, destinationId: string, by: string) {
  return withSystem(harness.doors.pool, async (tx) => {
    const live = await tx.query<{ id: string }>(
      "SELECT id FROM content_releases WHERE kind = 'emergency' AND status = 'published'",
    );
    const rel =
      live.rows[0]?.id ??
      (
        await tx.query<{ id: string }>(
          `INSERT INTO content_releases (kind, version, batch_key, title, status, stage, checksum,
             artifact, item_count, approved_by, approved_at, published_at)
           VALUES ('emergency', 1, $1, 'Safety test release', 'published', 'publish',
             repeat('0', 64), '{}', 0, $2, now(), now()) RETURNING id`,
          [`safety-${randomUUID().slice(0, 8)}`, by],
        )
      ).rows[0]!.id;
    await tx.query(
      `INSERT INTO emergency_numbers (country, numbers, source_url, retrieved_on, verified_at, release_id)
       VALUES ('ID', $1::jsonb, 'https://www.kemlu.go.id', '2026-09-28', now(), $2)
       ON CONFLICT (country) DO NOTHING`,
      [
        JSON.stringify([
          { service: 'general', number: '112', label: 'Ambulance, police, fire' },
          { service: 'police', number: '110', label: 'Police' },
          { service: 'ambulance', number: '118', label: 'Ambulance' },
        ]),
        rel,
      ],
    );
    const clinic = await tx.query<{ id: string }>(
      `INSERT INTO facilities (key, destination_id, kind, name, lat, lng, address, phone, open_24h,
         source_url, retrieved_on, verified_at, release_id)
       VALUES ($1, $2, 'clinic', 'International SOS Bali Clinic', -8.5100, 115.2650,
         'Jl. Raya Ubud', '+62-361-2014-505', true, 'https://www.internationalsos.com',
         '2026-09-28', now(), $3),
              ($4, $2, 'hospital', 'Prof. Ngoerah Central General Hospital', -8.6750, 115.2170,
         'Jl. Diponegoro, Denpasar', '+62-361-227-911', NULL, 'https://sanglahhospitalbali.com',
         '2026-09-28', now(), $3)
       RETURNING id`,
      [
        `clinic-${randomUUID().slice(0, 8)}`,
        destinationId,
        rel,
        `hospital-${randomUUID().slice(0, 8)}`,
      ],
    );
    for (const [slug, context, text, gloss] of [
      ['emergency:need-doctor', 'emergency', 'Saya butuh dokter.', 'I need a doctor.'],
      ['emergency:help', 'emergency', 'Tolong!', 'Help!'],
      ['help:i-am-lost', 'help', 'Saya tersesat.', "I'm lost."],
    ] as const) {
      await tx.query(
        `INSERT INTO phrase_cards (key, language, context, text, gloss, audio_status,
           native_reviewed_on, release_id)
         VALUES ($1, 'id', $2, $3, $4, 'pending', '2026-09-28', $5) ON CONFLICT (key) DO NOTHING`,
        [`id:${slug}`, context, text, gloss, rel],
      );
    }
    return clinic.rows[0]!.id;
  });
}

export async function buildSafetyTrip(
  harness: SafetyHarness,
  options: { readonly country?: string | null } = {},
): Promise<SafetyTrip> {
  const doors = harness.doors;
  const [maya, rin, jordan, sam, olly] = await Promise.all(
    Array.from({ length: 5 }, () => doors.signInAnonymously()),
  );
  const ids = await withSystem(doors.pool, async (tx) => {
    for (const [who, name] of [
      [maya!, 'Maya'],
      [rin!, 'Rin'],
      [jordan!, 'Jordan'],
    ] as const) {
      await tx.query('UPDATE users SET display_name = $2 WHERE id = $1', [who.uid, name]);
    }
    const dest = await tx.query<{ id: string }>(
      "INSERT INTO destinations (slug, name, country) VALUES ($1, 'Ubud', $2) RETURNING id",
      [`ubud-${randomUUID().slice(0, 8)}`, options.country === undefined ? 'ID' : options.country],
    );
    const crew = await tx.query<{ id: string }>(
      "INSERT INTO crews (name, created_by) VALUES ('The Bali Six', $1) RETURNING id",
      [maya!.uid],
    );
    const crewId = crew.rows[0]!.id;
    await tx.query(
      `INSERT INTO crew_members (crew_id, user_id, role)
       VALUES ($1, $2, 'organiser'), ($1, $3, 'member'), ($1, $4, 'member'), ($1, $5, 'member')`,
      [crewId, maya!.uid, rin!.uid, jordan!.uid, sam!.uid],
    );
    const trip = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status, destination_id) VALUES ($1, 'voting', $2) RETURNING id",
      [crewId, dest.rows[0]!.id],
    );
    const tripId = trip.rows[0]!.id;
    await tx.query(
      `INSERT INTO trip_participants (trip_id, user_id, role, rsvp)
       VALUES ($1, $2, 'organiser', 'in'), ($1, $3, 'member', 'in'), ($1, $4, 'member', 'in')`,
      [tripId, maya!.uid, rin!.uid, jordan!.uid],
    );
    await intoTripDays(tx, tripId);
    return { tripId, crewId, destinationId: dest.rows[0]!.id };
  });
  const clinicId = await seedCatalogue(harness, ids.destinationId, maya!.uid);
  return {
    maya: maya!,
    rin: rin!,
    jordan: jordan!,
    sam: sam!,
    olly: olly!,
    tripId: ids.tripId,
    crewId: ids.crewId,
    clinicId,
  };
}
