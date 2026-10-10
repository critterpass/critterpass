/**
 * A former member who kept the crew chat, through the real command doors: asking to rejoin posts
 * one "would like to rejoin" line a day for the organisers, removing the chat turns their
 * keep-in-chat off, and neither is open to active members or strangers.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { chatCrew, runCommand, sql, startChatHarness, type ChatHarness } from './chat-fixture';

let chat: ChatHarness;

beforeAll(async () => {
  chat = await startChatHarness();
}, 240_000);

afterAll(async () => {
  await chat?.stop();
});

async function formerCrew() {
  const crew = await chatCrew(chat.doors, 2);
  const leaver = crew.members[0]!;
  await runCommand(chat.doors, leaver, 'leave_crew', { crew_id: crew.crewId, keep_in_chat: true });
  return { ...crew, leaver };
}

describe('ask_to_rejoin', () => {
  it('posts one rejoin line a day in the crew chat', async () => {
    const { crewId, leaver } = await formerCrew();
    const first = await runCommand(chat.doors, leaver, 'ask_to_rejoin', { crew_id: crewId });
    expect(first.body).toMatchObject({ result: { asked: true } });
    const again = await runCommand(chat.doors, leaver, 'ask_to_rejoin', { crew_id: crewId });
    expect(again.body).toMatchObject({ result: { asked: false } });
    expect(
      await sql(
        chat.doors,
        "SELECT ref_id FROM messages WHERE crew_id = $1 AND ref_kind = 'rejoin_asked'",
        [crewId],
      ),
    ).toEqual([{ ref_id: leaver.uid }]);
  });

  it('is not for active members or strangers', async () => {
    const { crewId, members } = await formerCrew();
    const active = await runCommand(chat.doors, members[1]!, 'ask_to_rejoin', { crew_id: crewId });
    expect(active.body).toMatchObject({ error: { code: 'STATE_INVALID' } });
    const stranger = await chat.doors.signInAnonymously();
    const outside = await runCommand(chat.doors, stranger, 'ask_to_rejoin', { crew_id: crewId });
    expect(outside.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});

describe('remove_kept_chat', () => {
  it('turns the former member’s keep-in-chat off', async () => {
    const { crewId, leaver } = await formerCrew();
    const removed = await runCommand(chat.doors, leaver, 'remove_kept_chat', { crew_id: crewId });
    expect(removed.status).toBe(200);
    expect(
      await sql(
        chat.doors,
        'SELECT status, keep_in_chat FROM crew_members WHERE crew_id = $1 AND user_id = $2',
        [crewId, leaver.uid],
      ),
    ).toEqual([{ status: 'former', keep_in_chat: false }]);
    const later = await runCommand(chat.doors, leaver, 'ask_to_rejoin', { crew_id: crewId });
    expect(later.body).toMatchObject({ error: { code: 'NOT_FOUND' } });
  });
});
