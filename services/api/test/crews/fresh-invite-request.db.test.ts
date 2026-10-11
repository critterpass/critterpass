/**
 * Asking for a fresh invite, through the real `/v1/cmd` door against a migrated Postgres: a code
 * that ran out reaches the person who shared it (the organiser once they have left), once a day per
 * person; a code that still works, an unknown code or someone already in the crew is refused.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { runCommand } from '../location/location-fixture';
import { type CommandDoorsHarness, type SignedIn } from '../routes/command-doors-harness';
import { startDoorsWithJobs } from './invite-fixture';

let harness: CommandDoorsHarness;

beforeAll(async () => {
  harness = await startDoorsWithJobs(registerCrewCommands);
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

async function crewWithCode(owner: SignedIn): Promise<{ crewId: string; code: string }> {
  const crewId = generateUuidV7();
  const response = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali',
  });
  const result = response.body['result'] as { code: string };
  return { crewId, code: result.code };
}

async function lapse(code: string): Promise<void> {
  await withSystem(harness.pool, (tx) =>
    tx.query("UPDATE join_codes SET status = 'expired' WHERE code = $1", [code]),
  );
}

async function requests(crewId: string) {
  const { rows } = await harness.pool.query<{ ask: string; actor: string }>(
    `SELECT payload->>'ask_user_id' AS ask, actor_id AS actor FROM domain_events
      WHERE type = 'invite.refresh_requested' AND crew_id = $1`,
    [crewId],
  );
  return rows;
}

describe('request_fresh_invite', () => {
  it('asks the person who shared a lapsed code, once a day', async () => {
    const owner = await harness.signInAnonymously();
    const rin = await harness.signInAnonymously();
    const { crewId, code } = await crewWithCode(owner);

    const early = await runCommand(harness, rin, 'request_fresh_invite', { code });
    expect(early.status).toBe(422);

    await lapse(code);
    const first = await runCommand(harness, rin, 'request_fresh_invite', {
      code: code.toLowerCase(),
    });
    expect(first.status).toBe(200);
    expect(first.body['result']).toEqual({ sent: true });
    const again = await runCommand(harness, rin, 'request_fresh_invite', { code });
    expect(again.body['result']).toEqual({ sent: false });
    expect(await requests(crewId)).toEqual([{ ask: owner.uid, actor: rin.uid }]);
  });

  it('asks the organiser when the person who shared it has left', async () => {
    const owner = await harness.signInAnonymously();
    const sharer = await harness.signInAnonymously();
    const rin = await harness.signInAnonymously();
    const { crewId } = await crewWithCode(owner);
    await withSystem(harness.pool, async (tx) => {
      await tx.query(
        "INSERT INTO crew_members (crew_id, user_id, colour, status) VALUES ($1, $2, 'orange', 'left')",
        [crewId, sharer.uid],
      );
      await tx.query(
        `INSERT INTO join_codes (code, target_kind, target_id, crew_id, created_by, status)
         VALUES ('KQ7M3P', 'crew', $1, $1, $2, 'expired')`,
        [crewId, sharer.uid],
      );
    });
    const response = await runCommand(harness, rin, 'request_fresh_invite', { code: 'KQ7M3P' });
    expect(response.status).toBe(200);
    expect(await requests(crewId)).toEqual([{ ask: owner.uid, actor: rin.uid }]);
  });

  it('refuses an unknown code and someone already in the crew', async () => {
    const owner = await harness.signInAnonymously();
    const { code } = await crewWithCode(owner);
    await lapse(code);
    const unknown = await runCommand(harness, owner, 'request_fresh_invite', { code: 'ZZZZZZ' });
    expect(unknown.status).toBe(422);
    const member = await runCommand(harness, owner, 'request_fresh_invite', { code });
    expect(member.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
  });
});
