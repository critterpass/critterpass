/**
 * A voice note's player on the device (`expo-audio`) and its local copy. iOS's player cannot play
 * the signed media link itself (no file extension to tell it the format, and the media origin does
 * not answer range requests), so a note is downloaded once into the cache as `.m4a` (the recorder's
 * AAC in an MPEG-4 container) and played from there. A voice note is something the listener asked
 * to hear, so it plays through the iOS silent switch: it holds the `playback` session while it
 * plays and hands back to `ambient` when it pauses, finishes or is released. Played to the end, the
 * next play starts it over.
 */
/* eslint-disable lingui/no-unlocalized-strings -- folder names and file extensions, never copy. */
import { createAudioPlayer } from 'expo-audio';
import { Directory, File, Paths } from 'expo-file-system';

import { acquirePlaybackSession } from '@/motion/feedback';

import type { PlayerPort } from './media-services';

const FOLDER = 'chat_voice';

/** The cache file for a media key (keys hold slashes; one flat folder of `.m4a` files). */
export function voiceFileName(key: string): string {
  return `${key.replace(/[^A-Za-z0-9._-]/gu, '_')}.m4a`;
}

function fileFor(key: string): File {
  const dir = new Directory(Paths.cache, FOLDER);
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return new File(dir, voiceFileName(key));
}

export async function deviceVoiceFile(
  key: string,
  signedUrl: () => Promise<string | null>,
): Promise<string | null> {
  try {
    const file = fileFor(key);
    if (file.exists && (file.size ?? 0) > 0) return file.uri;
    const url = await signedUrl();
    if (url === null) return null;
    return (await File.downloadFileAsync(url, file, { idempotent: true })).uri;
  } catch {
    return null;
  }
}

export function deviceVoicePlayer(uri: string): PlayerPort {
  const player = createAudioPlayer(uri);
  let session: (() => void) | null = null;
  let ended = false;
  const endSession = () => {
    session?.();
    session = null;
  };
  const finished = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) {
      ended = true;
      endSession();
    }
  });
  return {
    play: () => {
      session ??= acquirePlaybackSession();
      if (ended) {
        ended = false;
        void player.seekTo(0).then(() => player.play());
        return;
      }
      player.play();
    },
    pause: () => {
      player.pause();
      endSession();
    },
    setRate: (rate) => player.setPlaybackRate(rate),
    position: () => ({ current: player.currentTime, duration: player.duration }),
    playing: () => player.playing,
    release: () => {
      finished.remove();
      player.remove();
      endSession();
    },
  };
}
