/**
 * The guide's recorded narration for the playing card (`recaps.narration`, the reader's language
 * or English): signed through the api's read URLs, played with `expo-audio` while the guide's
 * music ducks under it, paused with the story and silenced when the card changes, the story
 * closes or sound is switched off. With voice off, or no recording, the card's narration shows as
 * text only. `onSpeaking` says whether the line still has something to say, so the story can wait
 * for it.
 */
import { createAudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';

import { acquirePlaybackSession } from '@/motion/feedback';
import { music } from '@/motion/music';

import { readMediaUrl } from '../data/read-url';
import { startNarration, type Narration, type NarrationDeps } from './narration';

export type VoiceUrlLoader = NarrationDeps['readUrl'];

export function useNarration(
  mediaKey: string | null,
  enabled: boolean,
  paused: boolean,
  onSpeaking: (speaking: boolean) => void,
  loadUrl: VoiceUrlLoader = readMediaUrl,
): void {
  const narration = useRef<Narration | null>(null);

  useEffect(() => {
    if (mediaKey === null || !enabled) return undefined;
    onSpeaking(true);
    const line = startNarration(
      mediaKey,
      {
        readUrl: loadUrl,
        createPlayer: (url) => createAudioPlayer(url),
        acquireSession: acquirePlaybackSession,
        duck: () => music.duck(),
      },
      () => onSpeaking(false),
    );
    narration.current = line;
    return () => {
      narration.current = null;
      line.stop();
    };
    // `onSpeaking` is a state setter and `loadUrl` a module function or a test's fixed loader.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mediaKey, enabled]);

  // After the line starts, and on every pause or resume: a line that starts under a pause waits.
  useEffect(() => {
    narration.current?.setPaused(paused);
  }, [paused, mediaKey, enabled]);
}
