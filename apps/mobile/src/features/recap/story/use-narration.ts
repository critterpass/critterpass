/**
 * The guide's recorded narration for the playing card (`recaps.narration`, the reader's language
 * or English): signed through the api's read URLs, played with `expo-audio` while the guide's
 * music ducks under it, paused with the story and stopped when the card changes. With voice off,
 * or no recording, the card's narration shows as text only.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths, never copy. */
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { useEffect, useRef } from 'react';

import { sessionHeaders } from '@/data/app-session/auth-client';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';
import { acquirePlaybackSession } from '@/motion/feedback';
import { music } from '@/motion/music';

async function readUrl(mediaKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/v1/media/read-urls`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ media_keys: [mediaKey] }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { urls?: { media_key: string; url: string }[] };
    return body.urls?.find((entry) => entry.media_key === mediaKey)?.url ?? null;
  } catch {
    return null;
  }
}

export function useNarration(mediaKey: string | null, voiceOn: boolean, paused: boolean): void {
  const player = useRef<AudioPlayer | null>(null);

  useEffect(() => {
    if (mediaKey === null || !voiceOn) return undefined;
    let live = true;
    let restore: (() => void) | null = null;
    let release: (() => void) | null = null;
    void readUrl(mediaKey).then((url) => {
      if (!live || url === null) return;
      const audio = createAudioPlayer(url);
      player.current = audio;
      release = acquirePlaybackSession();
      restore = music.duck();
      const done = audio.addListener('playbackStatusUpdate', (status) => {
        if (!status.didJustFinish) return;
        done.remove();
        restore?.();
        restore = null;
      });
      audio.play();
    });
    return () => {
      live = false;
      player.current?.remove();
      player.current = null;
      restore?.();
      release?.();
    };
  }, [mediaKey, voiceOn]);

  useEffect(() => {
    const audio = player.current;
    if (audio === null) return;
    if (paused) audio.pause();
    else audio.play();
  }, [paused]);
}
