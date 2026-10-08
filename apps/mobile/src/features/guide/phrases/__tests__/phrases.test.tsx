/**
 * Phrase cards: recorded audio plays from the phone (airplane mode included), is fetched once when
 * missing, and a card whose audio can't be reached, or has none, is read in the phone's voice. A
 * card that offers practice carries the link, and so does its SHOW mode.
 */
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: (href: unknown) => mockPush(href) },
}));
// The installed build's speech module: builds before on-device speech don't have it.
let mockSpeechInstalled = true;
jest.mock('expo', () => {
  const actual = jest.requireActual<typeof ExpoModule>('expo');
  return {
    ...actual,
    requireOptionalNativeModule: (name: string): unknown =>
      name === 'ExpoSpeech'
        ? mockSpeechInstalled
          ? {}
          : null
        : actual.requireOptionalNativeModule(name),
  };
});
const mockSpeak = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (text: unknown, options: unknown) => mockSpeak(text, options),
  stop: () => Promise.resolve(),
}));

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import type * as ExpoModule from 'expo';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { renderWithI18n } from '@/lib/i18n/testing';

import { PhraseAudioContext, prefetchPhraseAudio, type PhraseAudioServices } from '../phrase-audio';
import { PhraseCard, PhraseCardView, showModeHref } from '../phrase-card';
import { usePhrasePlayer } from '../use-phrase-player';

const KEY = 'phrase_audio/u1/villa.mp3';

/** A phone's audio folder in memory, with a network that may or may not answer. */
function phone(options: { stored?: string[]; online?: boolean } = {}) {
  const files = new Map((options.stored ?? []).map((key) => [key, `file:///audio/${key}`]));
  const played: string[] = [];
  const ends: (() => void)[] = [];
  const services: PhraseAudioServices = {
    local: (key) => files.get(key) ?? null,
    fetch: (key) => {
      if (options.online !== true) return Promise.resolve(null);
      files.set(key, `file:///audio/${key}`);
      return Promise.resolve(files.get(key) ?? null);
    },
    play: (uri, onEnd) => {
      played.push(uri);
      ends.push(onEnd);
      return { stop: () => undefined };
    },
  };
  return { services, played, ends, files };
}

function wrap(services: PhraseAudioServices) {
  return ({ children }: { children: ReactNode }) => (
    <PhraseAudioContext.Provider value={services}>{children}</PhraseAudioContext.Provider>
  );
}

describe('playing a phrase', () => {
  it('plays the audio already on the phone without the network', async () => {
    const device = phone({ stored: [KEY] });
    const { result } = await renderHook(() => usePhrasePlayer(KEY), {
      wrapper: wrap(device.services),
    });
    await act(() => result.current.toggle());
    expect(device.played).toEqual([`file:///audio/${KEY}`]);
    expect(result.current.state).toBe('playing');
    await act(() => {
      device.ends[0]?.();
    });
    expect(result.current.state).toBe('idle');
  });

  it('fetches missing audio once and keeps it', async () => {
    const device = phone({ online: true });
    const { result } = await renderHook(() => usePhrasePlayer(KEY), {
      wrapper: wrap(device.services),
    });
    await act(() => result.current.toggle());
    expect(device.files.has(KEY)).toBe(true);
    expect(result.current.state).toBe('playing');
    await act(() => result.current.toggle());
    expect(result.current.state).toBe('idle');
  });

  it('is unavailable offline when the audio never reached the phone', async () => {
    const device = phone();
    const { result } = await renderHook(() => usePhrasePlayer(KEY), {
      wrapper: wrap(device.services),
    });
    await act(() => result.current.toggle());
    expect(result.current.state).toBe('unavailable');
    expect(device.played).toEqual([]);
  });

  it('packs every card for offline once', async () => {
    const device = phone({ online: true, stored: ['a.mp3'] });
    expect(await prefetchPhraseAudio(device.services, ['a.mp3', 'b.mp3', 'b.mp3'])).toBe(1);
    expect([...device.files.keys()].sort()).toEqual(['a.mp3', 'b.mp3']);
  });
});

describe('the phrase card', () => {
  const card = (audioKey: string | null) => (
    <GestureHandlerRootView>
      <PhraseCard
        phrase="Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud."
        lang="id"
        gloss="Please take us to Villa Kayu Manis, Sayan road, Ubud."
        eyebrow="Show this to Made"
        audioKey={audioKey}
      />
    </GestureHandlerRootView>
  );

  it("reads a card without recorded audio in the phone's voice, and opens SHOW mode", async () => {
    await renderWithI18n(card(null));
    expect(screen.getByText("Read in your phone's voice")).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Read aloud'));
    expect(mockSpeak).toHaveBeenCalledWith(
      'Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.',
      expect.objectContaining({ language: 'id' }),
    );
    await fireEvent.press(screen.getByText('Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.'));
    expect(mockPush).toHaveBeenCalledWith({
      pathname: '/guide/phrase',
      params: {
        phrase: 'Tolong ke Villa Kayu Manis, Jalan Raya Sayan, Ubud.',
        lang: 'id',
        gloss: 'Please take us to Villa Kayu Manis, Sayan road, Ubud.',
      },
    });
  });

  it('has no play button without recorded audio in a build without on-device speech', async () => {
    mockSpeechInstalled = false;
    try {
      await renderWithI18n(card(null));
      expect(screen.queryByLabelText('Read aloud')).toBeNull();
      expect(screen.queryByText("Read in your phone's voice")).toBeNull();
    } finally {
      mockSpeechInstalled = true;
    }
  });

  it('plays recorded audio from its button', async () => {
    const device = phone({ stored: [KEY] });
    await renderWithI18n(
      <PhraseAudioContext.Provider value={device.services}>
        {card(KEY)}
      </PhraseAudioContext.Provider>,
    );
    await fireEvent.press(screen.getByLabelText('Read aloud'));
    expect(device.played).toHaveLength(1);
  });
});

describe('practising a phrase from its card', () => {
  const view = (onPractise?: () => void) => (
    <GestureHandlerRootView>
      <PhraseCardView
        phrase="Cho tôi xin hoá đơn."
        lang="vi"
        gloss="The bill, please."
        playerState="idle"
        onPractise={onPractise}
      />
    </GestureHandlerRootView>
  );

  it('offers the link on a card that has somewhere to practise', async () => {
    const onPractise = jest.fn();
    await renderWithI18n(view(onPractise));
    await fireEvent.press(screen.getByTestId('guide-phrase-card-practise'));
    expect(onPractise).toHaveBeenCalledTimes(1);
  });

  it('offers no link on any other card', async () => {
    await renderWithI18n(view());
    expect(screen.getByTestId('guide-phrase-card')).toBeTruthy();
    expect(screen.queryByTestId('guide-phrase-card-practise')).toBeNull();
  });

  it('hands SHOW mode the same offer, with the trip the practice counts for', () => {
    expect(showModeHref('Xin chào', 'vi', 'Hello')).toEqual({
      pathname: '/guide/phrase',
      params: { phrase: 'Xin chào', lang: 'vi', gloss: 'Hello' },
    });
    expect(showModeHref('Xin chào', 'vi', 'Hello', { tripId: 'trip-1' })).toEqual({
      pathname: '/guide/phrase',
      params: { phrase: 'Xin chào', lang: 'vi', gloss: 'Hello', practise: '1', tripId: 'trip-1' },
    });
  });
});
