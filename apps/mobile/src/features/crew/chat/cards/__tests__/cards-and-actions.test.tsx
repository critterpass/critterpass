/**
 * The card registry and message actions in the premium chat on the real local-first stack: a card
 * type registered by another feature renders without any chat change, a type nobody registered
 * shows the "needs a newer app" card, and every action from a message's long-press menu queues the
 * right command (react, reply, copy, edit, delete, report with mute).
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert, Text, View, type AlertButton } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewChatView } from '../../../premium/chat/crew-chat-view';
import {
  CREW,
  MAYA,
  queued,
  renderChat,
  seedCrew,
  seedMessage,
} from '../../test-support/chat-harness';
import { registerPremiumChatCard } from '../../../premium/chat/cards/registry';

let stack: TestLocalFirst | null = null;

beforeEach(() => {
  // Jest's native View never answers `measureInWindow`; the held message measures where a phone
  // would put it, so the long-press menu opens over it.
  jest
    .spyOn(View.prototype as unknown as { measureInWindow: () => void }, 'measureInWindow')
    .mockImplementation(((done: (x: number, y: number, w: number, h: number) => void) =>
      done(16, 300, 220, 44)) as () => void);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

async function chatWith(messages: ((uid: string) => Parameters<typeof seedMessage>[1])[]) {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  const ids: string[] = [];
  for (const message of messages) ids.push(await seedMessage(stack, message(stack.uid)));
  await renderChat(<CrewChatView crewId={CREW} />, stack);
  return { s: stack, ids };
}

const fromMaya = (body: string) => () => ({ seq: 1, sender: MAYA, body });

/** Holds the message showing `body` and waits for its menu. */
async function hold(body: string) {
  await fireEvent(await screen.findByText(body), 'longPress');
  return screen.findByTestId('chat-message-menu');
}

describe('card registry', () => {
  it('renders a registered card type without touching the chat', async () => {
    const stop = registerPremiumChatCard('poll', {
      render: (message) => <Text>{`POLL CARD ${message.body}`}</Text>,
    });
    try {
      await chatWith([() => ({ seq: 1, sender: MAYA, type: 'poll', body: 'spa on day 3?' })]);
      expect(await screen.findByText('POLL CARD spa on day 3?')).toBeTruthy();
    } finally {
      stop();
    }
  });

  it('falls back to the update card for a type nobody registered', async () => {
    await chatWith([() => ({ seq: 1, sender: MAYA, type: 'boost_card', body: '{}' })]);
    expect(await screen.findByText('This message needs a newer CritterPass')).toBeTruthy();
  });
});

