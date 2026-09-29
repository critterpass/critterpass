/* eslint-disable lingui/no-unlocalized-strings -- wire values and paths, never copy. */
/**
 * The guide pitch as it streams (`POST /v1/pitches`): the sticker first, the tool chips, then each
 * section as the guide finishes it, then `done` with the pitch id ADD TO THE VOTE uses. A stream
 * that stalls past the timeout, fails or answers an error ends in `error` with a retry.
 */
import type { PitchAlternative, PitchChip, PitchReason } from '@cp/domain';
import { useCallback, useEffect, useRef, useState } from 'react';

import type { SseFrame } from './sse-client';
import { useVoteServices } from './vote-services';

/** No frame for this long ends the pitch in `error` (the retry asks again). */
export const PITCH_STALL_MS = 20_000;

export interface PitchSticker {
  readonly placeId: string;
  readonly name: string;
  readonly country: string | null;
  readonly coverage: 'live' | 'guest';
  readonly guide: string;
}

export interface PitchState {
  readonly phase: 'idle' | 'streaming' | 'done' | 'error';
  readonly sticker: PitchSticker | null;
  readonly headline: string | null;
  readonly chips: readonly PitchChip[];
  readonly reasons: readonly PitchReason[];
  readonly quote: string | null;
  readonly alternatives: readonly PitchAlternative[];
  readonly pitchId: string | null;
  readonly cached: boolean;
}

export const EMPTY_PITCH: PitchState = {
  phase: 'idle',
  sticker: null,
  headline: null,
  chips: [],
  reasons: [],
  quote: null,
  alternatives: [],
  pitchId: null,
  cached: false,
};

/** Folds one frame into the pitch. Unknown frames change nothing. */
const str = (d: Record<string, unknown>, key: string, fallback: string): string => {
  const value = d[key];
  return typeof value === 'string' ? value : fallback;
};

export function applyPitchFrame(state: PitchState, frame: SseFrame): PitchState {
  const d = frame.data;
  switch (frame.type) {
    case 'sticker':
      return {
        ...state,
        sticker: {
          placeId: str(d, 'place_id', ''),
          name: str(d, 'name', ''),
          country: typeof d['country'] === 'string' ? d['country'] : null,
          coverage: d['coverage'] === 'live' ? 'live' : 'guest',
          guide: str(d, 'guide', 'tokek'),
        },
      };
    case 'chip':
      return { ...state, chips: [...state.chips, d as unknown as PitchChip] };
    case 'headline':
      return { ...state, headline: str(d, 'text', '') };
    case 'reason':
      return { ...state, reasons: [...state.reasons, d as unknown as PitchReason] };
    case 'quote':
      return { ...state, quote: str(d, 'text', '') };
    case 'alternative':
      return { ...state, alternatives: [...state.alternatives, d as unknown as PitchAlternative] };
    case 'done':
      return {
        ...state,
        phase: 'done',
        pitchId: typeof d['pitch_id'] === 'string' ? d['pitch_id'] : null,
        cached: d['cached'] === true,
      };
    case 'error':
      return { ...state, phase: 'error' };
    default:
      return state;
  }
}

export interface PitchRequest {
  readonly crewId: string;
  readonly placeId: string;
  readonly month?: number;
}

export function usePitchStream(request: PitchRequest | null) {
  const services = useVoteServices();
  const [stream, setStream] = useState<{ key: string; state: PitchState } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const key =
    request === null
      ? null
      : `${request.crewId}:${request.placeId}:${request.month ?? ''}:${attempt}`;
  const live = useRef<string | null>(null);
  useEffect(() => {
    if (request === null || key === null) return undefined;
    live.current = key;
    const controller = new AbortController();
    let stall: ReturnType<typeof setTimeout> | undefined;
    const update = (next: (current: PitchState) => PitchState) =>
      setStream((current) => ({
        key,
        state: next(current?.key === key ? current.state : { ...EMPTY_PITCH, phase: 'streaming' }),
      }));
    const fail = () =>
      update((current) =>
        current.phase === 'streaming' ? { ...current, phase: 'error' } : current,
      );
    const arm = () => {
      clearTimeout(stall);
      stall = setTimeout(() => {
        controller.abort();
        fail();
      }, PITCH_STALL_MS);
    };
    arm();
    services
      .streamPitch(
        {
          crew_id: request.crewId,
          place_id: request.placeId,
          ...(request.month === undefined ? {} : { month: request.month }),
        },
        (frame) => {
          if (live.current !== key) return;
          arm();
          update((current) => applyPitchFrame(current, frame));
        },
        controller.signal,
      )
      .then(
        () => {
          clearTimeout(stall);
          fail();
        },
        () => {
          clearTimeout(stall);
          if (!controller.signal.aborted) fail();
        },
      );
    return () => {
      clearTimeout(stall);
      controller.abort();
    };
    // `request` is folded into `key` (with the retry count).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, services]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const state =
    key === null
      ? EMPTY_PITCH
      : stream?.key === key
        ? stream.state
        : { ...EMPTY_PITCH, phase: 'streaming' as const };
  return { state, retry };
}
