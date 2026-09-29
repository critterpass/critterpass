/**
 * A crew of signed-in members (the first is its organiser) with home airports, and a few places,
 * on the real command doors with the poll and crew commands registered.
 */
import { randomUUID } from 'node:crypto';

import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';

import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { registerCrewCommands } from '../../src/commands/crews';
import { registerPollCommands } from '../../src/commands/polls';
import { runCommand } from '../location/location-fixture';
import {
  startCommandDoors,
  type CommandDoorsHarness,
  type MountRoutes,
  type SignedIn,
} from '../routes/command-doors-harness';

export interface PollCrew {
  readonly crewId: string;
  readonly members: readonly SignedIn[];
  readonly organiser: SignedIn;
}

export async function startPollDoors(
  extra?: (registry: CommandRegistry) => void,
  mount?: MountRoutes,
): Promise<CommandDoorsHarness> {
  return startCommandDoors((registry) => {
    registerCrewCommands(registry);
    registerPollCommands(registry);
    extra?.(registry);
  }, mount);
}

/** Signs in `size` people and seats them in one crew; most fly from Singapore. */
export async function buildPollCrew(harness: CommandDoorsHarness, size: number): Promise<PollCrew> {
  const members: SignedIn[] = [];
  for (let i = 0; i < size; i += 1) members.push(await harness.signInAnonymously());
  const organiser = members[0]!;
  const crewId = generateUuidV7();
  const created = await runCommand(harness, organiser, 'create_crew', {
    crew_id: crewId,
    name: 'Vote crew',
  });
  if (created.status !== 200) throw new Error(`create_crew: ${JSON.stringify(created.body)}`);
  await withSystem(harness.pool, async (tx) => {
    for (const [i, member] of members.entries()) {
      await tx.query('UPDATE users SET home_airport = $2 WHERE id = $1', [
        member.uid,
        i % 3 === 2 ? 'SGN' : 'SIN',
      ]);
      if (i === 0) continue;
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
        [crewId, member.uid],
      );
    }
  });
  return { crewId, members, organiser };
}

/** A place the crew can pitch; `slug` picks fare data (kyoto, lisbon) when it has any. */
export async function insertPlace(
  harness: CommandDoorsHarness,
  name: string,
  slug = `${name.toLowerCase()}-${randomUUID().slice(0, 6)}`,
  coverage: 'live' | 'guest' = 'guest',
): Promise<string> {
  return withSystem(harness.pool, async (tx) => {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO destinations (slug, name, country, coverage) VALUES ($1, $2, 'Probe', $3)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [slug, name, coverage],
    );
    return rows[0]!.id;
  });
}

export function run(
  harness: CommandDoorsHarness,
  session: SignedIn,
  cmd: string,
  payload: unknown,
  opts: { opId?: string } = {},
) {
  return runCommand(harness, session, cmd, payload, opts);
}

export function resultOf<T>(response: { body: Record<string, unknown> }): T {
  return response.body['result'] as T;
}

export function errorCode(response: { body: Record<string, unknown> }): string | undefined {
  return (response.body['error'] as { code?: string } | undefined)?.code;
}
