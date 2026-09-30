/**
 * Phrase audio on the device: files under the app's documents (`phrase_audio/`), fetched through
 * `POST /v1/media/read-urls`, played with `expo-audio`.
 */
/* eslint-disable lingui/no-unlocalized-strings -- api paths and folder names, never copy. */
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { sessionHeaders } from '@/data/app-session/device-session';
import { resolveApiBaseUrl } from '@/data/places/apiBaseUrl';

import type { PhraseAudioServices } from './phrase-audio';

const FOLDER = 'phrase_audio';

function folder(): Directory {
  const dir = new Directory(Paths.document, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function fileFor(audioKey: string): File {
  return new File(folder(), audioKey.replace(/[^A-Za-z0-9._-]/gu, '_'));
}

async function readUrl(audioKey: string): Promise<string | null> {
  try {
    const response = await fetch(`${resolveApiBaseUrl()}/v1/media/read-urls`, {
      method: 'POST',
      headers: { ...(await sessionHeaders()), 'content-type': 'application/json' },
      body: JSON.stringify({ media_keys: [audioKey] }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as { urls?: { media_key: string; url: string }[] };
    return body.urls?.find((entry) => entry.media_key === audioKey)?.url ?? null;
  } catch {
    return null;
  }
}

export const devicePhraseAudio: PhraseAudioServices = {
  local: (audioKey) => {
    try {
      const file = fileFor(audioKey);
      return file.exists ? file.uri : null;
    } catch {
      return null;
    }
  },
  fetch: async (audioKey) => {
    const url = await readUrl(audioKey);
    if (url === null) return null;
    try {
      const file = await File.downloadFileAsync(url, fileFor(audioKey), { idempotent: true });
      return file.uri;
    } catch {
      return null;
    }
  },
  play: (uri, onEnd) => {
    const player = createAudioPlayer(uri);
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) {
        subscription.remove();
        player.remove();
        onEnd();
      }
    });
    player.play();
    return {
      stop: () => {
        subscription.remove();
        player.remove();
      },
    };
  },
};
