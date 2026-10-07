/**
 * The recap story's sound: a card waits for its voice line before the next one comes (up to a
 * maximum, and a tap still moves on), a line is silenced the moment its card goes, the story
 * closes or sound is switched off, and leaving the app stops the line until it is back in front.
 * The clip's URL loader is the network boundary; the player is expo-audio's Jest double.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- see the double's header
jest.mock('@/ui/sticker/Sticker', () => require('@/ui/avatar/test-support/sticker-double'));
jest.mock('@/motion/use-loop', () => ({ useLoop: () => ({}) }));

import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, screen } from '@testing-library/react-native';
import * as audio from 'expo-audio';
import { AppState, Text, type AppStateStatus } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ScreenJoltProvider } from '@/motion/patterns/thud';
import type { MockAudioPlayer } from '@/motion/test-support/expo-audio-mock';
import { renderUi } from '@/ui/test-support/render';

import type { StoryCardSpec } from '../story-cards';
import { StoryView } from '../story-view';
import { VOICE_WAIT_MAX_MS } from '../use-voice-wait';

const CARD_MS = 6000;
const card = (id: StoryCardSpec['card'], narrationKey: string | null): StoryCardSpec => ({
  card: id,
  label: id,
  durationMs: CARD_MS,
  caption: null,
  narrationKey,
  content: <Text testID={`card-${id}`}>{id}</Text>,
});
const CARDS = [card('cover', 'clip-cover'), card('route', 'clip-route'), card('postcard', null)];

const METRICS = {
  frame: { x: 0, y: 0, width: 390, height: 844 },
  insets: { top: 47, left: 0, right: 0, bottom: 34 },
};

let players: MockAudioPlayer[] = [];
let appState: ((state: AppStateStatus) => void) | null = null;

function view(voiceOn: boolean, held = false) {
  return (
    <SafeAreaProvider initialMetrics={METRICS}>
      <ScreenJoltProvider>
        <StoryView
          guide="chava"
          guideName="Chà Vá"
          subtitle="Đà Nẵng"
          cards={CARDS}
          voiceOn={voiceOn}
          onToggleVoice={() => undefined}
          onClose={() => undefined}
          onFinished={() => undefined}
          footerFor={() => null}
          held={held}
          loadVoiceUrl={(key) => Promise.resolve(`https://media.test/${key}.mp3`)}
        />
      </ScreenJoltProvider>
    </SafeAreaProvider>
  );
}

const advance = (ms: number) => act(() => jest.advanceTimersByTimeAsync(ms));
const showing = (id: string) => screen.queryByTestId(`card-${id}`) !== null;
const finish = (player: MockAudioPlayer | undefined) =>
  act(() => player?.emit('playbackStatusUpdate', { didJustFinish: true }));

beforeEach(() => {
  jest.useFakeTimers();
  players = [];
  const create = audio.createAudioPlayer as unknown as (source: unknown) => MockAudioPlayer;
  jest.spyOn(audio, 'createAudioPlayer').mockImplementation(((source: unknown) => {
    const player = create(source);
    players.push(player);
    return player;
  }) as unknown as typeof audio.createAudioPlayer);
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
    appState = listener;
    return { remove: () => undefined };
  });
});

afterEach(() => {
  jest.restoreAllMocks();
  jest.useRealTimers();
});

describe('recap story sound', () => {
  it('waits for the voice line before the next card, then moves on', async () => {
    await renderUi(view(true));
    await advance(0);
    expect(players).toHaveLength(1);
    expect(players[0]?.playing).toBe(true);

    // The card is six seconds long and the guide is still talking at ten.
    await advance(5900);
    await advance(4100);
    expect(showing('cover')).toBe(true);

    await finish(players[0]);
    await advance(500);
    expect(showing('route')).toBe(true);
    expect(players[1]?.source).toBe('https://media.test/clip-route.mp3');
  });

  it('moves on at its own length once the line is done, and gives up on a line that never ends', async () => {
    await renderUi(view(true));
    await advance(2000);
    await finish(players[0]);
    await advance(3900);
    expect(showing('cover')).toBe(true);
    await advance(200);
    expect(showing('route')).toBe(true);

    await advance(CARD_MS - 100);
    await advance(VOICE_WAIT_MAX_MS - 500);
    expect(showing('route')).toBe(true);
    await advance(500);
    await advance(500);
    expect(showing('postcard')).toBe(true);
    expect(players[1]?.playing).toBe(false);
  });

  it('silences a line when its card is skipped and when the story closes', async () => {
    const { unmount } = await renderUi(view(true));
    await advance(1000);
    const first = players[0];
    await fireEvent(screen.getByRole('adjustable'), 'accessibilityAction', {
      nativeEvent: { actionName: 'increment' },
    });
    await advance(0);
    // Paused, not only released: a released player keeps sounding until it is collected.
    expect(first?.playing).toBe(false);
    expect(showing('route')).toBe(true);
    expect(players[1]?.playing).toBe(true);

    await act(() => unmount());
    expect(players[1]?.playing).toBe(false);
  });

  it('silences the line when sound is switched off and does not wait for it', async () => {
    const { rerender } = await renderUi(view(true));
    await advance(1000);
    expect(players[0]?.playing).toBe(true);
    await rerender(view(false));
    expect(players[0]?.playing).toBe(false);
    await advance(CARD_MS);
    expect(showing('route')).toBe(true);
    expect(players).toHaveLength(1);
  });

  it('stops the line and the card while the app is away or a sheet is up', async () => {
    const { rerender } = await renderUi(view(true));
    await advance(1000);
    await act(() => appState?.('background'));
    expect(players[0]?.playing).toBe(false);
    await advance(60_000);
    expect(showing('cover')).toBe(true);
    await act(() => appState?.('active'));
    expect(players[0]?.playing).toBe(true);

    await rerender(view(true, true));
    expect(players[0]?.playing).toBe(false);
    await rerender(view(true, false));
    expect(players[0]?.playing).toBe(true);
  });
});
