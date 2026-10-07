/**
 * One voice conversation with the guide: talk, the question goes to the guide as a voice turn,
 * the reply streams as text and plays chunk by chunk. Talking (or tapping) over the reply stops
 * the audio at once and starts listening again; the text of the interrupted reply keeps arriving.
 * Everything the device does (microphone, playback, network) comes in through ports.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire frame types and codes, never copy. */
import {
  repliesAloud,
  VOICE_IDLE,
  voiceReducer,
  type VoiceEvent,
  type VoiceIssue,
  type VoiceState,
} from './voice-turn';
import { isVoiceConsentRequired } from './voice-consent';

export interface VoiceListening {
  /** Ends the utterance and resolves with its text. */
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export interface VoiceFrame {
  readonly type: string;
  readonly data: Record<string, unknown>;
}

export interface VoicePorts {
  /** Asks for the microphone (with the primer the first time); false when it stays denied. */
  readonly allowMicrophone: () => Promise<boolean>;
  /** Null in a build without the speech module. */
  readonly listen: ((onPartial: (text: string) => void) => Promise<VoiceListening>) | null;
  readonly online: () => boolean;
  /** Streams one voice turn; rejects with `{code}` when refused or dropped. */
  readonly ask: (
    text: string,
    options: { readonly speak: boolean },
    onFrame: (frame: VoiceFrame) => void,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Keeps a question asked offline for when the connection returns. */
  readonly queueOffline: (text: string) => void;
  readonly play: (turn: string, chunk: { seq: number; b64?: string; url?: string }) => void;
  /** The turn's last chunk was queued: the reply ends when playback drains. */
  readonly endOfReply: (turn: string) => void;
  readonly cancelPlayback: () => void;
  readonly outputVolume: () => number;
  readonly setMuted: (muted: boolean) => void;
  /** The server holds no voice consent for this person: the consent step is shown again. */
  readonly consentRequired: () => void;
}

export interface VoiceController {
  readonly state: VoiceState;
  /** Starts listening, stopping a reply that is playing. */
  talk(): Promise<void>;
  /** Ends the utterance and asks the guide. */
  send(): Promise<void>;
  /** The reply was talked or tapped over: its audio stops, its text stays. */
  interrupted(by: 'speech' | 'tap'): void;
  /** Playback ran out after the reply's last chunk. */
  playbackDrained(): void;
  setMuted(muted: boolean): void;
  dispose(): void;
}

function issueOf(error: unknown): VoiceIssue {
  const code = (error as { code?: unknown } | null)?.code;
  return code === 'QUOTA_EXHAUSTED' ? 'quota' : 'reply_failed';
}

export function createVoiceController(
  ports: VoicePorts,
  onState: (state: VoiceState) => void,
  initial: Partial<VoiceState> = {},
): VoiceController {
  let state: VoiceState = { ...VOICE_IDLE, ...initial };
  let listening: VoiceListening | null = null;
  let abort: AbortController | null = null;
  let turn = 0;
  /** The turn whose audio may still play; an interrupted turn's later chunks are dropped. */
  let audible: number | null = null;
  let streamDone = false;
  let disposed = false;

  const emit = (event: VoiceEvent) => {
    if (disposed) return;
    state = voiceReducer(state, event);
    onState(state);
  };

  const stopReply = () => {
    if (audible !== null) ports.cancelPlayback();
    audible = null;
  };

  const controller: VoiceController = {
    get state() {
      return state;
    },
    async talk() {
      if (state.phase === 'listening') return;
      stopReply();
      emit({ type: 'interrupted' });
      if (ports.listen === null) return emit({ type: 'failed', issue: 'no_speech_module' });
      if (!(await ports.allowMicrophone())) return emit({ type: 'failed', issue: 'mic_denied' });
      try {
        emit({ type: 'listening' });
        listening = await ports.listen((text) => emit({ type: 'partial', text }));
      } catch {
        listening = null;
        emit({ type: 'failed', issue: 'listen_failed' });
      }
    },
    async send() {
      const current = listening;
      if (current === null) return;
      listening = null;
      let text: string;
      try {
        text = (await current.stop()).trim();
      } catch {
        return emit({ type: 'failed', issue: 'listen_failed' });
      }
      if (text === '') return emit({ type: 'failed', issue: 'heard_nothing' });
      if (!ports.online()) {
        ports.queueOffline(text);
        emit({ type: 'partial', text });
        return emit({ type: 'failed', issue: 'offline_queued' });
      }
      abort?.abort();
      const signal = (abort = new AbortController());
      const mine = ++turn;
      const turnId = String(mine);
      const speak = repliesAloud(state.muted, ports.outputVolume());
      audible = speak ? mine : null;
      streamDone = false;
      let chunks = 0;
      emit({ type: 'asked', text });
      try {
        await ports.ask(
          text,
          { speak },
          (frame) => {
            if (mine !== turn) return;
            if (frame.type === 'token' && typeof frame.data['text'] === 'string') {
              emit({ type: 'token', text: frame.data['text'] });
            } else if (frame.type === 'proposal') {
              const id = frame.data['changeset_id'];
              if (typeof id === 'string') emit({ type: 'proposal', changesetId: id });
            } else if (frame.type === 'audio' && audible === mine) {
              const { seq, b64, url } = frame.data;
              if (typeof seq !== 'number') return;
              chunks += 1;
              ports.play(turnId, {
                seq,
                ...(typeof b64 === 'string' ? { b64 } : {}),
                ...(typeof url === 'string' ? { url } : {}),
              });
              emit({ type: 'audio' });
            } else if (frame.type === 'error') {
              throw Object.assign(new Error('turn failed'), { code: frame.data['code'] });
            }
          },
          signal.signal,
        );
      } catch (error) {
        if (signal.signal.aborted || mine !== turn) return;
        stopReply();
        if (isVoiceConsentRequired(error)) {
          // Not a failed reply: the question stays, and the consent step takes the screen.
          emit({ type: 'settled' });
          return ports.consentRequired();
        }
        return emit({ type: 'failed', issue: issueOf(error) });
      }
      if (mine !== turn) return;
      streamDone = true;
      // Audio still playing keeps the turn "speaking" until playback drains.
      if (audible === mine && chunks > 0) ports.endOfReply(turnId);
      else emit({ type: 'settled' });
    },
    interrupted(by) {
      if (audible === null) return;
      if (by === 'tap') ports.cancelPlayback();
      audible = null;
      emit({ type: 'interrupted' });
      if (by === 'speech') void controller.talk();
    },
    playbackDrained() {
      if (audible === null || !streamDone) return;
      audible = null;
      emit({ type: 'settled' });
    },
    setMuted(muted) {
      ports.setMuted(muted);
      if (muted) stopReply();
      emit({ type: 'muted', muted });
      if (muted && state.phase === 'speaking') emit({ type: 'interrupted' });
    },
    dispose() {
      abort?.abort();
      stopReply();
      void listening?.cancel().catch(() => undefined);
      listening = null;
      disposed = true;
    },
  };
  return controller;
}
