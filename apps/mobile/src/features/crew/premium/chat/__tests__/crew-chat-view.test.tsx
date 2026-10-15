/**
 * The premium crew chat over the real local-first stack with synced rows seeded locally: the
 * header lines, grouped bubbles, system rows, edits and tombstones; sending (queued at once and
 * shown waiting), the guide flag for @tokek, an unsafe link refused before queuing; the brand-new
 * crew's starters, a crew of one's invite, and the former member's read-only timeline.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../../chat/test-support/flash-list-double'));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import {
  CREW,
  LEO,
  MAYA,
  queued,
  renderChat,
  seedCrew,
  seedMessage,
} from '../../../chat/test-support/chat-harness';
import { CrewChatView } from '../crew-chat-view';

let stack: TestLocalFirst | null = null;

async function open(): Promise<TestLocalFirst> {
  stack = await openTestLocalFirst({ holdUploads: true });
  return stack;
}

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('timeline', () => {
  it('shows the header, grouped bubbles, system rows, edits and tombstones', async () => {
    const s = await open();
    await seedCrew(s, { lastReadSeq: 2 });
    await seedMessage(s, { seq: 1, sender: null, refKind: 'member_joined', refId: LEO });
    await seedMessage(s, { seq: 2, sender: MAYA, body: 'who’s up for the spa on day 3?' });
    await seedMessage(s, { seq: 3, sender: LEO, body: 'me!' });
    await seedMessage(s, { seq: 4, sender: LEO, body: 'and sunset', edited: true });
    await seedMessage(s, { seq: 5, sender: MAYA, deleted: true });
    await renderChat(<CrewChatView crewId={CREW} />, s);

    expect(await screen.findByText(/^the bali six$/iu)).toBeTruthy();
    expect(await screen.findByText('3 people · Tokek’s in here')).toBeTruthy();
    expect(await screen.findByText('Leo joined the crew')).toBeTruthy();
    expect(screen.getByText('who’s up for the spa on day 3?')).toBeTruthy();
    expect(screen.getByText('Message deleted')).toBeTruthy();
    // Leo's two messages form one run: his name shows once.
    expect(screen.getAllByText(/^leo$/iu)).toHaveLength(1);
    expect(screen.getByText('(edited)')).toBeTruthy();
  });
});

describe('composer', () => {
  it('queues a send and shows it at once, waiting for signal', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'hi all' });
    await renderChat(<CrewChatView crewId={CREW} />, s);
    await fireEvent.changeText(await screen.findByTestId('chat-input'), '  we made it!!  ');
    await fireEvent.press(await screen.findByLabelText('Send'));
    expect(await screen.findByText('we made it!!')).toBeTruthy();
    expect(await screen.findByText('Waiting for signal')).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.value).toBe('');
    expect(await queued(s, 'send_message')).toEqual([
      { crew_id: CREW, body: 'we made it!!', mentions: [], mentions_guide: false, attachments: [] },
    ]);
  });

  it('flags a message that calls @tokek for the guide', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'hi all' });
    await renderChat(<CrewChatView crewId={CREW} />, s);
    await fireEvent.changeText(await screen.findByTestId('chat-input'), 'sunset? @Tokek');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(s, 'send_message')).toEqual([
        {
          crew_id: CREW,
          body: 'sunset? @Tokek',
          mentions: [],
          mentions_guide: true,
          attachments: [],
        },
      ]),
    );
  });

  it('refuses an unsafe link before queuing', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'hi' });
    await renderChat(<CrewChatView crewId={CREW} />, s);
    await fireEvent.changeText(await screen.findByTestId('chat-input'), 'javascript:alert(1)');
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(screen.queryByText('javascript:alert(1)')).toBeNull();
    expect(await queued(s, 'send_message')).toEqual([]);
  });
});

describe('states', () => {
  it('greets a new crew and fills the composer from a starter', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: null, refKind: 'member_joined', refId: LEO });
    await renderChat(<CrewChatView crewId={CREW} />, s);
    expect(await screen.findByTestId('chat-welcome')).toBeTruthy();
    expect(screen.getByText('The Bali Six is on')).toBeTruthy();
    expect(screen.getByTestId('chat-input').props.accessibilityHint).toBe('Say hi to the crew');
    expect(screen.getByText('Say hi to the crew', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByTestId('chat-starter-invite')).toBeNull();
    await fireEvent.press(screen.getByTestId('chat-starter-free'));
    expect(screen.getByDisplayValue('@tokek when is everyone free?')).toBeTruthy();
  });

  it('offers a crew of one the way to invite friends', async () => {
    const s = await open();
    await seedCrew(s);
    await s.db.execute('DELETE FROM crew_members WHERE user_id <> ?', [s.uid]);
    await renderChat(<CrewChatView crewId={CREW} />, s);
    await fireEvent.press(await screen.findByTestId('chat-starter-invite'));
    expect(router.push).toHaveBeenCalledWith(`/crew/${CREW}/invite`);
  });

  it('gives a former member who kept the chat a read-only timeline', async () => {
    const s = await open();
    await seedCrew(s, { myStatus: 'former' });
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'miss you' });
    await renderChat(<CrewChatView crewId={CREW} />, s);
    expect(await screen.findByTestId('chat-former-bar')).toBeTruthy();
    expect(screen.getByText('Read only')).toBeTruthy();
    expect(await screen.findByText('miss you')).toBeTruthy();
    expect(screen.queryByTestId('chat-composer')).toBeNull();
  });
});
