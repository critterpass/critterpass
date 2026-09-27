/**
 * `undo_guide_action` through `/v1/cmd`: an affected member restores the plan item exactly, the
 * undo is announced (`guide_action.undone` → activity), a replayed op returns the stored result,
 * only an affected member or an organiser may undo, the window is enforced, and "Undo everything"
 * undoes a disruption's actions newest first.
 */
import { randomUUID } from 'node:crypto';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { undoGuideActionCommand } from '../../src/ai/undo-guide-action';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';
import { currentItem, seedAppliedAction, seedGuideTrip, type GuideTrip } from './guide-action-seed';

let harness: CommandDoorsHarness;
let organiser: SignedIn;
let rin: SignedIn;
let maya: SignedIn;
let outsider: SignedIn;
let trip: GuideTrip;
const inAnHour = () => new Date(Date.now() + 60 * 60 * 1000);

beforeAll(async () => {
  harness = await startCommandDoors((registry) => registry.register(undoGuideActionCommand));
  [organiser, rin, maya, outsider] = await Promise.all([
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
    harness.signInAnonymously(),
  ]);
  trip = await seedGuideTrip(harness.pool, {
    organiser: organiser.uid,
    members: [rin.uid, maya.uid],
  });
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

function send(session: SignedIn, op: ReturnType<typeof envelope>) {
  return harness.request('/v1/cmd/undo_guide_action', {
    method: 'POST',
    headers: { cookie: session.cookie },
    body: JSON.stringify(op),
  });
}

async function errorCode(response: Response) {
  return ((await response.json()) as { error: { code: string; detail?: unknown } }).error;
}

describe('undo_guide_action', () => {
  it('restores the item, announces the undo and replays the same result', async () => {
    const seeded = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
    });
    expect(await currentItem(harness.pool, trip.tripId, seeded.stableId)).not.toEqual(
      seeded.original,
    );
    const op = envelope('undo_guide_action', { action_id: seeded.actionId });

    const first = await send(rin, op);
    expect(first.status).toBe(200);
    const body = (await first.json()) as {
      status: string;
      result: { undone: { action_id: string; undo_action_id: string }[] };
    };
    expect(body.status).toBe('applied');
    expect(body.result.undone).toEqual([expect.objectContaining({ action_id: seeded.actionId })]);
    expect(await currentItem(harness.pool, trip.tripId, seeded.stableId)).toEqual(seeded.original);

    const { rows: events } = await harness.pool.query(
      `SELECT de.actor_kind, de.actor_id, ae.verb FROM domain_events de
         JOIN activity_events ae ON ae.object_id = de.aggregate_id
        WHERE de.type = 'guide_action.undone' AND de.aggregate_id = $1`,
      [seeded.actionId],
    );
    expect(events).toEqual([{ actor_kind: 'user', actor_id: rin.uid, verb: 'undid' }]);

    const replay = await send(rin, op);
    expect(await replay.json()).toEqual({ ...body, status: 'duplicate' });
    const { rows: results } = await harness.pool.query(
      'SELECT status FROM cmd_results WHERE op_id = $1',
      [op.op_id],
    );
    expect(results).toEqual([{ status: 'applied' }]);

    // A fresh op on the undone action answers with the first undo instead of undoing twice.
    const again = await send(
      organiser,
      envelope('undo_guide_action', { action_id: seeded.actionId }),
    );
    const repeated = (await again.json()) as { result: { undone: unknown[] } };
    expect(repeated.result.undone).toEqual([
      expect.objectContaining({
        already_undone: true,
        undo_action_id: body.result.undone[0]?.undo_action_id,
      }),
    ]);
  });

  it('lets only an affected member or an organiser undo, inside the window', async () => {
    const seeded = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
    });
    const refused = await send(maya, envelope('undo_guide_action', { action_id: seeded.actionId }));
    expect(refused.status).toBe(403);
    expect(await errorCode(refused)).toMatchObject({ code: 'FORBIDDEN' });
    const hidden = await send(
      outsider,
      envelope('undo_guide_action', { action_id: seeded.actionId }),
    );
    expect(hidden.status).toBe(404);

    const expired = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: new Date(Date.now() - 1000),
    });
    const late = await send(rin, envelope('undo_guide_action', { action_id: expired.actionId }));
    expect(late.status).toBe(409);
    expect(await errorCode(late)).toMatchObject({
      code: 'STATE_INVALID',
      detail: { reason: 'undo_window_closed' },
    });

    const byOrganiser = await send(
      organiser,
      envelope('undo_guide_action', { action_id: seeded.actionId }),
    );
    expect(byOrganiser.status).toBe(200);
  });

  it('undoes everything of one disruption, newest first', async () => {
    const disruptionId = randomUUID();
    const older = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid],
      undoUntil: inAnHour(),
      disruptionId,
    });
    const newer = await seedAppliedAction(harness.pool, trip, {
      affected: [rin.uid, maya.uid],
      undoUntil: inAnHour(),
      disruptionId,
    });
    const response = await send(
      rin,
      envelope('undo_guide_action', { disruption_id: disruptionId }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { result: { undone: { action_id: string }[] } };
    expect(body.result.undone.map((entry) => entry.action_id)).toEqual([
      newer.actionId,
      older.actionId,
    ]);
    expect(await currentItem(harness.pool, trip.tripId, older.stableId)).toEqual(older.original);
    expect(await currentItem(harness.pool, trip.tripId, newer.stableId)).toEqual(newer.original);
  });
});
