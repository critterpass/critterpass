/**
 * The guide's plan changes (`propose_plan_changes`) land as a draft change set in the asking
 * member's name through `create_changeset`, and never touch the plan itself: the crew still has to
 * review, vote or keep it for one person.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import type { CommandRegistry } from '../../src/commands/_framework/registry';
import { registerChangesetCommands } from '../../src/commands/changesets';
import { proposePlanChanges } from '../../src/commands/guide/propose-plan-changes';
import { seedGuideTrip } from '../ai/guide-action-seed';
import { startCommandDoors, type CommandDoorsHarness } from './command-doors-harness';

let harness: CommandDoorsHarness;
let commands: CommandRegistry;

beforeAll(async () => {
  harness = await startCommandDoors(registerChangesetCommands, (_app, deps) => {
    commands = deps.registry;
  });
}, 240_000);

afterAll(async () => {
  await harness?.stop();
});

describe('propose_plan_changes', () => {
  it('drafts a change set as the asker and leaves the plan untouched', async () => {
    const me = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, { organiser: me.uid, members: [] });
    const stableId = randomUUID();
    await harness.pool.query(
      `INSERT INTO plan_items (version_id, day_id, trip_id, stable_id, starts_at, category, notes)
       SELECT t.current_version_id, d.id, t.id, $2, now() + interval '1 day', 'meal', 'Warung Biah'
         FROM trips t JOIN plan_days d ON d.version_id = t.current_version_id AND d.day_no = 1
        WHERE t.id = $1`,
      [tripId, stableId],
    );
    const { rows: head } = await harness.pool.query<{ current_version_id: string }>(
      'SELECT current_version_id FROM trips WHERE id = $1',
      [tripId],
    );
    const version = head[0]!.current_version_id;

    const proposal = await proposePlanChanges(
      { pool: harness.pool, commands },
      {
        trip_id: tripId,
        base_version: version,
        ops: [{ op: 'remove', item: stableId, reason: 'It rains all afternoon.', source_ids: [] }],
      },
      { uid: me.uid, tripId, caller: 'C', route: 'guide.chat' },
    );

    const { rows } = await harness.pool.query<{
      status: string;
      author_id: string;
      author_kind: string;
      base_version_id: string;
    }>('SELECT status, author_id, author_kind, base_version_id FROM change_sets WHERE id = $1', [
      proposal.changeset_id,
    ]);
    expect(rows).toEqual([
      { status: 'draft', author_id: me.uid, author_kind: 'user', base_version_id: version },
    ]);
    const after = await harness.pool.query<{ current_version_id: string }>(
      'SELECT current_version_id FROM trips WHERE id = $1',
      [tripId],
    );
    expect(after.rows[0]?.current_version_id).toBe(version);
    const item = await harness.pool.query('SELECT 1 FROM plan_items WHERE stable_id = $1', [
      stableId,
    ]);
    expect(item.rowCount).toBe(1);
  });

  it('fails the tool on a stale base version instead of guessing', async () => {
    const me = await harness.signInAnonymously();
    const { tripId } = await seedGuideTrip(harness.pool, { organiser: me.uid, members: [] });
    await expect(
      proposePlanChanges(
        { pool: harness.pool, commands },
        {
          trip_id: tripId,
          base_version: randomUUID(),
          ops: [{ op: 'remove', item: randomUUID(), reason: 'x', source_ids: [] }],
        },
        { uid: me.uid, tripId, caller: 'C', route: 'guide.chat' },
      ),
    ).rejects.toMatchObject({
      code: 'PLAN_VERSION_CONFLICT',
    });
  });
});
