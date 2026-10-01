/**
 * When the readers of a crew's guide text change, the worker is asked to translate what exists:
 * a person whose app language changes (`set_app_locale`) and a person who joins a crew or answers
 * for a trip (the membership events). Real command doors and a real job producer; the jobs are
 * read back from `pgboss.job`.
 */
import { appendDomainEvent, onEventAppended, withSystem } from '@cp/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../../src/commands/crews';
import { registerDeviceCommands } from '../../../src/commands/device';
import {
  enqueueCrewGuideTextIfRead,
  guideTextMembershipHook,
} from '../../../src/commands/guide/guide-text';
import { startCrew, startDoorsWithJobs } from '../../crews/invite-fixture';
import { runCommand } from '../../location/location-fixture';
import type { CommandDoorsHarness, SignedIn } from '../../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let owner: SignedIn;
let crewId: string;
let tripId: string;

beforeAll(async () => {
  harness = await startDoorsWithJobs((registry) => {
    registerCrewCommands(registry);
    registerDeviceCommands(registry);
  });
  // What the api registers at boot (commands/catalogue.ts).
  onEventAppended(guideTextMembershipHook);
  owner = await harness.signInAnonymously();
  crewId = await startCrew(harness, owner);
  const trips = await harness.pool.query<{ id: string }>(
    "INSERT INTO trips (crew_id, status) VALUES ($1, 'setup'), ($1, 'setup') RETURNING id",
    [crewId],
  );
  tripId = trips.rows[0]?.id as string;
  // A cancelled trip has no readers left: it is never swept.
  await harness.pool.query("UPDATE trips SET status = 'cancelled' WHERE id = $1", [
    trips.rows[1]?.id,
  ]);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

/** The translation sweeps queued so far, then cleared so each step reads only its own. */
async function takeSweeps(): Promise<Record<string, string>[]> {
  const { rows } = await harness.pool.query<{ data: Record<string, string> }>(
    "DELETE FROM pgboss.job WHERE name = 'guide_text.translate' RETURNING data",
  );
  return rows
    .map((row) => row.data)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

const setLocale = (who: SignedIn, locale: string) =>
  runCommand(harness, who, 'set_app_locale', { locale });

describe('asking for a translation sweep', () => {
  it('queues the crew and its running trips when a member’s app language changes', async () => {
    await takeSweeps();
    expect((await setLocale(owner, 'vi')).status).toBe(200);
    expect(await takeSweeps()).toEqual([{ crew_id: crewId }, { trip_id: tripId }]);
  });

  it('queues nothing when the language reported is the one already known', async () => {
    expect((await setLocale(owner, 'vi')).status).toBe(200);
    expect(await takeSweeps()).toEqual([]);
  });

  it('queues nothing for someone who is in no crew yet', async () => {
    const newcomer = await harness.signInAnonymously();
    expect((await setLocale(newcomer, 'vi')).status).toBe(200);
    expect(await takeSweeps()).toEqual([]);
  });

  it('queues the crew and its running trips when someone joins the crew', async () => {
    const friend = await harness.signInAnonymously();
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, role) VALUES ($1, $2, 'member')",
        [crewId, friend.uid],
      );
      await appendDomainEvent(tx, {
        type: 'crew.member_joined',
        aggregateKind: 'crew',
        aggregateId: crewId,
        actorKind: 'user',
        actorId: friend.uid,
        payload: { crew_id: crewId, user_id: friend.uid },
        crewId,
      });
    });
    expect(await takeSweeps()).toEqual([{ crew_id: crewId }, { trip_id: tripId }]);
  });
  it('queues a crew sweep for new guide text only when someone reads another language', async () => {
    // The owner reads Vietnamese: a new pitch for the crew is worth translating.
    await withSystem(harness.pool, (tx) => enqueueCrewGuideTextIfRead(tx, crewId));
    expect(await takeSweeps()).toEqual([{ crew_id: crewId }]);

    // A crew where everyone reads English asks for nothing.
    const solo = await harness.signInAnonymously();
    const english = await startCrew(harness, solo);
    await takeSweeps();
    await withSystem(harness.pool, (tx) => enqueueCrewGuideTextIfRead(tx, english));
    expect(await takeSweeps()).toEqual([]);
  });
});
