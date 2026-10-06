/**
 * A voice turn as the screen shows it: listening (what was heard so far), thinking, the reply
 * arriving as text and, unless replies are muted or the phone's volume is at zero, spoken. Every
 * reply is shown as text whether or not it is heard, so a reply that could not be spoken, or was
 * talked over, is still complete on screen.
 */
export type VoicePhase = 'idle' | 'listening' | 'thinking' | 'speaking';

/** Why the turn stopped short; each has its own line on the screen. */
export type VoiceIssue =
  | 'mic_denied'
  | 'no_speech_module'
  | 'heard_nothing'
  | 'listen_failed'
  | 'offline_queued'
  | 'quota'
  | 'reply_failed';

export interface VoiceState {
  readonly phase: VoicePhase;
  /** What the microphone heard in this turn. */
  readonly heard: string;
  /** The guide's reply so far. */
  readonly reply: string;
  /** Audio arrived for this reply; false after `done` means it is read, not heard. */
  readonly spoken: boolean;
  /** Change sets the guide proposed in this turn, in the order they arrived. */
  readonly proposals: readonly string[];
  readonly issue: VoiceIssue | null;
  readonly muted: boolean;
}

export const VOICE_IDLE: VoiceState = {
  phase: 'idle',
  heard: '',
  reply: '',
  spoken: false,
  proposals: [],
  issue: null,
  muted: false,
};

export type VoiceEvent =
  | { readonly type: 'listening' }
  | { readonly type: 'partial'; readonly text: string }
  | { readonly type: 'asked'; readonly text: string }
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'proposal'; readonly changesetId: string }
  | { readonly type: 'audio' }
  | { readonly type: 'settled' }
  | { readonly type: 'interrupted' }
  | { readonly type: 'failed'; readonly issue: VoiceIssue }
  | { readonly type: 'muted'; readonly muted: boolean };

export function voiceReducer(state: VoiceState, event: VoiceEvent): VoiceState {
  switch (event.type) {
    case 'listening':
      return { ...state, phase: 'listening', heard: '', issue: null };
    case 'partial':
      return state.phase === 'listening' ? { ...state, heard: event.text } : state;
    case 'asked':
      return {
        ...state,
        phase: 'thinking',
        heard: event.text,
        reply: '',
        spoken: false,
        proposals: [],
      };
    case 'token':
      return { ...state, reply: state.reply + event.text };
    case 'proposal':
      return state.proposals.includes(event.changesetId)
        ? state
        : { ...state, proposals: [...state.proposals, event.changesetId] };
    case 'audio':
      return state.phase === 'thinking' || state.phase === 'speaking'
        ? { ...state, phase: 'speaking', spoken: true }
        : state;
    case 'settled':
      return state.phase === 'thinking' || state.phase === 'speaking'
        ? { ...state, phase: 'idle' }
        : state;
    case 'interrupted':
      return state.phase === 'speaking' ? { ...state, phase: 'idle' } : state;
    case 'failed':
      return { ...state, phase: 'idle', issue: event.issue };
    case 'muted':
      return { ...state, muted: event.muted };
  }
}

/**
 * Whether the reply is played. The voice session ignores the ring/silent switch, so a muted
 * session and media volume at zero both leave the reply as text.
 */
export function repliesAloud(muted: boolean, outputVolume: number): boolean {
  return !muted && outputVolume > 0;
}
