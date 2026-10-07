/**
 * Phrase practice as the screen shows it: the phrase being practised, what the phone heard, the
 * verdict and, on a miss, the guide's one tip. A practice that went well moves the phrase from
 * "practising" to "learned"; the counts are the server's (`phrase_progress`), plus what was just
 * practised on this phone before it syncs back.
 */
export type PracticePhase = 'ready' | 'listening' | 'checking' | 'ok' | 'retry';

/** Why an attempt stopped short; each has its own line. */
export type PracticeIssue =
  | 'mic_denied'
  | 'no_speech_module'
  | 'heard_nothing'
  | 'listen_failed'
  | 'offline'
  | 'check_failed';

export interface PracticeState {
  readonly phase: PracticePhase;
  /** What the microphone heard in this attempt. */
  readonly heard: string;
  /** The guide's tip after a miss; null when there is none (or the tip could not be written). */
  readonly tip: string | null;
  readonly issue: PracticeIssue | null;
}

export const PRACTICE_READY: PracticeState = { phase: 'ready', heard: '', tip: null, issue: null };

export type PracticeEvent =
  | { readonly type: 'reset' }
  | { readonly type: 'listening' }
  | { readonly type: 'partial'; readonly text: string }
  | { readonly type: 'checking'; readonly heard: string }
  | { readonly type: 'graded'; readonly outcome: 'ok' | 'retry'; readonly tip: string | null }
  | { readonly type: 'said' }
  | { readonly type: 'failed'; readonly issue: PracticeIssue };

export function practiceReducer(state: PracticeState, event: PracticeEvent): PracticeState {
  switch (event.type) {
    case 'reset':
      return PRACTICE_READY;
    case 'listening':
      return { phase: 'listening', heard: '', tip: null, issue: null };
    case 'partial':
      return state.phase === 'listening' ? { ...state, heard: event.text } : state;
    case 'checking':
      return { phase: 'checking', heard: event.heard, tip: null, issue: null };
    case 'graded':
      return state.phase === 'checking'
        ? { ...state, phase: event.outcome, tip: event.outcome === 'ok' ? null : event.tip }
        : state;
    case 'said':
      return { phase: 'ok', heard: '', tip: null, issue: null };
    case 'failed':
      return { ...state, phase: 'ready', issue: event.issue };
  }
}

export interface PracticePhrase {
  readonly id: string;
  readonly text: string;
  readonly romanisation: string | null;
  readonly gloss: string;
  readonly language: string;
  readonly audioKey: string | null;
}

export interface PracticeLists {
  readonly practising: readonly PracticePhrase[];
  readonly learned: readonly PracticePhrase[];
}

/** The phrases in two lists, in the cards' own order; `learnedIds` are the ones practised well. */
export function practiceLists(
  phrases: readonly PracticePhrase[],
  learnedIds: ReadonlySet<string>,
): PracticeLists {
  return {
    practising: phrases.filter((phrase) => !learnedIds.has(phrase.id)),
    learned: phrases.filter((phrase) => learnedIds.has(phrase.id)),
  };
}

/** The phrase to practise next: the chosen one, else the first still being practised. */
export function currentPhrase(
  phrases: readonly PracticePhrase[],
  lists: PracticeLists,
  chosenId: string | null,
): PracticePhrase | null {
  return (
    phrases.find((phrase) => phrase.id === chosenId) ?? lists.practising[0] ?? phrases[0] ?? null
  );
}
