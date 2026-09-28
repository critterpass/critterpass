/**
 * The inbox commands through `/v1/cmd`: an UNDO row runs `undo_guide_action` under the item's
 * op id and settles the item once (a replay is a duplicate, a second op finds it settled), an
 * undo from another surface queues the fan-out that settles the row, a stranger's item is
 * invisible, an expired item or unknown action is refused, and mark-read never resolves.
 */
import { randomUUID } from 'node:crypto';

import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { undoGuideActionCommand } from '../../src/ai/undo-guide-action';
import { registerInboxCommands } from '../../src/commands/inbox';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import {
  currentItem,
  seedAppliedAction,
  seedGuideTrip,
  type GuideTrip,
} from '../ai/guide-action-seed';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let organiser: SignedIn;
let rin: SignedIn;
let stranger: SignedIn;
let trip: GuideTrip;
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registry.register(undoGuideActionCommand);
    registerInboxCommands(registry);
  });
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  routeNotificationsFromApiEvents();
  [organiser, rin, stranger] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  trip = await seedGuideTrip(harness.pool, { organiser: organiser.uid, members: [rin.uid] });
}, 240_000);

afterAll(async () => {
  await producer.stop({ graceful: false });
  await harness.stop();
});

function send(session: SignedIn, cmd: string, op: ReturnType<typeof envelope>) {
  return harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(op),
  });
}

async function undoItem(uid: string, actionId: string, undoUntil: Date): Promise<string> {
  const { rows } = await harness.pool.query<{ id: string }>(
    `INSERT INTO inbox_items (user_id, trip_id, kind, source, needs_you, actions, undo_until,
       resolve_key, data)
     VALUES ($1, $2, 'guide_action.executed', 'guide', false, $3, $4, $5, $6) RETURNING id`,
    [
      uid,
      trip.tripId,
      JSON.stringify([
        {
          id: 'undo',
          style: 'undo',
          command: 'undo_guide_action',
          payload: { action_id: actionId },
        },
      ]),
      undoUntil,
      `guide_action:${actionId}`,
      JSON.stringify({ action_id: actionId }),
    ],
  );
  return rows[0]!.id;
}

async function item(id: string) {
  const { rows } = await harness.pool.query<{ resolved_at: Date | null; read_at: Date | null }>(
    'SELECT resolved_at, read_at FROM inbox_items WHERE id = $1',
    [id],
  );
  return rows[0];
}

async function errorOf(response: Response) {
  return ((await response.json()) as { error: { code: string; detail?: unknown } }).error;
}

