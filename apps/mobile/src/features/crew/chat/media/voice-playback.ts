/**
 * A voice note's playback state: fetch the audio once (signed read URL, then a local file, which
 * is what iOS's player needs: the signed link has no file extension and the media origin serves
 * whole objects only), play and pause, the played time from the player, the length from the
 * attachment or the player once it knows, 1× / 1.5×, and a failed state the listener can retry.
 */
import type { StoredAttachment } from '@cp/domain';
import { useEffect, useRef, useState } from 'react';

import type { ChatMediaServices, PlayerPort } from './media-services';
import { readUrl } from './read-urls';

export type VoiceState = 'idle' | 'loading' | 'playing' | 'paused' | 'failed';
export type VoiceRate = 1 | 1.5;

export const VOICE_TICK_MS = 250;
/** The player stops within this of the end; treat it as the end. */
const END_SLACK_S = 0.05;

export interface VoicePlayback {
  readonly state: VoiceState;
  readonly playedMs: number;
  /** The note's length: the attachment's, else the player's once loaded; 0 while unknown. */
  readonly durationMs: number;
  readonly rate: VoiceRate;
  readonly toggle: () => Promise<void>;
  readonly cycleRate: () => void;
}

export function useVoicePlayback(
  media: ChatMediaServices | null,
  voice: StoredAttachment | undefined,
): VoicePlayback {
  const player = useRef<PlayerPort | null>(null);
  const [state, setState] = useState<VoiceState>('idle');
  const [playedMs, setPlayedMs] = useState(0);
  const [loadedMs, setLoadedMs] = useState(0);
  const [rate, setRate] = useState<VoiceRate>(1);

  useEffect(() => () => player.current?.release(), []);
  useEffect(() => {
    if (state !== 'playing') return undefined;
    const timer = setInterval(() => {
      const current = player.current;
      if (current === null) return;
      const { current: at, duration } = current.position();
      if (duration > 0) setLoadedMs(Math.round(duration * 1000));
      if (!current.playing() && duration > 0 && at >= duration - END_SLACK_S) {
        setState('idle');
        setPlayedMs(0);
        return;
      }
      setPlayedMs(Math.round(at * 1000));
    }, VOICE_TICK_MS);
    return () => clearInterval(timer);
  }, [state]);

  const toggle = async () => {
    if (media === null || voice === undefined || state === 'loading') return;
    if (state === 'playing') {
      player.current?.pause();
      setState('paused');
      return;
    }
    if (player.current === null) {
      setState('loading');
      const key = voice.derived_key ?? voice.media_key;
      const file = await media.audioFile(key, () => readUrl(media.http, key));
      if (file === null) {
        setState('failed');
        return;
      }
      player.current = media.createPlayer(file);
      player.current.setRate(rate);
    }
    player.current.play();
    setState('playing');
  };

  const cycleRate = () => {
    const next: VoiceRate = rate === 1 ? 1.5 : 1;
    setRate(next);
    player.current?.setRate(next);
  };

  const stored = voice?.duration_ms ?? 0;
  const durationMs = stored > 0 ? stored : loadedMs;
  return { state, playedMs, durationMs, rate, toggle, cycleRate };
}
