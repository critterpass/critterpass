/**
 * A voice note's player on the device (`expo-audio`). A voice note is something the listener asked
 * to hear, so it plays through the iOS silent switch: it holds the `playback` session while it
 * plays and hands back to `ambient` when it pauses, finishes or is released.
 */
import { createAudioPlayer } from 'expo-audio';

import { acquirePlaybackSession } from '@/motion/feedback';

import type { PlayerPort } from './media-services';

export function deviceVoicePlayer(url: string): PlayerPort {
  const player = createAudioPlayer(url);
  let session: (() => void) | null = null;
  const endSession = () => {
    session?.();
    session = null;
  };
  const finished = player.addListener('playbackStatusUpdate', (status) => {
    if (status.didJustFinish) endSession();
  });
  return {
    play: () => {
      session ??= acquirePlaybackSession();
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
