/**
 * Voice notes in the crew chat on the real local-first stack, with the media api answered by
 * recorded responses and the file cache and player as device doubles: a note plays from a local
 * copy of its signed read URL (downloaded once), shows its progress and length (from the player
 * when the attachment has none), starts over once finished, plays at 1.5× on request, and a note
 * that cannot be fetched says so and plays on a retry.
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

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';

import {
  openTestLocalFirst,
  type TestLocalFirst,
} from '@/data/powersync/test-support/local-first-fixture';
import { removeDir } from '@/data/powersync/test-support/open-node-database';

import { CrewChat } from '../../components/chat-screen';
import { CREW, MAYA, renderChat, seedCrew, seedMessage } from '../../test-support/chat-harness';
import {
  deviceDouble,
  recordedMediaApi,
  type DeviceDouble,
  type RecordedMediaApi,
} from '../../test-support/media-doubles';
import { ChatMediaProvider } from '../media-services';
import { clearReadUrlCache } from '../read-urls';
import '../register';

let stack: TestLocalFirst | null = null;
let api: RecordedMediaApi;

beforeEach(() => {
  api = recordedMediaApi();
  clearReadUrlCache();
});

afterEach(async () => {
  await stack?.close();
  if (stack) removeDir(stack.dir);
  stack = null;
});

const ORIGINAL = `u/${MAYA}/voice/original`;

/** The note as the founder's crew chat holds it: the original only, with its peaks. */
const foundersNote = {
  kind: 'voice',
  media_id: 'm-1',
  media_key: ORIGINAL,
  peaks: [0.2, 1, 0.5, 0.3],
};

async function chatWithNote(attachment: object): Promise<{ id: string; media: DeviceDouble }> {
  stack = await openTestLocalFirst({ holdUploads: true });
  await seedCrew(stack);
  const id = await seedMessage(stack, {
    seq: 1,
    sender: MAYA,
    type: 'voice',
    attachments: [attachment],
  });
  const media = deviceDouble(api);
  await renderChat(
    <ChatMediaProvider services={media}>
      <CrewChat crewId={CREW} />
    </ChatMediaProvider>,
    stack,
  );
  return { id, media };
}

/**
 * Whether a screen reader can land on `node`: an `accessible` ancestor would fold it into one
 * element, hidden from VoiceOver, TalkBack and iOS UI automation.
 */
interface Rendered {
  readonly parent: Rendered | null;
  readonly props: { readonly accessible?: boolean };
}

function reachable(node: Rendered): boolean {
  for (let up = node.parent; up !== null; up = up.parent) {
    if (up.props.accessible === true) return false;
  }
  return true;
}

describe('voice note playback', () => {
  it('plays a local copy of the signed URL and shows its progress', async () => {
    const { media } = await chatWithNote(foundersNote);
    // Reached the way a screen reader (and iOS UI automation) reaches it: its own button.
    const play = await screen.findByRole('button', { name: 'Play voice note' });
    expect(reachable(play as unknown as Rendered)).toBe(true);
    await fireEvent.press(play);
    await waitFor(() => expect(media.players[0]?.playing).toBe(true));
    expect(media.downloads).toEqual([api.readUrlFor(ORIGINAL)]);
    expect(media.players[0]?.url).toMatch(/^file:\/\/\/.*\.m4a$/u);
    expect(screen.getByRole('button', { name: 'Pause voice note' })).toBeTruthy();
    const player = media.players[0];
    if (player === undefined) throw new Error('no player');
    // 1.2 s into the 4.2 s note: the player's length stands in for the attachment's, 3 s left.
    player.at = 1.2;
    await waitFor(() => expect(screen.getByText('0:03')).toBeTruthy());
  });

  it('starts over once the note has played to the end', async () => {
    const { id, media } = await chatWithNote({ ...foundersNote, duration_ms: 4200 });
    await fireEvent.press(await screen.findByTestId(`chat-voice-play-${id}`));
    await waitFor(() => expect(media.players[0]?.playing).toBe(true));
    const player = media.players[0];
    if (player === undefined) throw new Error('no player');
    player.at = player.duration;
    player.playing = false;
    await waitFor(() => expect(screen.getByLabelText('Play voice note')).toBeTruthy());
    expect(screen.getByTestId(`chat-voice-time-${id}`)).toHaveTextContent('0:04');
    await fireEvent.press(screen.getByTestId(`chat-voice-play-${id}`));
    expect(player.playing).toBe(true);
    // The same player and the saved copy: nothing is fetched twice.
    expect(media.players).toHaveLength(1);
    expect(media.downloads).toHaveLength(1);
  });

  it('plays the normalised AAC when the worker made one, at 1.5× on request', async () => {
    const normalised = `u/${MAYA}/voice/normalised`;
    const { id, media } = await chatWithNote({
      ...foundersNote,
      derived_key: normalised,
      duration_ms: 4200,
    });
    await fireEvent.press(await screen.findByTestId(`chat-voice-play-${id}`));
    await waitFor(() => expect(media.downloads).toEqual([api.readUrlFor(normalised)]));
    await fireEvent.press(screen.getByTestId(`chat-voice-speed-${id}`));
    expect(media.players[0]?.rate).toBe(1.5);
  });

  it('says it could not load a note it may not read, and plays it on a retry', async () => {
    api.refuseReads = true;
    const { id, media } = await chatWithNote(foundersNote);
    await fireEvent.press(await screen.findByTestId(`chat-voice-play-${id}`));
    await waitFor(() =>
      expect(screen.getByTestId(`chat-voice-time-${id}`)).toHaveTextContent('Couldn’t load'),
    );
    expect(media.players).toHaveLength(0);
    api.refuseReads = false;
    clearReadUrlCache();
    await fireEvent.press(screen.getByTestId(`chat-voice-play-${id}`));
    await waitFor(() => expect(media.players[0]?.playing).toBe(true));
  });
});
