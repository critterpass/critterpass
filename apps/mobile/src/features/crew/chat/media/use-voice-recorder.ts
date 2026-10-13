/**
 * Recording a voice note: hold to talk, slide to cancel, lock to go hands-free, and the peaks the
 * waveform draws from the levels heard.
 */
import { VOICE_NOTE_MAX_MS } from '@cp/domain';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Recording, VoiceRecorderPort } from './media-services';

export const CANCEL_SLIDE_PT = 80;

const SAMPLE_MS = 100;

const PEAKS = 48;

export type RecorderState = 'idle' | 'holding' | 'locked' | 'denied';

export interface FinishedNote extends Recording {
  readonly peaks: readonly number[];
}

/** `levels` sampled while recording, reduced to `count` peaks (max per bucket). */
export function peaksOf(levels: readonly number[], count = PEAKS): number[] {
  if (levels.length === 0) return [];
  return Array.from({ length: count }, (_, index) => {
    const from = Math.floor((index / count) * levels.length);
    const to = Math.max(from + 1, Math.floor(((index + 1) / count) * levels.length));
    return Math.round(Math.max(...levels.slice(from, to)) * 100) / 100;
  });
}

export function useVoiceRecorder(
  recorder: VoiceRecorderPort | null,
  onFinished: (note: FinishedNote) => void,
) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsed, setElapsed] = useState(0);
  const levels = useRef<number[]>([]);
  const started = useRef(0);

  const finish = useCallback(async () => {
    if (recorder === null) return;
    setState('idle');
    levels.current.push(recorder.level());
    const recording = await recorder.stop();
    if (recording !== null && recording.durationMs > 0) {
      onFinished({ ...recording, peaks: peaksOf(levels.current) });
    }
  }, [recorder, onFinished]);

  const begin = useCallback(
    async (mode: 'holding' | 'locked') => {
      if (recorder === null) return;
      const outcome = await recorder.start();
      if (outcome === 'denied') {
        setState('denied');
        return;
      }
      levels.current = [];
      started.current = Date.now();
      setElapsed(0);
      setState(mode);
    },
    [recorder],
  );

  const cancel = useCallback(async () => {
    setState('idle');
    await recorder?.cancel();
  }, [recorder]);

  useEffect(() => {
    if (state !== 'holding' && state !== 'locked') return undefined;
    const timer = setInterval(() => {
      levels.current.push(recorder?.level() ?? 0);
      const at = Date.now() - started.current;
      setElapsed(at);
      if (at >= VOICE_NOTE_MAX_MS) void finish();
    }, SAMPLE_MS);
    return () => clearInterval(timer);
  }, [state, recorder, finish]);

  return {
    state,
    elapsed,
    onHoldStart: () => void begin('holding'),
    onHoldEnd: () => {
      if (state === 'holding') void finish();
    },
    onMicTap: () => {
      if (state === 'locked') void finish();
      else if (state === 'idle' || state === 'denied') void begin('locked');
    },
    send: () => void finish(),
    cancel: () => void cancel(),
    dismissDenied: () => setState('idle'),
  };
}
