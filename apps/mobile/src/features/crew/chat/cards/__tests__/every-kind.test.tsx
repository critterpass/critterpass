/**
 * Every kind of message the crew chat draws itself or through its own cards shows something, on
 * the real local-first stack, with the shapes a real crew chat holds: member text, the guide's
 * text, a member joining (an empty body; the name comes from the member the row points at), a
 * voice note and a photo as stored (the original key only, no length, no thumbnail yet). Any card
 * still loading sits in a slot of real width. The expense and proposal cards have their own tests
 * in their areas.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- FlashList cannot run under Jest; see the double's header
jest.mock('@shopify/flash-list', () => require('../../test-support/flash-list-double'));

import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { screen, within } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';
import { Skeleton } from '@/ui/states/Skeleton';

import { CrewChat } from '../../components/chat-screen';
import '../../media/register';
import {
  CREW,
  LEO,
  MAYA,
  renderChat,
  seedCrew,
  seedMessage,
} from '../../test-support/chat-harness';
import { deviceDouble, recordedMediaApi } from '../../test-support/media-doubles';
import { ChatMediaProvider } from '../../media/media-services';
import { registerChatCard } from '../registry';

let stack: TestLocalFirst | null = null;

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

describe('every kind of crew chat message', () => {
  it('draws each of them, never an empty bubble', async () => {
    stack = await openTestLocalFirst({ holdUploads: true });
    const s = stack;
    await seedCrew(s);
    let seq = 0;
    const add = (message: Omit<Parameters<typeof seedMessage>[1], 'seq'>) =>
      seedMessage(s, { ...message, seq: (seq += 1) });
    await add({ sender: null, kind: 'system', refKind: 'member_joined', refId: LEO });
    await add({ sender: MAYA, body: 'who is up for the beach?' });
    await add({ sender: null, kind: 'guide', body: 'Mỹ Khê is calm until four.' });
    const voice = await add({
      sender: MAYA,
      type: 'voice',
      attachments: [
        { kind: 'voice', media_id: 'm-1', media_key: `u/${MAYA}/voice/1`, peaks: [0.3, 0.9] },
      ],
    });
    const photo = await add({
      sender: LEO,
      type: 'photo',
      attachments: [
        { kind: 'photo', media_id: 'm-2', media_key: `u/${LEO}/photo/1`, w: 1200, h: 900 },
      ],
    });
    await renderChat(
      <ChatMediaProvider services={deviceDouble(recordedMediaApi())}>
        <CrewChat crewId={CREW} />
      </ChatMediaProvider>,
      s,
    );

    expect(await screen.findByText('Leo joined the crew')).toBeTruthy();
    expect(screen.getByText('who is up for the beach?')).toBeTruthy();
    expect(screen.getByText('Mỹ Khê is calm until four.')).toBeTruthy();
    expect(screen.getByTestId(`chat-voice-play-${voice}`)).toBeTruthy();
    // The photo holds its place at a real size before its image loads.
    expect(screen.getByTestId(`chat-photo-${photo}`)).toBeTruthy();
    const tile = screen.getByLabelText('Open photo');
    const { width } = StyleSheet.flatten(tile.props.style as object) as { width?: unknown };
    expect(typeof width === 'number' && width > 0).toBe(true);
    expect(screen.queryByText('This message needs a newer CritterPass')).toBeNull();
  });

  it('gives a card still loading a slot of real width, never a collapsed bubble', async () => {
    // A card that shows the shared skeleton until its row syncs, as the poll and plan cards do.
    const stop = registerChatCard('poll', {
      Component: ({ message }) => <Skeleton preset="card" testID={`loading-${message.id}`} />,
      estimateHeight: () => 120,
      a11yLabel: () => 'Poll',
    });
    try {
      stack = await openTestLocalFirst({ holdUploads: true });
      await seedCrew(stack);
      const id = await seedMessage(stack, { seq: 1, sender: MAYA, type: 'poll', body: '' });
      await renderChat(<CrewChat crewId={CREW} />, stack);
      const slot = await screen.findByTestId(`chat-card-slot-${id}`);
      const { width } = StyleSheet.flatten(slot.props.style as object) as { width?: unknown };
      expect(typeof width === 'number' && width > 0).toBe(true);
      expect(within(slot).getByTestId(`loading-${id}`)).toBeTruthy();
    } finally {
      stop();
    }
  });
});
