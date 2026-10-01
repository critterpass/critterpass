/**
 * `dismiss_tip` through `/v1/cmd`: a crew member dismisses the crew's tip for everyone (it leaves
 * the active set the `crews` stream carries), a repeat answers with the current state, and an
 * outsider cannot see the tip at all.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { registerHomeCommands } from '../../src/commands/home';
import { runCommand } from '../location/location-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let owner: SignedIn;
let outsider: SignedIn;
let tipId: string;

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerCrewCommands(registry);
    registerHomeCommands(registry);
  });
  [owner, outsider] = await Promise.all([harness.signInAnonymously(), harness.signInAnonymously()]);
  const crewId = generateUuidV7();
  const created = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali',
  });
  if (created.status !== 200) throw new Error(`create_crew: ${JSON.stringify(created.body)}`);
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO home_tips (crew_id, kind, text, facts, dedupe_key, valid_until)
     VALUES ($1, 'crowd_dip', 'Bali is at its quietest in February.', '{}', 'probe',
       now() + interval '3 days') RETURNING id`,
    [crewId],
  );
  tipId = rows[0]!.id;
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

function dismiss(session: SignedIn) {
  return harness.request('/v1/cmd/dismiss_tip', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(envelope('dismiss_tip', { tip_id: tipId })),
  });
}

describe('dismiss_tip', () => {
  it('hides the tip from an outsider', async () => {
    expect((await dismiss(outsider)).status).toBe(404);
  });

  it('dismisses the crew tip once and answers repeats with its state', async () => {
    const first = await dismiss(owner);
    expect(first.status).toBe(200);
    expect(((await first.json()) as { result: unknown }).result).toEqual({
      tip_id: tipId,
      status: 'dismissed',
    });
    const { rows } = await harness.pool.query<{ status: string; dismissed_by: string }>(
      'SELECT status, dismissed_by FROM home_tips WHERE id = $1',
      [tipId],
    );
    expect(rows).toEqual([{ status: 'dismissed', dismissed_by: owner.uid }]);
    const again = await dismiss(owner);
    expect(((await again.json()) as { result: unknown }).result).toEqual({
      tip_id: tipId,
      status: 'dismissed',
    });
    const events = await harness.pool.query(
      "SELECT 1 FROM domain_events WHERE type = 'tip.dismissed' AND aggregate_id = $1",
      [tipId],
    );
    expect(events.rowCount).toBe(1);
  });
});
