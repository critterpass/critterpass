/**
 * `send_nudge` and `record_app_open` through `/v1/cmd`: the pair cooldown answers
 * `NUDGE_TOO_SOON` with `next_at`; an installed target with push is scheduled at their modal open
 * hour in their own zone; an installed target without push gets an inbox nudge now and no relay;
 * a target who never installed gets the share-sheet relay and nothing is sent by us; strangers
 * and self-nudges are refused; app opens count once per hour.
 */
import { randomUUID } from 'node:crypto';

import { generateUuidV7, toLocalWallTime } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { registerCrewCommands } from '../../src/commands/crews';
import { registerNudgeCommands } from '../../src/commands/nudges';
import { runCommand } from '../location/location-fixture';
import {
  envelope,
  startCommandDoors,
  type CommandDoorsHarness,
  type SignedIn,
} from '../routes/command-doors-harness';

let harness: CommandDoorsHarness;
let owner: SignedIn;
let crewId: string;

beforeAll(async () => {
  harness = await startCommandDoors((registry) => {
    registerCrewCommands(registry);
    registerNudgeCommands(registry, { linkEnv: 'development' });
  });
  owner = await harness.signInAnonymously();
  crewId = generateUuidV7();
  const created = await runCommand(harness, owner, 'create_crew', {
    crew_id: crewId,
    name: 'Bali',
  });
  if (created.status !== 200) throw new Error(`create_crew: ${JSON.stringify(created.body)}`);
  await sql("UPDATE users SET display_name = 'Winston Tan' WHERE id = $1", [owner.uid]);
}, 240_000);

afterAll(async () => {
  await harness.stop();
});

async function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []) {
  return (await harness.pool.query(text, params)).rows as T[];
}

interface Person {
  readonly session: SignedIn;
  readonly uid: string;
}

async function crewmate(options: {
  name: string;
  tz: string;
  device: 'push' | 'no_push' | 'none';
}): Promise<Person> {
  const session = await harness.signInAnonymously();
  await sql("INSERT INTO crew_members (crew_id, user_id, colour) VALUES ($1, $2, 'orange')", [
    crewId,
    session.uid,
  ]);
  await sql('UPDATE users SET display_name = $2, tz = $3 WHERE id = $1', [
    session.uid,
    options.name,
    options.tz,
  ]);
  if (options.device !== 'none') {
    const deviceId = randomUUID();
    await sql(
      `INSERT INTO devices (id, user_id, platform, app_version, locale, tz)
       VALUES ($1, $2, 'ios', '1.0.0', 'en', $3)`,
      [deviceId, session.uid, options.tz],
    );
    if (options.device === 'push') {
      await sql(
        `INSERT INTO push_tokens (device_id, kind, token, env)
         VALUES ($1, 'apns_alert', $2, 'sandbox')`,
        [deviceId, `token-${deviceId}`],
      );
    }
  }
  return { session, uid: session.uid };
}

