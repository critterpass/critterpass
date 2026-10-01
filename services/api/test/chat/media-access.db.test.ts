/**
 * Read URLs for chat media: a photo or voice note attached to a crew chat message (and the
 * worker's derived copy) is readable by whoever can read the message: members and former members
 * who kept the chat, never outsiders, and never once moderation hid the message.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { authorizeReads } from '../../src/media/read-access';
import {
  chatCrew,
  runCommand,
  startChatHarness,
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

describe('chat media read access', () => {
  it('follows the message: crew and kept-chat readers yes, outsiders and hidden rows no', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors, 2);
    const [reader, leaver] = members as [(typeof members)[0], (typeof members)[0]];
    const outsider = await chat.doors.signInAnonymously();
    const key = await uploadedMedia(chat.doors, owner.uid, 'voice');
    const derived = await uploadedMedia(chat.doors, owner.uid, 'voice');
    const opId = generateUuidV7();
    const sent = await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, attachments: [{ media_key: key, kind: 'voice', duration_ms: 4000 }] },
      { opId },
    );
    expect(sent.status).toBe(200);
    await withSystem(chat.doors.pool, (tx) =>
      tx.query(
        `UPDATE messages SET attachments = jsonb_set(attachments, '{0,derived_key}', to_jsonb($2::text))
         WHERE id = $1`,
        [opId, derived],
      ),
    );
    await runCommand(chat.doors, leaver, 'leave_crew', { crew_id: crewId, keep_in_chat: true });

    const pool = chat.doors.pool;
    expect(await authorizeReads(pool, reader.uid, [key, derived])).toBe(true);
    expect(await authorizeReads(pool, leaver.uid, [key])).toBe(true);
    expect(await authorizeReads(pool, outsider.uid, [key])).toBe(false);

    await withSystem(pool, (tx) =>
      tx.query('UPDATE messages SET hidden_at = now() WHERE id = $1', [opId]),
    );
    expect(await authorizeReads(pool, reader.uid, [key])).toBe(false);
    expect(await authorizeReads(pool, owner.uid, [key])).toBe(true);
  });
});