describe('message actions', () => {
  it('reacts from the menu’s reaction bar', async () => {
    const { s, ids } = await chatWith([fromMaya('beach?')]);
    await hold('beach?');
    await fireEvent.press(screen.getByTestId('chat-react-🔥'));
    await waitFor(async () =>
      expect(await queued(s, 'react_message')).toEqual([
        { message_id: ids[0], emoji: '🔥', on: true },
      ]),
    );
    expect(screen.queryByTestId('chat-message-menu')).toBeNull();
  });

  it('replies with a quote and sends reply_to', async () => {
    const { s, ids } = await chatWith([fromMaya('dinner at 8?')]);
    await hold('dinner at 8?');
    await fireEvent.press(screen.getByTestId('chat-action-reply'));
    expect(await screen.findByText(/^Replying to Maya/u)).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'yes!');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(s, 'send_message')).toEqual([
        {
          crew_id: CREW,
          body: 'yes!',
          mentions: [],
          mentions_guide: false,
          attachments: [],
          reply_to: ids[0],
        },
      ]),
    );
    expect(screen.queryByText(/^Replying to Maya/u)).toBeNull();
  });

  it('copies the text', async () => {
    const copy = jest.spyOn(Clipboard, 'setStringAsync').mockResolvedValue(true);
    await chatWith([fromMaya('Jl. Raya 12')]);
    await hold('Jl. Raya 12');
    await fireEvent.press(screen.getByTestId('chat-action-copy'));
    expect(copy).toHaveBeenCalledWith('Jl. Raya 12');
  });

  it('edits the member’s own recent message through the composer', async () => {
    const { s, ids } = await chatWith([(uid) => ({ seq: 1, sender: uid, body: 'see you at 7' })]);
    await hold('see you at 7');
    await fireEvent.press(screen.getByTestId('chat-action-edit'));
    expect(await screen.findByDisplayValue('see you at 7')).toBeTruthy();
    expect(screen.getByText('Editing')).toBeTruthy();
    await fireEvent.changeText(screen.getByTestId('chat-input'), 'see you at 8');
    await fireEvent.press(screen.getByLabelText('Send'));
    await waitFor(async () =>
      expect(await queued(s, 'edit_message')).toEqual([
        { message_id: ids[0], body: 'see you at 8' },
      ]),
    );
    expect(await queued(s, 'send_message')).toEqual([]);
  });

  it('deletes the member’s own message after confirming', async () => {
    // The system dialog is native; its destructive choice is pressed as the member would.
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      (buttons as AlertButton[] | undefined)?.find((b) => b.style === 'destructive')?.onPress?.();
    });
    const { s, ids } = await chatWith([
      (uid) => ({ seq: 1, sender: uid, body: 'oops', createdAt: '2026-01-01T00:00:00Z' }),
    ]);
    await hold('oops');
    // Past the edit window: no Edit.
    expect(screen.queryByTestId('chat-action-edit')).toBeNull();
    await fireEvent.press(screen.getByTestId('chat-action-delete'));
    expect(alert).toHaveBeenCalledTimes(1);
    await waitFor(async () =>
      expect(await queued(s, 'delete_message')).toEqual([{ message_id: ids[0] }]),
    );
  });

  it('keeps the message when the member backs out of deleting it', async () => {
    jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
      (buttons as AlertButton[] | undefined)?.find((b) => b.style === 'cancel')?.onPress?.();
    });
    const { s } = await chatWith([(uid) => ({ seq: 1, sender: uid, body: 'keep me' })]);
    await hold('keep me');
    await fireEvent.press(screen.getByTestId('chat-action-delete'));
    expect(await queued(s, 'delete_message')).toEqual([]);
  });

  it('reports a crewmate’s message and mutes them with it', async () => {
    const { s, ids } = await chatWith([fromMaya('rude')]);
    await hold('rude');
    expect(screen.queryByTestId('chat-action-edit')).toBeNull();
    expect(screen.queryByTestId('chat-action-delete')).toBeNull();
    await fireEvent.press(screen.getByTestId('chat-action-report'));
    await fireEvent.press(await screen.findByTestId('chat-report-harassment'));
    await fireEvent.press(screen.getByLabelText(/^Also mute Maya/u));
    await fireEvent.press(screen.getByTestId('chat-report-send'));
    await waitFor(async () => {
      expect(await queued(s, 'report_message')).toEqual([
        { message_id: ids[0], reason: 'harassment' },
      ]);
      expect(await queued(s, 'mute_member')).toEqual([{ crew_id: CREW, uid: MAYA, muted: true }]);
    });
  });

  it('reports without muting unless the member asks to', async () => {
    const { s, ids } = await chatWith([fromMaya('spam link')]);
    await hold('spam link');
    await fireEvent.press(screen.getByTestId('chat-action-report'));
    await fireEvent.press(await screen.findByTestId('chat-report-spam'));
    await fireEvent.press(screen.getByTestId('chat-report-send'));
    await waitFor(async () =>
      expect(await queued(s, 'report_message')).toEqual([{ message_id: ids[0], reason: 'spam' }]),
    );
    expect(await queued(s, 'mute_member')).toEqual([]);
  });
});
