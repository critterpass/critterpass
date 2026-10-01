/**
 * The Live Activity orchestrator against a migrated Postgres and the recorded fake APNs server,
 * on the crew's trek leave-by: push-to-start on every phone that can show it (one channel for the
 * crew), one broadcast per readiness change and nothing for an unchanged frame, a phone with
 * Live Activities off counted as a fallback and never pushed, a dismissal that stays dismissed,
 * the 8-hour restart on the same content version, and the kill switch.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { eventOf, isBroadcast, startLaWorld, type LaWorld } from './la-world';

let world: LaWorld;
const startTokens = new Map<string, string>();

interface ActivityRow {
  id: string;
  device_id: string;
  state: string;
  end_reason: string | null;
  last_content_version: number;
  restart_count: number;
  broadcast_channel_id: string | null;
}

const activities = () =>
  world.q<ActivityRow>(
    `SELECT id, device_id, state, end_reason, last_content_version, restart_count,
            broadcast_channel_id
       FROM device_activities WHERE ref_id = $1 ORDER BY started_at, id`,
    [world.leaveById],
  );

const liveOn = async (device: string) =>
  (await activities()).filter(
    (row) => row.device_id === device && ['pending', 'active', 'stale'].includes(row.state),
  );

const objectSeq = async () =>
  (
    await world.q<{ seq: number }>(
      "SELECT seq FROM la_object_states WHERE kind = 'leave_by' AND ref_id = $1",
      [world.leaveById],
    )
  )[0]!.seq;

const setReadiness = (member: number, state: string) =>
  world.q('UPDATE readiness SET state = $3 WHERE leave_by_id = $1 AND user_id = $2', [
    world.leaveById,
    world.trip.members[member],
    state,
  ]);

const toToken = (token: string) => (path: string) => path.endsWith(`/${token}`);

beforeAll(async () => {
  world = await startLaWorld();
  const rows = await world.q<{ device_id: string; token: string }>(
    'SELECT device_id, token FROM la_push_to_start_tokens',
  );
  for (const row of rows) startTokens.set(row.device_id, row.token);
  // Alex's phone has Live Activities turned off in Settings.
  await world.q('UPDATE devices SET la_enabled = false WHERE id = $1', [world.devices[3]]);
}, 240_000);

afterAll(async () => {
  await world?.stop();
});

describe('la.orchestrate', { timeout: 60_000 }, () => {
  it('push-starts every phone that can show it on one crew channel; Live Activities off falls back', async () => {
    const result = await world.run();
    expect(result).toMatchObject({ outcome: 'sent', sends: 3, failed: 0, fallbacks: 1 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['start', 'start', 'start']);
    expect(world.channels.created).toHaveLength(1);
    for (const request of sent) {
      expect(request.headers['apns-push-type']).toBe('liveactivity');
      expect(request.headers['apns-priority']).toBe('10');
      expect((request.body['aps'] as Record<string, unknown>)['input-push-channel']).toBe(
        world.channels.created[0],
      );
    }
    const alexToken = startTokens.get(world.devices[3]!)!;
    expect(sent.some((r) => toToken(alexToken)(r.path))).toBe(false);
    const rows = await activities();
    expect(rows.map((r) => r.device_id).sort()).toEqual(world.devices.slice(0, 3).sort());
    expect(rows.every((r) => r.state === 'pending' && r.broadcast_channel_id !== null)).toBe(true);
  });

  it('an unchanged frame sends nothing; a readiness change is one broadcast', async () => {
    await world.run();
    expect(world.drain()).toHaveLength(0);
    const before = await objectSeq();

    await setReadiness(1, 'up');
    const result = await world.run();
    expect(result).toMatchObject({ outcome: 'sent', sends: 1, fallbacks: 1 });
    const [broadcast, ...rest] = world.drain();
    expect(rest).toHaveLength(0);
    expect(isBroadcast(broadcast!)).toBe(true);
    expect(broadcast!.headers['apns-channel-id']).toBe(world.channels.created[0]);
    expect(eventOf(broadcast!)).toBe('update');
    expect(await objectSeq()).toBe(before + 1);
    expect(
      (broadcast!.body['aps'] as { 'content-state': { seq: number } })['content-state'].seq,
    ).toBe(before + 1);
  });

  it('never starts again on a phone whose user dismissed the activity', async () => {
    const [dismissed] = await liveOn(world.devices[1]!);
    await world.q("UPDATE device_activities SET state = 'dismissed', ended_at = $2 WHERE id = $1", [
      dismissed!.id,
      world.now,
    ]);
    await setReadiness(2, 'up');
    await world.run();
    await world.lifecycle();
    await world.run();
    const token = startTokens.get(world.devices[1]!)!;
    const sent = world.drain();
    expect(sent.filter((r) => toToken(token)(r.path))).toHaveLength(0);
    expect(sent.filter((r) => eventOf(r) === 'start')).toHaveLength(0);
    expect(await liveOn(world.devices[1]!)).toHaveLength(0);
  });

  it('restarts an activity near its 8-hour limit on the same content version', async () => {
    const [old] = await liveOn(world.devices[0]!);
    const updateToken = 'ab'.repeat(32);
    await world.q(
      `UPDATE device_activities
          SET state = 'active', activity_push_token = $2, token_env = 'sandbox',
              started_at = $3::timestamptz - interval '7 hours 56 minutes'
        WHERE id = $1`,
      [old!.id, updateToken, world.now],
    );
    const seq = await objectSeq();

    const lifecycle = await world.lifecycle();
    expect(lifecycle.restarted).toBe(1);
    const ended = world.drain();
    expect(ended).toHaveLength(1);
    expect(eventOf(ended[0]!)).toBe('end');
    expect(toToken(updateToken)(ended[0]!.path)).toBe(true);

    const result = await world.run();
    expect(result).toMatchObject({ outcome: 'sent', sends: 1 });
    const [start] = world.drain();
    expect(eventOf(start!)).toBe('start');
    expect(toToken(startTokens.get(world.devices[0]!)!)(start!.path)).toBe(true);
    expect((start!.body['aps'] as { 'content-state': { seq: number } })['content-state'].seq).toBe(
      seq,
    );
    const [fresh] = await liveOn(world.devices[0]!);
    expect(fresh).toMatchObject({ last_content_version: seq, restart_count: 1 });
    expect(await objectSeq()).toBe(seq);
  });

  it('with the kill switch off, restarts nothing, ends what shows once and never starts', async () => {
    await world.setSwitch('la.leave_by.enabled', false);
    const [due] = await liveOn(world.devices[0]!);
    await world.q(
      `UPDATE device_activities SET state = 'active',
              started_at = $2::timestamptz - interval '9 hours' WHERE id = $1`,
      [due!.id, world.now],
    );
    expect((await world.lifecycle()).restarted).toBe(0);
    expect(world.drain()).toHaveLength(0);

    await setReadiness(0, 'up');
    expect(await world.run()).toEqual({ outcome: 'switched_off', ended: 2 });
    const sent = world.drain();
    expect(sent.map(eventOf)).toEqual(['end']);
    expect(isBroadcast(sent[0]!)).toBe(true);
    const rows = await activities();
    expect(rows.filter((r) => ['pending', 'active', 'stale'].includes(r.state))).toHaveLength(0);
    expect(rows.filter((r) => r.end_reason === 'switched_off')).toHaveLength(2);

    expect(await world.run()).toEqual({ outcome: 'switched_off', ended: 0 });
    expect(world.drain()).toHaveLength(0);

    // Back on: the phones that can show it start again; the dismissal still holds.
    await world.setSwitch('la.leave_by.enabled', true);
    expect(await world.run()).toMatchObject({ outcome: 'sent', sends: 2, fallbacks: 1 });
    const starts = world.drain().filter((r) => eventOf(r) === 'start');
    const targets = [world.devices[0]!, world.devices[2]!].map((d) => startTokens.get(d)!);
    expect(starts.map((r) => targets.some((t) => toToken(t)(r.path)))).toEqual([true, true]);
  });
});
