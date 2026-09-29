/**
 * The crew chat screen over the real local-first stack with synced rows seeded locally: header
 * lines, day separators, the NEW divider, grouped bubbles, system rows and tombstones; sending
 * (queued at once, shown as sending), @mention autocomplete, the empty crew's "Say hi", the
 * former member's read-only bar, the offline banner and the first-sync skeleton.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

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
} from '../../test-support/chat-harness';
import { CrewChat } from '../chat-screen';

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
  it('shows the header, today, the NEW divider, grouped bubbles, system rows and tombstones', async () => {
    const s = await open();
    await seedCrew(s, { lastReadSeq: 2 });
    await seedMessage(s, { seq: 1, sender: null, refKind: 'member_joined', refId: LEO });
    await seedMessage(s, { seq: 2, sender: MAYA, body: 'who’s up for the spa on day 3?' });
    await seedMessage(s, { seq: 3, sender: LEO, body: 'me!' });
    await seedMessage(s, { seq: 4, sender: LEO, body: 'and sunset', edited: true });
    await seedMessage(s, { seq: 5, sender: MAYA, deleted: true });
    await renderChat(<CrewChat crewId={CREW} />, s);

    expect(await screen.findByText(/^the bali six$/iu)).toBeTruthy();
    expect(screen.getByText('3 people · Tokek is in this chat')).toBeTruthy();
    expect(await screen.findByText(/^today$/iu)).toBeTruthy();
    expect(screen.getByText('Leo joined the crew')).toBeTruthy();
    expect(screen.getByTestId('chat-unread-divider')).toBeTruthy();
    expect(screen.getByText('Message deleted')).toBeTruthy();
    // Leo's two messages form one run: his name shows once.
    expect(screen.getAllByText(/^leo$/iu)).toHaveLength(1);
    expect(screen.getByText(/^edited · /u)).toBeTruthy();
    expect(screen.getByLabelText(/^Maya, [^,]+: who’s up for the spa on day 3\?$/u)).toBeTruthy();
  });
});

describe('composer', () => {
  it('queues a send and shows it at once as sending', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'hi all' });
    await renderChat(<CrewChat crewId={CREW} />, s);
    await fireEvent.changeText(
      await screen.findByLabelText('Message, or @Tokek'),
      '  we made it!!  ',
    );
    await fireEvent.press(await screen.findByLabelText('Send'));
    expect(await screen.findByText('we made it!!')).toBeTruthy();
    expect(await screen.findByText('Sending')).toBeTruthy();
    expect(await queued(s, 'send_message')).toEqual([
      { crew_id: CREW, body: 'we made it!!', mentions: [], mentions_guide: false, attachments: [] },
    ]);
  });

  it('completes an @mention and sends the mentioned uid, and the guide flag for @Tokek', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'hi all' });
    await renderChat(<CrewChat crewId={CREW} />, s);
    const field = await screen.findByLabelText('Message, or @Tokek');
    await fireEvent.changeText(field, 'sunset? @ma');
    await fireEvent.press(await screen.findByLabelText('Mention Maya'));
    expect(screen.getByDisplayValue('sunset? @Maya ')).toBeTruthy();
    await fireEvent.changeText(field, 'sunset? @Maya @to');
    await fireEvent.press(await screen.findByLabelText('Mention Tokek'));
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(s, 'send_message')).toEqual([
        {
          crew_id: CREW,
          body: 'sunset? @Maya @Tokek',
          mentions: [MAYA],
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
    await renderChat(<CrewChat crewId={CREW} />, s);
    await fireEvent.changeText(
      await screen.findByLabelText('Message, or @Tokek'),
      'javascript:alert(1)',
    );
    await fireEvent.press(screen.getByLabelText('Send'));
    expect(await screen.findByText('Only http and https links can be sent.')).toBeTruthy();
    expect(await queued(s, 'send_message')).toEqual([]);
  });
});

describe('states', () => {
  it('greets a new crew and prefills a hello', async () => {
    const s = await open();
    await seedCrew(s);
    await seedMessage(s, { seq: 1, sender: null, refKind: 'member_joined', refId: LEO });
    await renderChat(<CrewChat crewId={CREW} />, s);
    expect(await screen.findByText(/^say hi to the crew$/iu)).toBeTruthy();
    await fireEvent.press(screen.getByText(/^say hi$/iu));
    expect(screen.getByDisplayValue('👋 ')).toBeTruthy();
  });

  it('gives a former member who kept the chat a read-only timeline', async () => {
    const s = await open();
    await seedCrew(s, { myStatus: 'former' });
    await seedMessage(s, { seq: 1, sender: MAYA, body: 'miss you' });
    await renderChat(<CrewChat crewId={CREW} />, s);
    expect(await screen.findByText('You left this crew')).toBeTruthy();
    expect(screen.getByText('miss you')).toBeTruthy();
    expect(screen.queryByTestId('chat-composer')).toBeNull();
  });
});
