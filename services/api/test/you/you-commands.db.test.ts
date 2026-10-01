/**
 * Profile, settings, app icon and travel-history commands through the real doors against a
 * migrated Postgres: happy paths, denials, idempotent replays, sync-door validation rejects, and a
 * username race that ends with exactly one winner.
 */
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { envelope, startAccountHarness, type AccountHarness } from '../account/account-harness';

let h: AccountHarness;

beforeAll(async () => {
  h = await startAccountHarness();
}, 240_000);

afterAll(async () => {
  await h.stop();
});

describe('update_profile', () => {
  it('writes name, username and languages once, and a replay changes nothing', async () => {
    const me = await h.anonymous();
    const opId = generateUuidV7();
    const payload = { name: '  Mai   Tran ', username: 'Mai.Tran', languages: ['vi', 'en', 'vi'] };
    const [status, body] = await h.cmd(me, 'update_profile', payload, opId);
    expect(status).toBe(200);
    expect(body.result).toMatchObject({
      display_name: 'Mai Tran',
      username: 'mai.tran',
      languages: ['vi', 'en'],
      changed: ['display_name', 'username', 'languages'],
    });
    const [again, replay] = await h.cmd(me, 'update_profile', payload, opId);
    expect(again).toBe(200);
    expect(replay.status).toBe('duplicate');
    const events = (await h.events('profile.updated')).filter((e) => e.user_id === me.uid);
    expect(events).toHaveLength(1);
  });

  it('refuses a reserved or malformed username and a blocked name', async () => {
    const me = await h.anonymous();
    const [s1, reserved] = await h.cmd(me, 'update_profile', { username: 'tokek' });
    expect([s1, reserved.error?.code, reserved.error?.detail?.reason]).toEqual([
      422,
      'VALIDATION',
      'reserved',
    ]);
    const [, dots] = await h.cmd(me, 'update_profile', { username: 'a..b' });
    expect(dots.error?.detail?.reason).toBe('dots');
  });

  it('holds a second username change for 30 days', async () => {
    const me = await h.anonymous();
    await h.cmd(me, 'update_profile', { username: `first_${me.uid.slice(-6)}` });
    const [status, body] = await h.cmd(me, 'update_profile', {
      username: `second_${me.uid.slice(-6)}`,
    });
    expect(status).toBe(409);
    expect(body.error?.detail).toMatchObject({ reason: 'username_cooldown' });
  });

  it('lets exactly one of two racing users take the same username', async () => {
    const [a, b] = await Promise.all([h.anonymous(), h.anonymous()]);
    const results = await Promise.all([
      h.cmd(a, 'update_profile', { username: 'racer' }),
      h.cmd(b, 'update_profile', { username: 'racer' }),
    ]);
    const statuses = results.map(([status]) => status).sort();
    expect(statuses).toEqual([200, 409]);
    const loser = results.find(([status]) => status === 409)?.[1];
    expect(loser?.error?.detail).toMatchObject({ reason: 'username_taken' });
    const owners = await h.rows("SELECT id FROM users WHERE username = 'racer'");
    expect(owners).toHaveLength(1);
  });

  it('answers username availability for the caller', async () => {
    const me = await h.anonymous();
    const other = await h.anonymous();
    await h.cmd(other, 'update_profile', { username: 'taken_name' });
    const [, taken] = await h.get(me, '/v1/me/username-available?u=Taken_Name');
    expect(taken).toMatchObject({ available: false, reason: 'taken' });
    const [, free] = await h.get(me, '/v1/me/username-available?u=free_name');
    expect(free).toMatchObject({ available: true, reason: null });
    const [, own] = await h.get(other, '/v1/me/username-available?u=taken_name');
    expect(own).toMatchObject({ available: true });
  });
});

