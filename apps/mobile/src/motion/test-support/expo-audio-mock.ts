// Manual Jest mock for `expo-audio` (mapped in `jest.config.js`'s `moduleNameMapper`), the same
// class of native/hardware-boundary test double as `reanimated-mock.ts`: `expo-audio`'s real entry
// point (`ExpoAudio.js`) reaches into `AudioModule.AudioPlayer.prototype` at import time to patch two
// methods, which throws under Jest (no native `ExpoAudio` module is registered). This mock
// reimplements only what `src/motion/feedback` and `src/motion/music` actually use: a player with
// play/pause/seekTo/replace, a listener registry (for the sample-based level meter), and the two
// module-level audio-session functions.
import { useEffect, useState } from 'react';

let nextPlayerId = 0;

type Listener = (payload: unknown) => void;

export class MockAudioPlayer {
  readonly id = String(nextPlayerId++);
  playing = false;
  paused = true;
  muted = false;
  loop = false;
  isLoaded = true;
  isBuffering = false;
  isAudioSamplingSupported = true;
  currentTime = 0;
  duration = 0;
  volume = 1;
  playbackRate = 1;
  shouldCorrectPitch = true;

  private readonly listeners = new Map<string, Set<Listener>>();

  constructor(public source: unknown) {}

  play(): void {
    this.playing = true;
    this.paused = false;
  }

  pause(): void {
    this.playing = false;
    this.paused = true;
  }

  seekTo(seconds: number): Promise<void> {
    this.currentTime = seconds;
    return Promise.resolve();
  }

  replace(source: unknown): void {
    this.source = source;
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = rate;
  }

  setAudioSamplingEnabled(_enabled: boolean): void {
    // No-op: this mock always reports `isAudioSamplingSupported = true` and emits samples via `emit`.
  }

  setActiveForLockScreen(): void {}
  updateLockScreenMetadata(): void {}
  clearLockScreenControls(): void {}
  remove(): void {
    this.listeners.clear();
  }

  addListener(event: string, listener: Listener): { remove: () => void } {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(event, set);
    return { remove: () => set.delete(listener) };
  }

  /** Test-only: simulates a native event (e.g. `audioSampleUpdate`) firing. */
  emit(event: string, payload: unknown): void {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }
}

export function createAudioPlayer(source: unknown = null): MockAudioPlayer {
  return new MockAudioPlayer(source);
}

export function useAudioPlayer(source: unknown = null): MockAudioPlayer {
  const [player] = useState(() => new MockAudioPlayer(source));
  return player;
}

export function useAudioSampleListener(
  player: MockAudioPlayer,
  listener: (sample: { channels: { frames: number[] }[]; timestamp: number }) => void,
): void {
  useEffect(() => {
    const subscription = player.addListener('audioSampleUpdate', listener as Listener);
    return () => subscription.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mirrors expo-audio's own `[player.id]` dependency list.
  }, [player.id]);
}

export async function setAudioModeAsync(_mode: unknown): Promise<void> {
  // No native audio session to configure under Jest.
}

export async function setIsAudioActiveAsync(_active: boolean): Promise<void> {}

export async function preload(): Promise<void> {}
export async function clearPreloadedSource(): Promise<void> {}
export async function clearAllPreloadedSources(): Promise<void> {}
