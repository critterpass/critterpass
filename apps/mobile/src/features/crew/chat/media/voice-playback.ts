/**
 * Voice-note playback for the whole chat, kept in one place and keyed by message: at most one note
 * plays at a time (starting another stops the first), and a row shows progress only for its own
 * message, so a list row reused for another note starts clean. A note's audio is fetched once
 * (signed read URL, then a local file, which is what iOS's player needs: the signed link has no
 * file extension and the media origin serves whole objects only). The played time comes from the
 * player, the length from the attachment or the player once it knows; 1× / 1.5× is the listener's
 * choice for every note; a note that cannot be fetched says so and plays on a retry.
 */
import type { StoredAttachment } from '@cp/domain';
import { useCallback, useSyncExternalStore } from 'react';

import type { ChatMediaServices, PlayerPort } from './media-services';
import { readUrl } from './read-urls';

export type VoiceState = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';
export type VoiceRate = 1 | 1.5;

export const VOICE_TICK_MS = 250;
/** The player stops within this of the end; treat it as the end. */
const END_SLACK_S = 0.05;

/** Where one note stands; every note but the active one is `RESTING`. */
export interface NoteProgress {
  readonly state: VoiceState;
  readonly playedMs: number;
}

const RESTING: NoteProgress = { state: 'idle', playedMs: 0 };

export function createVoicePlayback() {
  const listeners = new Set<() => void>();
  /** Lengths the player reported, for notes whose attachment carries none. */
  const lengths = new Map<string, number>();
  let active: { readonly id: string; progress: NoteProgress } | null = null;
  let player: PlayerPort | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  let rate: VoiceRate = 1;

  const emit = () => listeners.forEach((listener) => listener());
  const set = (progress: NoteProgress) => {
    if (active === null) return;
    active = { id: active.id, progress };
    if (progress.state === 'playing') timer ??= setInterval(tick, VOICE_TICK_MS);
    else if (timer !== null) {
      clearInterval(timer);
      timer = null;
    }
    emit();
  };

  function tick() {
    if (active === null || player === null) return;
    const { current, duration } = player.position();
    if (duration > 0) lengths.set(active.id, Math.round(duration * 1000));
    if (!player.playing() && duration > 0 && current >= duration - END_SLACK_S) {
      set(RESTING);
      return;
    }
    set({ state: 'playing', playedMs: Math.round(current * 1000) });
  }

  /** Stops whatever plays and lets its player go. */
  function stop() {
    if (timer !== null) clearInterval(timer);
    timer = null;
    player?.release();
    player = null;
    if (active === null) return;
    active = null;
    emit();
  }

  async function toggle(id: string, media: ChatMediaServices, voice: StoredAttachment) {
    if (active?.id === id && active.progress.state !== 'failed') {
      if (active.progress.state === 'loading' || player === null) return;
      if (active.progress.state === 'playing') {
        player.pause();
        set({ ...active.progress, state: 'paused' });
        return;
      }
      player.play();
      set({ ...active.progress, state: 'playing' });
      return;
    }
    stop();
    active = { id, progress: { state: 'loading', playedMs: 0 } };
    emit();
    const key = voice.derived_key ?? voice.media_key;
    const file = await media.audioFile(key, () => readUrl(media.http, key));
    // Another note was started, or the chat closed, while this one was fetched.
    if (active?.id !== id || active.progress.state !== 'loading') return;
    if (file === null) {
      set({ state: 'failed', playedMs: 0 });
      return;
    }
    player = media.createPlayer(file);
    player.setRate(rate);
    player.play();
    set({ state: 'playing', playedMs: 0 });
  }

  return {
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    progress: (id: string): NoteProgress => (active?.id === id ? active.progress : RESTING),
    length: (id: string): number => lengths.get(id) ?? 0,
    rate: (): VoiceRate => rate,
    toggle,
    stop,
    cycleRate: () => {
      rate = rate === 1 ? 1.5 : 1;
      player?.setRate(rate);
      emit();
    },
  };
}

/** The app's one voice-note playback: a note started anywhere stops the one before it. */
export const voicePlayback = createVoicePlayback();

export interface VoicePlayback extends NoteProgress {
  /** The note's length: the attachment's, else the player's once loaded; 0 while unknown. */
  readonly durationMs: number;
  readonly rate: VoiceRate;
  readonly toggle: () => Promise<void>;
  readonly cycleRate: () => void;
}

export function useVoicePlayback(
  media: ChatMediaServices | null,
  messageId: string,
  voice: StoredAttachment | undefined,
): VoicePlayback {
  const progress = useSyncExternalStore(voicePlayback.subscribe, () =>
    voicePlayback.progress(messageId),
  );
  const loadedMs = useSyncExternalStore(voicePlayback.subscribe, () =>
    voicePlayback.length(messageId),
  );
  const rate = useSyncExternalStore(voicePlayback.subscribe, voicePlayback.rate);
  const toggle = useCallback(
    () =>
      media === null || voice === undefined
        ? Promise.resolve()
        : voicePlayback.toggle(messageId, media, voice),
    [media, messageId, voice],
  );
  const stored = voice?.duration_ms ?? 0;
  return {
    ...progress,
    durationMs: stored > 0 ? stored : loadedMs,
    rate,
    toggle,
    cycleRate: voicePlayback.cycleRate,
  };
}
