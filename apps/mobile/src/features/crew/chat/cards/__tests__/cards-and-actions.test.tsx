/**
 * The card registry and message actions on the real local-first stack: a card type registered by
 * another feature renders without any chat change, a type nobody registered shows the "needs a
 * newer app" card, and every action from a message's sheet queues the right command (react,
 * reply, copy, edit, delete, report with mute, mute).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Text } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewChat } from '../../components/chat-screen';
import {
  CREW,
  MAYA,
  queued,
  renderChat,
  seedCrew,
  seedMessage,
} from '../../test-support/chat-harness';
import { registerChatCard } from '../registry';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function chatWith(messages: Parameters<typeof seedMessage>[1][]) {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  const ids: string[] = [];
  for (const message of messages) ids.push(await seedMessage(stack, message));
  await renderChat(<CrewChat crewId={CREW} />, stack);
  return { s: stack, ids };
}

const action = (element: Parameters<typeof fireEvent>[0], actionName: string) =>
  fireEvent(element, 'accessibilityAction', { nativeEvent: { actionName } });

async function openActions(label: RegExp) {
  await action(await screen.findByLabelText(label), 'actions');
  return screen.findByTestId('chat-actions');
}

describe('card registry', () => {
  it('renders a registered card type without touching the chat', async () => {
    const stop = registerChatCard('poll', {
      Component: ({ message }) => <Text>{`POLL CARD ${message.body}`}</Text>,
      estimateHeight: () => 120,
      a11yLabel: (message) => `Poll: ${message.body}`,
    });
    try {
      await chatWith([{ seq: 1, sender: MAYA, type: 'poll', body: 'spa on day 3?' }]);
      expect(await screen.findByText('POLL CARD spa on day 3?')).toBeTruthy();
    } finally {
      stop();
    }
  });

  it('falls back to the update card for a type nobody registered', async () => {
    await chatWith([{ seq: 1, sender: MAYA, type: 'boost_card', body: '{}' }]);
    expect(await screen.findByText('This message needs a newer CritterPass')).toBeTruthy();
  });
});

describe('message actions', () => {
  it('reacts from the emoji bar', async () => {
    const { s, ids } = await chatWith([{ seq: 1, sender: MAYA, body: 'beach?' }]);
    await openActions(/^Maya, [^,]+: beach\?$/u);
    await fireEvent.press(screen.getByLabelText('React with 🔥'));
    await waitFor(async () =>
      expect(await queued(s, 'react_message')).toEqual([
        { message_id: ids[0], emoji: '🔥', on: true },
      ]),
    );
  });

  it('replies with a quote and sends reply_to', async () => {
    const { s, ids } = await chatWith([{ seq: 1, sender: MAYA, body: 'dinner at 8?' }]);
    await action(await screen.findByLabelText(/^Maya, [^,]+: dinner at 8\?$/u), 'reply');
    expect(await screen.findByTestId('chat-replying')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message, or @Tokek'), 'yes!');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(s, 'send_message')).toEqual([
        {
          crew_id: CREW,
          body: 'yes!',
          mentions: [],
          mentions_guide: false,
          reply_to: ids[0],
          attachments: [],
        },
      ]),
    );
  });

  it('copies the text', async () => {
    const copy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    await chatWith([{ seq: 1, sender: MAYA, body: 'Jl. Raya 12' }]);
    await openActions(/^Maya, [^,]+: Jl\. Raya 12$/u);
    await fireEvent.press(screen.getByText('Copy text'));
    expect(copy).toHaveBeenCalledWith('Jl. Raya 12');
  });

  it('edits the member’s own recent message through the composer', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    const id = await seedMessage(stack, { seq: 1, sender: stack.uid, body: 'see you at 7' });
    await renderChat(<CrewChat crewId={CREW} />, stack);
    await openActions(/^You, [^,]+: see you at 7$/u);
    await fireEvent.press(screen.getByText('Edit'));
    expect(await screen.findByDisplayValue('see you at 7')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Message, or @Tokek'), 'see you at 8');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(stack!, 'edit_message')).toEqual([
        { message_id: id, body: 'see you at 8' },
      ]),
    );
  });

  it('deletes the member’s own message after confirming', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    await seedCrew(stack);
    const id = await seedMessage(stack, {
      seq: 1,
      sender: stack.uid,
      body: 'oops',
      createdAt: '2026-01-01T00:00:00Z',
    });
    await renderChat(<CrewChat crewId={CREW} />, stack);
    await openActions(/^You, [^,]+: oops$/u);
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByText('Delete for everyone'));
    await fireEvent.press(await screen.findByText(/^delete$/iu));
    await waitFor(async () =>
      expect(await queued(stack!, 'delete_message')).toEqual([{ message_id: id }]),
    );
  });

  it('reports a crewmate’s message and mutes them with it', async () => {
    const { s, ids } = await chatWith([{ seq: 1, sender: MAYA, body: 'rude' }]);
    await openActions(/^Maya, [^,]+: rude$/u);
    expect(screen.queryByText('Edit')).toBeNull();
    await fireEvent.press(screen.getByText('Report'));
    await fireEvent.press(await screen.findByText('Bullying or harassment'));
    await fireEvent(screen.getByLabelText('Also mute Maya'), 'valueChange', true);
    await fireEvent.press(screen.getByTestId('chat-report-send'));
    await waitFor(async () => {
      expect(await queued(s, 'report_message')).toEqual([
        { message_id: ids[0], reason: 'harassment' },
      ]);
      expect(await queued(s, 'mute_member')).toEqual([{ crew_id: CREW, uid: MAYA, muted: true }]);
    });
  });

  it('mutes a crewmate after confirming', async () => {
    const { s } = await chatWith([{ seq: 1, sender: MAYA, body: 'hi' }]);
    await openActions(/^Maya, [^,]+: hi$/u);
    await fireEvent.press(screen.getByText('Mute Maya'));
    await fireEvent.press(await screen.findByText(/^mute$/iu));
    await waitFor(async () =>
      expect(await queued(s, 'mute_member')).toEqual([{ crew_id: CREW, uid: MAYA, muted: true }]),
    );
  });
});
