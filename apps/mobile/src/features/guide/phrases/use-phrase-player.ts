/**
 * Playing one phrase card's recorded audio: from the device when it is there (airplane mode
 * included), else fetched once and kept. Tapping again while it plays stops it. Audio that cannot
 * be reached ends as `unavailable`, and the card is shown instead.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePhraseAudioServices, type PhrasePlayback } from './phrase-audio';

export type PhrasePlayerState = 'idle' | 'loading' | 'playing' | 'unavailable';

export function usePhrasePlayer(audioKey: string | null) {
  const services = usePhraseAudioServices();
  const [state, setState] = useState<PhrasePlayerState>('idle');
  const playback = useRef<PhrasePlayback | null>(null);
  const live = useRef(true);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
      playback.current?.stop();
      playback.current = null;
    };
  }, []);

  const toggle = useCallback(async () => {
    if (audioKey === null) return;
    if (playback.current !== null) {
      playback.current.stop();
      playback.current = null;
      setState('idle');
      return;
    }
    let uri = services.local(audioKey);
    if (uri === null) {
      setState('loading');
      uri = await services.fetch(audioKey);
      if (!live.current) return;
      if (uri === null) {
        setState('unavailable');
        return;
      }
    }
    setState('playing');
    let ended = false;
    const started = services.play(uri, () => {
      ended = true;
      playback.current = null;
      if (live.current) setState('idle');
    });
    if (!ended) playback.current = started;
  }, [audioKey, services]);

  return { state, toggle };
}
