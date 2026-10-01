/**
 * Crew chat commands through the real doors against a migrated Postgres: sending (seq, events,
 * realtime hint, attachments, jobs), duplicate op ids, rejects through the offline queue, edit
 * window and ownership, tombstones, reactions, the monotonic read marker, reports and mutes, and
 * server-assigned order under skewed device clocks and a replayed offline queue.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  chatCrew,
  runCommand,
  sendOp,
  sql,
  startChatHarness,
  upload,
  uploadedMedia,
  type ChatHarness,
} from './chat-fixture';

let chat: ChatHarness;

beforeAll(async () => {
  chat = await startChatHarness();
}, 240_000);

afterAll(async () => {
  await chat?.stop();
});

const HOUR_MS = 60 * 60 * 1000;

async function userSeqs(crewId: string): Promise<{ id: string; seq: number }[]> {
  const rows = await sql<{ id: string; seq: string }>(
    chat.doors,
    "SELECT id, seq FROM messages WHERE crew_id = $1 AND sender_kind = 'user' ORDER BY seq",
    [crewId],
  );
  return rows.map((row) => ({ id: row.id, seq: Number(row.seq) }));
}

describe('send_message', () => {
  it('stores the op id as the message id, assigns seq and hints the crew', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    const sent = await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: ' Hi @Maya ', mentions: [members[0]!.uid] },
      { opId },
    );
    expect(sent.status).toBe(200);
    const result = sent.body['result'] as { message_id: string; seq: number };
    expect(result.message_id).toBe(opId);
    const [row] = await sql<{ body: string; type: string; seq: string; mentions: string[] }>(
      chat.doors,
      'SELECT body, type, seq, mentions FROM messages WHERE id = $1',
      [opId],
    );
    expect(row).toMatchObject({ body: 'Hi @Maya', type: 'text', mentions: [members[0]!.uid] });
    expect(Number(row!.seq)).toBe(result.seq);
    expect(
      await sql(chat.doors, 'SELECT type FROM domain_events WHERE aggregate_id = $1 ORDER BY id', [
        opId,
      ]),
    ).toEqual([{ type: 'chat.message_sent' }]);
    const hints = await sql<{ channel: string; payload: { type: string } }>(
      chat.doors,
      "SELECT channel, payload FROM rt_outbox WHERE channel = $1 AND payload->'data'->>'message_id' = $2",
      [`crew_chat:${crewId}`, opId],
    );
    expect(hints.map((hint) => hint.payload.type)).toEqual(['message.created']);
  });

  it('rejects an outsider through the offline queue with 2xx and a cmd_results row', async () => {
    const { crewId } = await chatCrew(chat.doors);
    const outsider = await chat.doors.signInAnonymously();
    const op = sendOp(outsider, { crew_id: crewId, body: 'let me in' });
    const response = await upload(chat.doors, outsider, [op]);
    expect(response.status).toBe(200);
    expect(response.results).toEqual([
      expect.objectContaining({ op_id: op.op_id, status: 'rejected', code: 'NOT_FOUND' }),
    ]);
    expect(
      await sql(chat.doors, 'SELECT status FROM cmd_results WHERE op_id = $1', [op.op_id]),
    ).toEqual([{ status: 'rejected' }]);
    expect(await userSeqs(crewId)).toEqual([]);
  });

  it('keeps a former member read-only', async () => {
    const { crewId, members } = await chatCrew(chat.doors);
    const leaver = members[0]!;
    expect(
      (await runCommand(chat.doors, leaver, 'leave_crew', { crew_id: crewId, keep_in_chat: true }))
        .status,
    ).toBe(200);
    const sent = await runCommand(chat.doors, leaver, 'send_message', {
      crew_id: crewId,
      body: 'still here?',
    });
    expect(sent.status).toBe(403);
    expect(sent.body).toMatchObject({
      error: { code: 'FORBIDDEN', detail: { reason: 'read_only' } },
    });
  });

  it('refuses unsafe links, strangers as mentions and replies to another crew', async () => {
    const { crewId, owner } = await chatCrew(chat.doors);
    const other = await chatCrew(chat.doors);
    const stranger = await chat.doors.signInAnonymously();
    const unsafe = await runCommand(chat.doors, owner, 'send_message', {
      crew_id: crewId,
      body: 'tap javascript:alert(1)',
    });
    expect(unsafe.body).toMatchObject({
      error: { code: 'VALIDATION', detail: { reason: 'unsafe_link' } },
    });
    const mention = await runCommand(chat.doors, owner, 'send_message', {
      crew_id: crewId,
      body: 'hey',
      mentions: [stranger.uid],
    });
    expect(mention.body).toMatchObject({ error: { detail: { reason: 'mention_not_member' } } });
    const theirs = await runCommand(chat.doors, other.owner, 'send_message', {
      crew_id: other.crewId,
      body: 'ours',
    });
    const reply = await runCommand(chat.doors, owner, 'send_message', {
      crew_id: crewId,
      body: 'cross-crew reply',
      reply_to: (theirs.body['result'] as { message_id: string }).message_id,
    });
    expect(reply.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });

  it('sends a photo from the sender’s own upload, enqueues its thumbnail and refuses a foreign key', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const key = await uploadedMedia(chat.doors, owner.uid, 'photo');
    const opId = generateUuidV7();
    const sent = await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, attachments: [{ media_key: key, kind: 'photo', w: 800, h: 600 }] },
      { opId },
    );
    expect(sent.status).toBe(200);
    const [row] = await sql<{ type: string; attachments: { media_key: string; w: number }[] }>(
      chat.doors,
      'SELECT type, attachments FROM messages WHERE id = $1',
      [opId],
    );
    expect(row).toMatchObject({ type: 'photo', attachments: [{ media_key: key, w: 800 }] });
    expect(
      await sql(chat.doors, 'SELECT name FROM pgboss.job WHERE singleton_key = $1', [opId]),
    ).toEqual([{ name: 'chat.photo_thumbnail' }]);

    const foreign = await runCommand(chat.doors, members[0]!, 'send_message', {
      crew_id: crewId,
      attachments: [{ media_key: key, kind: 'photo' }],
    });
    expect(foreign.body).toMatchObject({
      error: { code: 'NOT_FOUND', detail: { reason: 'attachment' } },
    });
  });

  it('files a guide mention for the guide’s reply', async () => {
    const { crewId, owner } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: '@Tokek where for dinner?', mentions_guide: true },
      { opId },
    );
    expect(
      await sql(chat.doors, 'SELECT type FROM domain_events WHERE aggregate_id = $1 ORDER BY id', [
        opId,
      ]),
    ).toEqual([{ type: 'chat.message_sent' }, { type: 'chat.guide_mentioned' }]);
  });
});

describe('order', () => {
  it('numbers messages gap-free in server receive order despite skewed clocks and a replayed queue', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const ahead = owner;
    const behind = members[0]!;
    const now = Date.now();
    const a1 = sendOp(
      ahead,
      { crew_id: crewId, body: 'a1' },
      { clientTs: new Date(now + HOUR_MS) },
    );
    const offline = [1, 2, 3].map((n) =>
      sendOp(behind, { crew_id: crewId, body: `b${n}` }, { clientTs: new Date(now - HOUR_MS + n) }),
    );
    const a2 = sendOp(
      ahead,
      { crew_id: crewId, body: 'a2' },
      { clientTs: new Date(now + HOUR_MS) },
    );

    await upload(chat.doors, ahead, [a1]);
    const first = await upload(chat.doors, behind, offline);
    expect(first.results.map((result) => result.status)).toEqual(['applied', 'applied', 'applied']);
    await upload(chat.doors, ahead, [a2]);
    // The queue is replayed after a lost response: nothing is added and nothing moves.
    const replay = await upload(chat.doors, behind, offline);
    expect(replay.results.map((result) => result.status)).toEqual([
      'duplicate',
      'duplicate',
      'duplicate',
    ]);

    const rows = await userSeqs(crewId);
    expect(rows.map((row) => row.id)).toEqual([
      a1.op_id,
      ...offline.map((op) => op.op_id),
      a2.op_id,
    ]);
    const all = await sql<{ seq: string }>(
      chat.doors,
      'SELECT seq FROM messages WHERE crew_id = $1 ORDER BY seq',
      [crewId],
    );
    expect(all.map((row) => Number(row.seq))).toEqual(all.map((_, index) => index + 1));
  });
});

describe('edit and delete', () => {
  it('lets only the sender edit within the window, then refuses with STATE_INVALID', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: 'typo' },
      { opId },
    );
    const other = await runCommand(chat.doors, members[0]!, 'edit_message', {
      message_id: opId,
      body: 'not yours',
    });
    expect(other.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    const own = await runCommand(chat.doors, owner, 'edit_message', {
      message_id: opId,
      body: 'fixed',
    });
    expect(own.status).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT body, edited_at IS NOT NULL AS edited FROM messages WHERE id = $1',
        [opId],
      ),
    ).toEqual([{ body: 'fixed', edited: true }]);

    await withSystem(chat.doors.pool, (tx) =>
      tx.query("UPDATE messages SET created_at = now() - interval '16 minutes' WHERE id = $1", [
        opId,
      ]),
    );
    const late = await runCommand(chat.doors, owner, 'edit_message', {
      message_id: opId,
      body: 'too late',
    });
    expect(late.status).toBe(409);
    expect(late.body).toMatchObject({
      error: { code: 'STATE_INVALID', detail: { reason: 'edit_window_closed' } },
    });
  });

  it('tombstones the sender’s message at any age and refuses anyone else', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const key = await uploadedMedia(chat.doors, owner.uid, 'photo');
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: 'look', attachments: [{ media_key: key, kind: 'photo' }] },
      { opId },
    );
    const organiserOfNothing = await runCommand(chat.doors, members[0]!, 'delete_message', {
      message_id: opId,
    });
    expect(organiserOfNothing.body).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(
      (await runCommand(chat.doors, owner, 'delete_message', { message_id: opId })).status,
    ).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT body, attachments, deleted_at IS NOT NULL AS deleted FROM messages WHERE id = $1',
        [opId],
      ),
    ).toEqual([{ body: '', attachments: [], deleted: true }]);
  });
});

describe('reactions, read marker, reports and mutes', () => {
  it('toggles a reaction per user and emoji', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: 'beach?' },
      { opId },
    );
    const react = (on?: boolean) =>
      runCommand(chat.doors, members[0]!, 'react_message', {
        message_id: opId,
        emoji: '🔥',
        ...(on === undefined ? {} : { on }),
      });
    expect((await react()).body).toMatchObject({ result: { on: true } });
    expect((await react(true)).body).toMatchObject({ result: { on: true } });
    expect(
      await sql(chat.doors, 'SELECT emoji FROM message_reactions WHERE message_id = $1', [opId]),
    ).toEqual([{ emoji: '🔥' }]);
    expect((await react()).body).toMatchObject({ result: { on: false } });
    expect(
      await sql(chat.doors, 'SELECT emoji FROM message_reactions WHERE message_id = $1', [opId]),
    ).toEqual([]);
  });

  it('moves the read marker forward only, clamped to the last message', async () => {
    const { crewId, owner } = await chatCrew(chat.doors, 0);
    for (const body of ['one', 'two', 'three']) {
      await runCommand(chat.doors, owner, 'send_message', { crew_id: crewId, body });
    }
    const mark = async (seq: number) =>
      (await runCommand(chat.doors, owner, 'mark_read', { crew_id: crewId, seq })).body['result'];
    expect(await mark(2)).toEqual({ crew_id: crewId, last_read_seq: 2 });
    expect(await mark(1)).toEqual({ crew_id: crewId, last_read_seq: 2 });
    expect(await mark(99)).toEqual({ crew_id: crewId, last_read_seq: 3 });
  });

  it('files a message report for the ops queue and never lets you report yourself', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: 'rude' },
      { opId },
    );
    const self = await runCommand(chat.doors, owner, 'report_message', {
      message_id: opId,
      reason: 'harassment',
    });
    expect(self.body).toMatchObject({ error: { code: 'VALIDATION' } });
    const report = await runCommand(chat.doors, members[0]!, 'report_message', {
      message_id: opId,
      reason: 'harassment',
    });
    expect(report.status).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT target_kind, reason, author_id FROM moderation_reports WHERE target_id = $1',
        [opId],
      ),
    ).toEqual([{ target_kind: 'message', reason: 'harassment', author_id: owner.uid }]);
  });

  it('mutes and unmutes a crewmate in the caller’s own settings', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const target = members[0]!.uid;
    await runCommand(chat.doors, owner, 'mute_member', {
      crew_id: crewId,
      uid: target,
      muted: true,
    });
    await runCommand(chat.doors, owner, 'mute_member', {
      crew_id: crewId,
      uid: target,
      muted: true,
    });
    expect(
      await sql(chat.doors, 'SELECT muted_uids FROM user_settings WHERE user_id = $1', [owner.uid]),
    ).toEqual([{ muted_uids: [target] }]);
    await runCommand(chat.doors, owner, 'mute_member', {
      crew_id: crewId,
      uid: target,
      muted: false,
    });
    expect(
      await sql(chat.doors, 'SELECT muted_uids FROM user_settings WHERE user_id = $1', [owner.uid]),
    ).toEqual([{ muted_uids: [] }]);
  });
});
