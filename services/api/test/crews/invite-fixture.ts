/**
 * Invite suites' shared set-up: the real crew and invite commands with test secrets (seat-token
 * keyring, field-encryption keyring, phone pepper), a crew started through `create_crew`, and a
 * trip with a given number of seats already taken. The doors run with a job producer, since the
 * commands enqueue share-card jobs in their transactions.
 */
import { randomBytes } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7, seatTokenKeyringFromJson } from '@cp/domain';

import { registerCrewCommands } from '../../src/commands/crews';
import { registerInviteCommands, type InviteCommandDeps } from '../../src/commands/invites';
import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { startJobProducer } from '../../src/jobs/producer';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

export const PHONE_PEPPER = 'test-phone-pepper-at-least-32-characters';

export const testInviteDeps: InviteCommandDeps = {
  linkEnv: 'development',
  seatKeyring: seatTokenKeyringFromJson(
    JSON.stringify({ k1: 'seat-token-test-secret-0123456789abcdef' }),
    'k1',
  ),
  fieldKeyring: { activeKeyId: 'k1', keys: { k1: randomBytes(32) } },
  phonePepper: PHONE_PEPPER,
};

/** Command doors for `register`, with the api's job producer running beside them. */
export async function startDoorsWithJobs(
  register: (registry: CommandRegistry) => void,
): Promise<CommandDoorsHarness> {
  const doors = await startCommandDoors(register);
  const { connectionString } = (doors.pool as unknown as { options: { connectionString: string } })
    .options;
  const producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  return {
    ...doors,
    async stop() {
      await producer.stop({ graceful: false });
      await doors.stop();
    },
  };
}

export function startInviteHarness(): Promise<CommandDoorsHarness> {
  return startDoorsWithJobs((registry) => {
    registerCrewCommands(registry);
    registerInviteCommands(registry, testInviteDeps);
  });
}

/** The `og.render` jobs queued so far, oldest first. */
export async function queuedCards(
  harness: CommandDoorsHarness,
): Promise<{ kind: string; token: string }[]> {
  const { rows } = await harness.pool.query<{ data: { kind: string; token: string } }>(
    "SELECT data FROM pgboss.job WHERE name = 'og.render' ORDER BY created_on, id",
  );
  return rows.map((row) => row.data);
}

export async function startCrew(harness: CommandDoorsHarness, owner: SignedIn): Promise<string> {
  const crewId = generateUuidV7();
  const response = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali',
  });
  if (response.status !== 200)
    throw new Error(`create_crew failed: ${JSON.stringify(response.body)}`);
  return crewId;
}

/** A trip of the crew with `seated` members (fresh users) holding seats, the owner first. */
export async function tripWithSeats(
  harness: CommandDoorsHarness,
  crewId: string,
  owner: SignedIn,
  seated: number,
): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup') RETURNING id",
      [crewId],
    );
    const tripId = rows[0]!.id;
    await tx.query(
      "INSERT INTO trip_participants (trip_id, user_id, role, rsvp) VALUES ($1, $2, 'organiser', 'in')",
      [tripId, owner.uid],
    );
    for (let i = 1; i < seated; i += 1) {
      const { rows: user } = await tx.query<{ id: string }>(
        "INSERT INTO users (id, status) VALUES (uuidv7(), 'registered') RETURNING id",
      );
      await tx.query('INSERT INTO crew_members (crew_id, user_id) VALUES ($1, $2)', [
        crewId,
        user[0]!.id,
      ]);
      await tx.query(
        "INSERT INTO trip_participants (trip_id, user_id, rsvp) VALUES ($1, $2, 'in')",
        [tripId, user[0]!.id],
      );
    }
    return tripId;
  });
}

export function resultOf(body: Record<string, unknown>): Record<string, unknown> {
  return body['result'] as Record<string, unknown>;
}

export function errorOf(body: Record<string, unknown>): { code?: string; detail?: unknown } {
  return body['error'] ?? {};
}
