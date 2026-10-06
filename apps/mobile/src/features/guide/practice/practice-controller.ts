/**
 * One phrase practice at a time. With the pronunciation check on, the phone listens in the
 * phrase's language, the server grades what was heard against the card (a match costs no model
 * call) and a miss comes back with one tip; with it off, "I said it" counts the practice. Every
 * attempt is recorded with `record_phrase_practice`, which never touches the guide meter.
 * Everything the device does comes in through ports.
 */
/* eslint-disable lingui/no-unlocalized-strings -- issue codes and wire values, never copy. */
import {
  PRACTICE_READY,
  practiceReducer,
  type PracticeEvent,
  type PracticePhrase,
  type PracticeState,
} from './practice-model';

export interface PracticeListening {
  /** Ends the attempt and resolves with what was heard. */
  stop(): Promise<string>;
  cancel(): Promise<void>;
}

export interface PracticeGrade {
  readonly outcome: 'ok' | 'retry';
  readonly score: number;
  readonly tip: string | null;
}

export interface PracticeRecord {
  readonly phrase_id: string;
  readonly language: string;
  readonly outcome: 'ok' | 'retry';
  readonly score?: number;
}

export interface PracticePorts {
  readonly allowMicrophone: () => Promise<boolean>;
  /** Null in a build without the speech module. */
  readonly listen:
    ((language: string, onPartial: (text: string) => void) => Promise<PracticeListening>) | null;
  readonly online: () => boolean;
  /** `POST /v1/guide/phrase-feedback`; rejects when it cannot be reached. */
  readonly grade: (phrase: PracticePhrase, heard: string) => Promise<PracticeGrade>;
  readonly record: (record: PracticeRecord) => void;
}

export interface PracticeController {
  readonly state: PracticeState;
  /** Another phrase was picked: the last attempt's verdict clears. */
  reset(): void;
  /** "I said it": counts the practice without listening. */
  said(phrase: PracticePhrase): void;
  listen(phrase: PracticePhrase): Promise<void>;
  /** Ends the attempt, has it graded and records it. */
  check(phrase: PracticePhrase): Promise<void>;
  dispose(): void;
}

export function createPracticeController(
  ports: PracticePorts,
  onState: (state: PracticeState) => void,
): PracticeController {
  let state = PRACTICE_READY;
  let listening: PracticeListening | null = null;
  let attempt = 0;
  let disposed = false;

  const emit = (event: PracticeEvent) => {
    if (disposed) return;
    state = practiceReducer(state, event);
    onState(state);
  };
  const drop = () => {
    attempt += 1;
    void listening?.cancel().catch(() => undefined);
    listening = null;
  };

  return {
    get state() {
      return state;
    },
    reset() {
      drop();
      emit({ type: 'reset' });
    },
    said(phrase) {
      drop();
      ports.record({ phrase_id: phrase.id, language: phrase.language, outcome: 'ok' });
      emit({ type: 'said' });
    },
    async listen(phrase) {
      if (state.phase === 'listening' || state.phase === 'checking') return;
      if (ports.listen === null) return emit({ type: 'failed', issue: 'no_speech_module' });
      // Without a connection nothing can grade the attempt: say so before listening.
      if (!ports.online()) return emit({ type: 'failed', issue: 'offline' });
      if (!(await ports.allowMicrophone())) return emit({ type: 'failed', issue: 'mic_denied' });
      const mine = ++attempt;
      emit({ type: 'listening' });
      try {
        const started = await ports.listen(phrase.language, (text) => {
          if (mine === attempt) emit({ type: 'partial', text });
        });
        if (mine !== attempt) return void started.cancel().catch(() => undefined);
        listening = started;
      } catch {
        if (mine === attempt) emit({ type: 'failed', issue: 'listen_failed' });
      }
    },
    async check(phrase) {
      const current = listening;
      if (current === null) return;
      listening = null;
      const mine = attempt;
      let heard: string;
      try {
        heard = (await current.stop()).trim();
      } catch {
        return emit({ type: 'failed', issue: 'listen_failed' });
      }
      if (mine !== attempt) return;
      if (heard === '') return emit({ type: 'failed', issue: 'heard_nothing' });
      emit({ type: 'checking', heard });
      let grade: PracticeGrade;
      try {
        grade = await ports.grade(phrase, heard);
      } catch {
        // Ungraded attempts are not recorded: nothing says whether it went well.
        if (mine === attempt) emit({ type: 'failed', issue: 'check_failed' });
        return;
      }
      ports.record({
        phrase_id: phrase.id,
        language: phrase.language,
        outcome: grade.outcome,
        score: grade.score,
      });
      if (mine === attempt) emit({ type: 'graded', outcome: grade.outcome, tip: grade.tip });
    },
    dispose() {
      drop();
      disposed = true;
    },
  };
}
