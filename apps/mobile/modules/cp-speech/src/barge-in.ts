import type { PlaybackEvent } from './CpSpeechModule';

/** What barge-in needs from the speech module (the native binding satisfies it). */
export interface BargeInPort {
  addListener(
    event: 'onSpeechStart',
    listener: (event: { readonly playing: boolean; readonly atMs: number }) => void,
  ): { remove(): void };
  addListener(event: 'onPlayback', listener: (event: PlaybackEvent) => void): { remove(): void };
  cancelPlayback(): void;
  capabilities(): { readonly echoCancellation: boolean };
}

export interface Interruption {
  readonly turn: string | null;
  /** `speech`: the user talked over the reply; `tap`: the hold-to-talk button. */
  readonly by: 'speech' | 'tap';
}

export interface BargeIn {
  /** False on a device without echo cancellation: only `interrupt()` (tap) stops a reply. */
  readonly bySpeech: boolean;
  /** True from the reply's first chunk until it is cancelled, or plays out after `streamEnded`. */
  readonly replying: boolean;
  /** The turn's last audio chunk has been queued; the reply ends when playback drains. */
  streamEnded(turn: string): void;
  /** Tap-to-interrupt: stops the reply on any device. */
  interrupt(): void;
  dispose(): void;
}

/**
 * Speaking over the guide's reply stops it: the native VAD runs on the echo-cancelled mic, so its
 * speech start while a reply plays is the user, not the reply. Playback is cancelled in the same
 * event, well inside the 200 ms budget, and `onInterrupt` starts the next turn (the partly spoken
 * answer stays as text). Without echo cancellation the reply would trigger itself, so only a tap
 * interrupts.
 */
export function createBargeIn(
  port: BargeInPort,
  onInterrupt: (interruption: Interruption) => void,
): BargeIn {
  const bySpeech = port.capabilities().echoCancellation;
  let turn: string | null = null;
  let sounding = false;
  let ended: string | null = null;

  // Between chunks (the server still synthesising) the reply is still on, so speech interrupts it.
  const replying = () => turn !== null && (sounding || ended !== turn);

  const stop = (by: Interruption['by']) => {
    if (!replying()) return;
    const interrupted = turn;
    turn = null;
    sounding = false;
    port.cancelPlayback();
    onInterrupt({ turn: interrupted, by });
  };

  const playback = port.addListener('onPlayback', (event) => {
    if (event.state === 'started') {
      turn = event.turn ?? null;
      sounding = true;
    } else if (event.state === 'drained') {
      sounding = false;
    } else if (event.state === 'cancelled') {
      turn = null;
      sounding = false;
    }
  });
  const speech = port.addListener('onSpeechStart', () => {
    if (bySpeech) stop('speech');
  });

  return {
    bySpeech,
    get replying() {
      return replying();
    },
    streamEnded(last) {
      ended = last;
    },
    interrupt() {
      stop('tap');
    },
    dispose() {
      playback.remove();
      speech.remove();
      turn = null;
    },
  };
}
