/**
 * `POST /v1/dev/seed-demo` on a real database: the caller gets a crew with four fake crewmates, a
 * confirmed trip three weeks out with its countdown, chat, a tip and a scenario's inbox, all
 * readable as the caller under RLS; a reseed builds nothing twice and resets the inbox; and the
 * seeded answers run the real commands (open a nudge, UNDO the guide's change, nudge Rin).
 */
import { withUser } from '@cp/db';
import type { PgBoss } from 'pg-boss';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { undoGuideActionCommand } from '../../src/ai/undo-guide-action';
import { registerInboxCommands } from '../../src/commands/inbox';
import { registerNudgeCommands } from '../../src/commands/nudges';
import { DEMO_REPLY } from '../../src/dev/demo-world';
import { registerDevRoutes, registerDevRoutesFromEnv } from '../../src/dev/routes';
import { routeNotificationsFromApiEvents, startJobProducer } from '../../src/jobs/producer';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let producer: PgBoss;
let caller: SignedIn;
const logger = { info: () => undefined, warn: () => undefined };

beforeAll(async () => {
  harness = await startCommandDoors(
    (registry) => {
      registry.register(undoGuideActionCommand);
      registerInboxCommands(registry);
      registerNudgeCommands(registry, { linkEnv: 'staging' });
    },
    (app, deps) => registerDevRoutes(app, { ...deps, appEnv: 'staging', logger }),
  );
  const { connectionString } = (
    harness.pool as unknown as { options: { connectionString: string } }
  ).options;
  producer = await startJobProducer({ connectionString, logger: { error: () => undefined } });
  routeNotificationsFromApiEvents();
  caller = await harness.signInAnonymously();
}, 240_000);

afterAll(async () => {
  await producer?.stop({ graceful: false });
  await harness?.stop();
});

interface Seeded {
  crew_id: string;
  trip_id: string;
  created: boolean;
  inbox_item_ids: string[];
}