function nudge(from: SignedIn, to: string, reason = 'vote') {
  return harness.request('/v1/cmd/send_nudge', {
    method: 'POST',
    headers: { cookie: from.cookie },
    body: JSON.stringify(envelope('send_nudge', { target_uid: to, reason })),
  });
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('send_nudge', () => {
  it('schedules at the modal open hour in the target zone and refuses a second within a day', async () => {
    const dev = await crewmate({ name: 'Dev Patel', tz: 'Asia/Ho_Chi_Minh', device: 'push' });
    const recent = new Date(Date.now() - 2 * 86_400_000);
    await sql(
      `INSERT INTO app_open_hours (user_id, hour_local, opens, updated_at)
       VALUES ($1, 21, 5, $2), ($1, 8, 2, $2), ($1, 13, 9, $3)`,
      // 13:00 is the busiest hour ever, but not in the last 14 days.
      [dev.uid, recent, new Date(Date.now() - 30 * 86_400_000)],
    );

    const response = await nudge(owner, dev.uid);
    expect(response.status).toBe(200);
    const { result } = await json<{
      result: {
        outcome: string;
        send_at: string;
        send_at_local: string;
        tz: string;
        nudge_id: string;
      };
    }>(response);
    expect(result).toMatchObject({
      outcome: 'scheduled',
      send_at_local: '21:00',
      tz: 'Asia/Ho_Chi_Minh',
      target_name: 'Dev',
      guide: { slug: 'tokek', name: 'Tokek' },
    });
    const sendAt = new Date(result.send_at);
    expect(toLocalWallTime(sendAt, 'Asia/Ho_Chi_Minh').time).toBe('21:00:00');
    expect(sendAt.getTime()).toBeGreaterThan(Date.now());
    expect(sendAt.getTime()).toBeLessThanOrEqual(Date.now() + 86_400_000);

    const [row] = await sql<{
      channel: string;
      sent_at: Date | null;
      scheduled_delivery_id: string;
    }>('SELECT channel, sent_at, scheduled_delivery_id FROM nudges WHERE id = $1', [
      result.nudge_id,
    ]);
    expect(row).toMatchObject({ channel: 'push', sent_at: null });
    const timers = await sql(
      `SELECT 1 FROM scheduled_events WHERE kind = 'nudge.dispatch' AND ref_id = $1 AND due_at = $2`,
      [result.nudge_id, sendAt],
    );
    expect(timers).toHaveLength(1);
    const deliveries = await sql<{ user_id: string; kind: string }>(
      'SELECT user_id, kind FROM scheduled_deliveries WHERE id = $1',
      [row?.scheduled_delivery_id],
    );
    expect(deliveries).toEqual([{ user_id: dev.uid, kind: 'nudge' }]);

    const again = await nudge(owner, dev.uid);
    expect(again.status).toBe(429);
    const { error } = await json<{ error: { code: string; detail: { next_at: string } } }>(again);
    expect(error.code).toBe('NUDGE_TOO_SOON');
    const [first] = await sql<{ created_at: Date }>('SELECT created_at FROM nudges WHERE id = $1', [
      result.nudge_id,
    ]);
    expect(new Date(error.detail.next_at).getTime()).toBe(first!.created_at.getTime() + 86_400_000);
  });

  it('files an inbox nudge now for an installed target who denied push, with no relay', async () => {
    const rin = await crewmate({ name: 'Rin', tz: 'Asia/Tokyo', device: 'no_push' });
    const response = await nudge(owner, rin.uid, 'rsvp');
    const { result } = await json<{ result: Record<string, unknown> }>(response);
    expect(result).toMatchObject({ outcome: 'inbox', target_name: 'Rin' });
    expect(result).not.toHaveProperty('relay');
    const events = await sql<{ type: string }>(
      `SELECT type FROM domain_events WHERE aggregate_id = $1 ORDER BY type`,
      [result['nudge_id']],
    );
    expect(events.map((event) => event.type)).toEqual(['nudge.received', 'nudge.sent']);
    const [row] = await sql<{ channel: string; sent_at: Date | null }>(
      'SELECT channel, sent_at FROM nudges WHERE id = $1',
      [result['nudge_id']],
    );
    expect(row?.channel).toBe('inbox');
    expect(row?.sent_at).not.toBeNull();
  });

  it('hands a never-installed target to the share sheet and sends nothing itself', async () => {
    const alex = await crewmate({ name: 'Alex', tz: 'Europe/Lisbon', device: 'none' });
    const response = await nudge(owner, alex.uid, 'invite_open');
    const { result } = await json<{
      result: {
        outcome: string;
        relay: string;
        text: string;
        url: string | null;
        nudge_id: string;
      };
    }>(response);
    expect(result).toMatchObject({ outcome: 'relay', relay: 'share_sheet' });
    expect(result.text).toContain('Winston');
    expect(result.text).toContain('Tokek');
    expect(result.url).toMatch(/^https:\/\/[^/]+\/i\/[A-Z0-9]{6}$/);
    expect(result.text).toContain(result.url);
    const events = await sql<{ type: string }>(
      'SELECT type FROM domain_events WHERE aggregate_id = $1',
      [result.nudge_id],
    );
    expect(events.map((event) => event.type)).toEqual(['nudge.sent']);
    expect(
      await sql("SELECT 1 FROM scheduled_deliveries WHERE kind = 'nudge' AND user_id = $1", [
        alex.uid,
      ]),
    ).toEqual([]);
  });

  it('refuses strangers and self-nudges', async () => {
    const stranger = await harness.signInAnonymously();
    const hidden = await nudge(owner, stranger.uid);
    expect(hidden.status).toBe(404);
    const self = await nudge(owner, owner.uid);
    expect((await json<{ error: { code: string } }>(self)).error.code).toBe('VALIDATION');
  });
});

describe('record_app_open', () => {
  it('counts one open per local hour and ignores quick repeats', async () => {
    const send = () =>
      harness.request('/v1/cmd/record_app_open', {
        method: 'POST',
        headers: { cookie: owner.cookie },
        body: JSON.stringify(envelope('record_app_open', { hour_local: 20 })),
      });
    expect((await json<{ result: { counted: boolean } }>(await send())).result.counted).toBe(true);
    expect((await json<{ result: { counted: boolean } }>(await send())).result.counted).toBe(false);
    expect(
      await sql('SELECT opens FROM app_open_hours WHERE user_id = $1 AND hour_local = 20', [
        owner.uid,
      ]),
    ).toEqual([{ opens: 1 }]);
  });
});