describe('act_inbox_item', () => {
  it('runs the UNDO through undo_guide_action and settles the item exactly once', async () => {
    const seeded = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
    });
    const itemId = await undoItem(rin.uid, seeded.actionId, inAnHour());
    const op = envelope('act_inbox_item', { item_id: itemId, action: 'undo' });

    const first = await send(rin, 'act_inbox_item', op);
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      status: string;
      result: { outcome: string; result: { undone: { action_id: string }[] } };
    };
    expect(body.status).toBe('applied');
    expect(body.result.outcome).toBe('resolved');
    expect(body.result.result.undone).toEqual([
      expect.objectContaining({ action_id: seeded.actionId }),
    ]);
    expect(await currentItem(harness.pool, trip.tripId, seeded.stableId)).toEqual(seeded.original);
    expect((await item(itemId))?.resolved_at).not.toBeNull();

    const replay = await send(rin, 'act_inbox_item', op);
    expect(await replay.json()).toEqual({ ...body, status: 'duplicate' });

    const again = await send(
      rin,
      'act_inbox_item',
      envelope('act_inbox_item', { item_id: itemId, action: 'undo' }),
    );
    expect(((await again.json()) as { result: { outcome: string } }).result.outcome).toBe(
      'already_resolved',
    );
    const { rows: undone } = await harness.pool.query(
      'SELECT count(*)::int AS n FROM guide_actions WHERE compensates_id = $1',
      [seeded.actionId],
    );
    expect(undone).toEqual([{ n: 1 }]);

    const { rows: badges } = await harness.pool.query<{ payload: { type: string; data: unknown } }>(
      `SELECT payload FROM rt_outbox WHERE channel = $1 AND payload->>'type' = 'badge.counts'`,
      [`user:#${rin.uid}`],
    );
    expect(badges.at(-1)?.payload.data).toEqual({ needs_you: 0, unread: 0 });
  });

  it('queues the fan-out that settles the row when the undo comes from another surface', async () => {
    const seeded = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
    });
    await undoItem(rin.uid, seeded.actionId, inAnHour());
    const direct = await send(
      rin,
      'undo_guide_action',
      envelope('undo_guide_action', { action_id: seeded.actionId }),
    );
    expect(direct.status).toBe(200);
    const { rows } = await harness.pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM pgboss.job j
         JOIN domain_events e ON e.id = (j.data->>'event_id')::uuid
        WHERE j.name = 'inbox.fanout' AND e.type = 'guide_action.undone' AND e.aggregate_id = $1`,
      [seeded.actionId],
    );
    expect(rows).toEqual([{ n: 1 }]);
  });

  it("hides another user's item and refuses expired items and unknown actions", async () => {
    const seeded = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
    });
    const itemId = await undoItem(rin.uid, seeded.actionId, inAnHour());
    const hidden = await send(
      stranger,
      'act_inbox_item',
      envelope('act_inbox_item', { item_id: itemId, action: 'undo' }),
    );
    expect(hidden.status).toBe(404);

    const unknown = await send(
      rin,
      'act_inbox_item',
      envelope('act_inbox_item', { item_id: itemId, action: 'approve' }),
    );
    expect(await errorOf(unknown)).toMatchObject({ code: 'VALIDATION' });

    const lapsed = await undoItem(rin.uid, seeded.actionId, new Date(Date.now() - 1000));
    const late = await send(
      rin,
      'act_inbox_item',
      envelope('act_inbox_item', { item_id: lapsed, action: 'undo' }),
    );
    expect(await errorOf(late)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { state: 'undo_expired' },
    });
    expect((await item(itemId))?.resolved_at).toBeNull();
  });
});

describe('mark_inbox_read', () => {
  it('marks read by id or all, never resolving', async () => {
    const ids: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const { rows } = await harness.pool.query<{ id: string }>(
        "INSERT INTO inbox_items (user_id, kind, needs_you) VALUES ($1, 'nudge.received', true) RETURNING id",
        [organiser.uid],
      );
      ids.push(rows[0]!.id);
    }
    const one = await send(
      organiser,
      'mark_inbox_read',
      envelope('mark_inbox_read', { item_ids: [ids[0]] }),
    );
    expect(((await one.json()) as { result: { count: number } }).result.count).toBe(1);
    const all = await send(
      organiser,
      'mark_inbox_read',
      envelope('mark_inbox_read', { all: true }),
    );
    expect(((await all.json()) as { result: { count: number } }).result.count).toBe(2);
    for (const id of ids) {
      const row = await item(id);
      expect(row?.read_at).not.toBeNull();
      expect(row?.resolved_at).toBeNull();
    }
    const { rows } = await harness.pool.query<{ needs_you: number }>(
      'SELECT needs_you FROM app.inbox_badge_counts($1, now())',
      [organiser.uid],
    );
    expect(rows[0]?.needs_you).toBe(3);
  });

  it("never touches another user's rows", async () => {
    const { rows } = await harness.pool.query<{ id: string }>(
      "INSERT INTO inbox_items (user_id, kind) VALUES ($1, 'crew.member_joined') RETURNING id",
      [rin.uid],
    );
    const response = await send(
      stranger,
      'mark_inbox_read',
      envelope('mark_inbox_read', { item_ids: [rows[0]!.id, randomUUID()] }),
    );
    expect(((await response.json()) as { result: { count: number } }).result.count).toBe(0);
    expect((await item(rows[0]!.id))?.read_at).toBeNull();
  });
});
