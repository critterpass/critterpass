/**
 * Phrase cards: recorded audio plays from the phone (airplane mode included), is fetched once when
 * missing, and a card whose audio can't be reached, or has none, is read in the phone's voice.
 */
// eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return -- jest.mock factories cannot close over module-scope imports
jest.mock('@shopify/react-native-skia', () => require('@/ui/test-support/skia-double'));
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  router: { push: (href: unknown) => mockPush(href) },
}));
const mockSpeak = jest.fn();
jest.mock('expo-speech', () => ({
  speak: (text: unknown, options: unknown) => mockSpeak(text, options),
  stop: () => Promise.resolve(),
}));

import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderHook, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { renderWithI18n } from '@/lib/i18n/testing';

import { PhraseAudioContext, prefetchPhraseAudio, type PhraseAudioServices } from '../phrase-audio';
import { PhraseCard } from '../phrase-card';
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