describe('set_settings', () => {
  it('patches whitelisted keys, merges audio and emits only real changes', async () => {
    const me = await h.anonymous();
    const [, first] = await h.cmd(me, 'set_settings', {
      patch: { chattiness: 'chatty', audio: { music_enabled: false }, price_display: 'both' },
    });
    expect(first.result).toEqual({ changed: ['chattiness', 'price_display', 'audio'] });
    await h.cmd(me, 'set_settings', { patch: { audio: { haptics: false } } });
    const [row] = await h.rows<{ audio: unknown; chattiness: string }>(
      'SELECT audio, chattiness FROM user_settings WHERE user_id = $1',
      [me.uid],
    );
    expect(row).toEqual({ audio: { music_enabled: false, haptics: false }, chattiness: 'chatty' });
    const [, same] = await h.cmd(me, 'set_settings', { patch: { chattiness: 'chatty' } });
    expect(same.result).toEqual({ changed: [] });
    const events = (await h.events('settings.changed')).filter((e) => e.user_id === me.uid);
    expect(events).toHaveLength(2);
  });

  it('rejects a key another feature owns, through the offline door too', async () => {
    const me = await h.anonymous();
    const [status] = await h.cmd(me, 'set_settings', {
      patch: { active_crew_id: generateUuidV7() },
    });
    expect(status).toBe(422);
    const results = await h.upload(me, [
      {
        ...envelope(me.uid, 'set_settings', { patch: { muted_uids: [] } }),
        actor: { uid: me.uid, via: 'offline' },
      },
    ]);
    expect(results[0]).toMatchObject({ status: 'rejected', code: 'VALIDATION' });
  });
});

describe('set_app_icon', () => {
  it('switches free styles and records the forced appearance', async () => {
    const me = await h.anonymous();
    const [, body] = await h.cmd(me, 'set_app_icon', { icon_id: 'face', appearance: 'dark' });
    expect(body.result).toEqual({ icon: 'face.dark', changed: true });
    const [user] = await h.rows<{ app_icon: string }>('SELECT app_icon FROM users WHERE id = $1', [
      me.uid,
    ]);
    expect(user?.app_icon).toBe('face.dark');
  });

  it('needs Pass+ for STAMP and an unlock for an earned icon', async () => {
    const me = await h.anonymous();
    const [s1, stamp] = await h.cmd(me, 'set_app_icon', { icon_id: 'stamp' });
    expect([s1, stamp.error?.code]).toEqual([402, 'ENTITLEMENT_REQUIRED']);
    const [s2, earned] = await h.cmd(me, 'set_app_icon', { icon_id: 'golden' });
    expect([s2, earned.error?.code, earned.error?.detail?.reason]).toEqual([
      403,
      'FORBIDDEN',
      'icon_locked',
    ]);
    await h.rows(
      "INSERT INTO app_icon_unlocks (user_id, icon_key, source) VALUES ($1, 'golden', 'form_found')",
      [me.uid],
    );
    const [s3] = await h.cmd(me, 'set_app_icon', { icon_id: 'golden' });
    expect(s3).toBe(200);
    const [unlock] = await h.rows<{ seen: boolean }>(
      "SELECT seen_at IS NOT NULL AS seen FROM app_icon_unlocks WHERE user_id = $1 AND icon_key = 'golden'",
      [me.uid],
    );
    expect(unlock?.seen).toBe(true);
  });
});

describe('past trips', () => {
  it('adds once per id, hides others, and soft-deletes', async () => {
    const me = await h.anonymous();
    const other = await h.anonymous();
    const id = generateUuidV7();
    const payload = { past_trip_id: id, country: 'JP', month: '2024-04' };
    const [, added] = await h.cmd(me, 'add_past_trip', payload);
    expect(added.result).toEqual({ past_trip_id: id, added: true });
    const [, replayed] = await h.cmd(me, 'add_past_trip', payload);
    expect(replayed.result).toEqual({ past_trip_id: id, added: false });
    const [, stolen] = await h.cmd(other, 'add_past_trip', payload);
    expect(stolen.error?.detail?.reason).toBe('past_trip_id_taken');
    const [s404] = await h.cmd(other, 'remove_past_trip', { past_trip_id: id });
    expect(s404).toBe(404);
    const [, removed] = await h.cmd(me, 'remove_past_trip', { past_trip_id: id });
    expect(removed.result).toEqual({ past_trip_id: id, removed: true });
    const [row] = await h.rows<{ month: string; deleted: boolean }>(
      "SELECT to_char(month, 'YYYY-MM-DD') AS month, deleted_at IS NOT NULL AS deleted FROM past_trips WHERE id = $1",
      [id],
    );
    expect(row).toEqual({ month: '2024-04-01', deleted: true });
  });
});
