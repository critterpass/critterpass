/**
 * Critter stickers and critter reactions in the crew chat, through the real command doors against a
 * migrated Postgres: a member sends a sticker of a form they have met (stored as a `sticker` row
 * pointing at the form, pose in the body), never one they have not met, and reacts with any critter
 * of the published dex.
 */
import { withSystem } from '@cp/db';
import { generateUuidV7 } from '@cp/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { seedCritterContent } from '../critters/critters-fixture';
import { chatCrew, runCommand, sql, startChatHarness, type ChatHarness } from './chat-fixture';

let chat: ChatHarness;
let starter: string;
let rare: string;

beforeAll(async () => {
  chat = await startChatHarness();
  const approver = await chat.doors.signInAnonymously();
  const content = await withSystem(chat.doors.pool, (tx) => seedCritterContent(tx, approver.uid));
  starter = content.starter;
  rare = content.rare;
}, 240_000);

afterAll(async () => {
  await chat?.stop();
});

async function meet(uid: string, formId: string): Promise<void> {
  await withSystem(chat.doors.pool, (tx) =>
    tx.query(
      `INSERT INTO collection_entries (user_id, form_id, critter_id, found_at, source, verification)
       SELECT $1, f.id, f.critter_id, now(), 'encounter', 'pending' FROM critter_forms f WHERE f.id = $2`,
      [uid, formId],
    ),
  );
}

describe('sticker messages', () => {
  it('sends a sticker of a form the sender has met, pose in the body', async () => {
    const { crewId, owner } = await chatCrew(chat.doors);
    await meet(owner.uid, starter);
    const opId = generateUuidV7();
    const sent = await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, sticker: { form_id: starter, pose: 'cheer' } },
      { opId },
    );
    expect(sent.status).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT type, body, ref_kind, ref_id, attachments FROM messages WHERE id = $1',
        [opId],
      ),
    ).toEqual([
      {
        type: 'sticker',
        body: 'cheer',
        ref_kind: 'critter_form',
        ref_id: starter,
        attachments: [],
      },
    ]);
  });

  it('refuses a sticker of a form only someone else has met', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    await meet(members[0]!.uid, rare);
    for (const formId of [starter, rare]) {
      const sent = await runCommand(chat.doors, owner, 'send_message', {
        crew_id: crewId,
        sticker: { form_id: formId, pose: 'wave' },
      });
      expect(sent.status).toBe(403);
      expect(sent.body).toMatchObject({
        error: { code: 'FORBIDDEN', detail: { reason: 'sticker_not_met' } },
      });
    }
  });

  it('never lets a sticker be edited, and tombstones it like any message', async () => {
    const { crewId, owner } = await chatCrew(chat.doors);
    await meet(owner.uid, starter);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, sticker: { form_id: starter, pose: 'sleep' } },
      { opId },
    );
    const edited = await runCommand(chat.doors, owner, 'edit_message', {
      message_id: opId,
      body: 'cheer',
    });
    expect(edited.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
    const deleted = await runCommand(chat.doors, owner, 'delete_message', { message_id: opId });
    expect(deleted.status).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT body, deleted_at IS NOT NULL AS gone FROM messages WHERE id = $1',
        [opId],
      ),
    ).toEqual([{ body: '', gone: true }]);
  });
});

describe('critter reactions', () => {
  it('reacts with a critter of the dex and refuses one that does not exist', async () => {
    const { crewId, owner, members } = await chatCrew(chat.doors);
    const opId = generateUuidV7();
    await runCommand(
      chat.doors,
      owner,
      'send_message',
      { crew_id: crewId, body: 'sunset?' },
      { opId },
    );
    const react = (emoji: string) =>
      runCommand(chat.doors, members[0]!, 'react_message', { message_id: opId, emoji });
    expect((await react('c801.cheer')).body).toMatchObject({ result: { on: true } });
    const unknown = await react('c999.cheer');
    expect(unknown.body).toMatchObject({
      error: { code: 'VALIDATION', detail: { reason: 'unknown_critter' } },
    });
    expect(
      await sql(chat.doors, 'SELECT emoji FROM message_reactions WHERE message_id = $1', [opId]),
    ).toEqual([{ emoji: 'c801.cheer' }]);
  });
});