async function seed(who: SignedIn, body: unknown = {}): Promise<Seeded> {
  const response = await harness.request('/v1/dev/seed-demo', {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(body),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as Seeded;
}

function send(who: SignedIn, cmd: string, payload: unknown) {
  return harness.request(`/v1/cmd/${cmd}`, {
    method: 'POST',
    headers: { cookie: who.cookie },
    body: JSON.stringify(envelope(cmd, payload)),
  });
}

/** The caller's open inbox as they see it, through RLS. */
function openInbox(uid: string) {
  return withUser(harness.pool, uid, 'device-1', async (tx) => {
    const { rows } = await tx.query<{
      id: string;
      kind: string;
      needs_you: boolean;
      actions: { id: string }[];
    }>(
      `SELECT id, kind, needs_you, actions FROM inbox_items
        WHERE user_id = $1 AND resolved_at IS NULL ORDER BY created_at`,
      [uid],
    );
    return rows;
  });
}

function itemWith(items: Awaited<ReturnType<typeof openInbox>>, action: string) {
  const found = items.find((item) => item.actions.some((candidate) => candidate.id === action));
  if (found === undefined) throw new Error(`no open item with a ${action} action`);
  return found;
}

describe('demo seed', { timeout: 120_000 }, () => {
  it('builds a demo world the caller can read under RLS', async () => {
    const world = await seed(caller);
    expect(world.created).toBe(true);

    const seen = await withUser(harness.pool, caller.uid, 'device-1', async (tx) => {
      const crew = await tx.query<{ name: string; active: string }>(
        `SELECT c.name, s.active_crew_id AS active FROM crews c, user_settings s
          WHERE c.id = $1 AND s.user_id = $2`,
        [world.crew_id, caller.uid],
      );
      const members = await tx.query<{ display_name: string }>(
        `SELECT u.display_name FROM crew_members m JOIN users u ON u.id = m.user_id
          WHERE m.crew_id = $1 AND m.user_id <> $2 ORDER BY u.display_name`,
        [world.crew_id, caller.uid],
      );
      const trip = await tx.query<{ status: string; lead: number; target: Date | null }>(
        `SELECT t.status, t.start_date - (now() AT TIME ZONE t.tz)::date AS lead,
                p.countdown_target_at AS target
           FROM trips t JOIN trip_participants p ON p.trip_id = t.id AND p.user_id = $2
          WHERE t.id = $1`,
        [world.trip_id, caller.uid],
      );
      const chat = await tx.query(
        "SELECT 1 FROM messages WHERE crew_id = $1 AND sender_kind = 'user'",
        [world.crew_id],
      );
      const tips = await tx.query(
        "SELECT 1 FROM home_tips WHERE crew_id = $1 AND status = 'active' AND valid_until > now()",
        [world.crew_id],
      );
      return { crew: crew.rows[0], members, trip: trip.rows[0], chat, tips };
    });
    expect(seen.crew).toEqual({ name: 'Bali Demo Crew', active: world.crew_id });
    expect(seen.members.rows.map((row) => row.display_name)).toEqual([
      'Alex Demo',
      'Jordan Demo',
      'Maya Demo',
      'Rin Demo',
    ]);
    expect(seen.trip?.status).toBe('confirmed');
    expect(seen.trip?.lead).toBeGreaterThanOrEqual(20);
    expect(seen.trip?.lead).toBeLessThanOrEqual(22);
    expect(seen.trip?.target).not.toBeNull();
    expect(seen.chat.rowCount).toBe(5);
    expect(seen.tips.rowCount).toBe(1);

    const inbox = await openInbox(caller.uid);
    expect(new Set(inbox.map((item) => item.kind))).toEqual(
      new Set([
        'crew.member_joined',
        'invite.opened',
        'nudge.received',
        'guide_action.executed',
        'tip.price_drop',
      ]),
    );
    expect(inbox.filter((item) => item.needs_you)).toHaveLength(2);
  });

  it('builds nothing twice and resets the inbox to the chosen scenario', async () => {
    const first = await seed(caller);
    const again = await seed(caller, { scenario: 'inbox' });
    expect(again).toMatchObject({ crew_id: first.crew_id, trip_id: first.trip_id, created: false });
    const { rows } = await harness.pool.query<{ crews: number; messages: number; items: number }>(
      `SELECT (SELECT count(*)::int FROM crews WHERE created_by = $1) AS crews,
              (SELECT count(*)::int FROM messages WHERE crew_id = $2 AND sender_kind = 'user') AS messages,
              (SELECT count(*)::int FROM inbox_items WHERE user_id = $1) AS items`,
      [caller.uid, first.crew_id],
    );
    expect(rows[0]).toEqual({ crews: 1, messages: 5, items: again.inbox_item_ids.length });
    const inbox = await openInbox(caller.uid);
    expect(inbox.filter((item) => item.needs_you).map((item) => item.kind)).toEqual([
      'nudge.received',
    ]);

    await seed(caller, { scenario: 'caught_up' });
    expect((await openInbox(caller.uid)).filter((item) => item.needs_you)).toEqual([]);
  });

  it('plans one dinner at the demo place, however often it is seeded', async () => {
    const first = await seed(caller);
    await seed(caller);
    const { rows } = await harness.pool.query<{ name: string; day_no: number }>(
      `SELECT p.name, d.day_no FROM plan_items pi
         JOIN trips t ON t.current_version_id = pi.version_id
         JOIN plan_days d ON d.id = pi.day_id
         JOIN pois p ON p.id = pi.poi_id
        WHERE t.id = $1`,
      [first.trip_id],
    );
    expect(rows).toEqual([{ name: 'Warung Demo Ubud', day_no: 1 }]);
  });

  it("has Maya answer on a reseed when the caller's message is the newest", async () => {
    const writer = await harness.signInAnonymously();
    const world = await seed(writer);
    const latest = async () => {
      const { rows } = await harness.pool.query<{ sender_id: string; body: string }>(
        `SELECT sender_id, body FROM messages WHERE crew_id = $1 ORDER BY seq DESC LIMIT 1`,
        [world.crew_id],
      );
      return rows[0];
    };
    await seed(writer);
    expect((await latest())?.body).not.toBe(DEMO_REPLY);

    await harness.pool.query(
      `INSERT INTO messages (crew_id, trip_id, sender_kind, sender_id, type, body)
       VALUES ($1, $2, 'user', $3, 'text', 'landing at 6')`,
      [world.crew_id, world.trip_id, writer.uid],
    );
    await seed(writer);
    const reply = await latest();
    expect(reply?.body).toBe(DEMO_REPLY);
    expect(reply?.sender_id).not.toBe(writer.uid);

    await seed(writer);
    const { rows } = await harness.pool.query<{ replies: number }>(
      'SELECT count(*)::int AS replies FROM messages WHERE crew_id = $1 AND body = $2',
      [world.crew_id, DEMO_REPLY],
    );
    expect(rows[0]?.replies).toBe(1);
  });

  it('seeds answers that run the real commands, and a reseed makes them answerable again', async () => {
    await seed(caller);
    let inbox = await openInbox(caller.uid);

    const open = await send(caller, 'act_inbox_item', {
      item_id: itemWith(inbox, 'open').id,
      action: 'open',
    });
    expect(((await open.json()) as { result: { outcome: string } }).result.outcome).toBe(
      'resolved',
    );

    const undo = await send(caller, 'act_inbox_item', {
      item_id: itemWith(inbox, 'undo').id,
      action: 'undo',
    });
    const undone = (await undo.json()) as { result: { result: { undone: unknown[] } } };
    expect(undone.result.result.undone).toHaveLength(1);

    const nudge = await send(caller, 'act_inbox_item', {
      item_id: itemWith(inbox, 'nudge').id,
      action: 'nudge',
    });
    const nudged = (await nudge.json()) as {
      result: { result: { outcome: string; target_name: string } };
    };
    expect(nudged.result.result).toMatchObject({ outcome: 'inbox', target_name: 'Rin' });

    await seed(caller);
    inbox = await openInbox(caller.uid);
    const redo = await send(caller, 'act_inbox_item', {
      item_id: itemWith(inbox, 'undo').id,
      action: 'undo',
    });
    expect(redo.status).toBe(200);
    const renudge = await send(caller, 'act_inbox_item', {
      item_id: itemWith(inbox, 'nudge').id,
      action: 'nudge',
    });
    expect(
      ((await renudge.json()) as { result: { result: { outcome: string } } }).result.result,
    ).toMatchObject({ outcome: 'inbox' });
  });

  it('gives every caller their own world', async () => {
    const other = await harness.signInAnonymously();
    const mine = await seed(caller);
    const theirs = await seed(other);
    expect(theirs.created).toBe(true);
    expect(theirs.crew_id).not.toBe(mine.crew_id);
  });

  it('needs a session', async () => {
    const response = await harness.request('/v1/dev/seed-demo', { method: 'POST', body: '{}' });
    expect(response.status).toBe(401);
  });
});

describe('demo seed mounting', () => {
  const noop = () => {
    throw new Error('never called');
  };
  const deps = {
    pool: {} as never,
    sessions: noop as never,
    redis: {} as never,
    logger,
  };
  const app = { post: () => undefined } as never;

  it('mounts only outside production with the flag on', () => {
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'staging', DEV_SEED_ENABLED: true }),
    ).toBe(true);
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'staging', DEV_SEED_ENABLED: false }),
    ).toBe(false);
    expect(
      registerDevRoutesFromEnv(app, deps, { APP_ENV: 'production', DEV_SEED_ENABLED: true }),
    ).toBe(false);
  });
});
