/**
 * Asking the guide from the sheet. A question streams its answer in at once; asked offline it
 * waits on the device ("I'll answer when you're back online", not metered until it is sent), kept
 * through an app kill (./guide-question-queue.ts), and goes out, in order, when the connection
 * returns. A failed stream keeps the question with a retry (the server released the meter); a
 * spent meter ends the ask with the 4b-1 details.
 *
 * GROUP and JUST ME never share a turn. The server posts a turn in whatever thread its id names,
 * so every send is bound, when it is asked, to the mode, trip and thread it was asked in; the live
 * turn, the spent meter and the thread id the server named belong to that one mode and are gone
 * once the mode or the trip changes. Nothing asked on JUST ME can be shown, retried or sent on
 * GROUP.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes, never copy. */
import type { GuideThreadMode } from '@cp/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { GuideStreamError } from './guide-frames';
import {
  queueQuestion,
  takeQuestion,
  useWaitingQuestions,
  type QuestionScope,
} from './guide-question-queue';
import { useGuideServices } from './guide-services';
import { applyTurnFrame, failTurn, THINKING, type TurnState } from './turn-state';

export interface QuotaSpent {
  readonly used: number;
  readonly limit: number;
  readonly resetAt: string | null;
  readonly crewPassHolders: readonly string[];
}

export interface LiveTurn {
  readonly key: number;
  readonly question: string;
  readonly state: TurnState;
}

export interface TurnTarget {
  readonly threadId: string;
  readonly mode: GuideThreadMode;
  readonly tripId: string | null;
  /** The asker; their JUST ME questions wait for signal under their own account. */
  readonly uid?: string | null;
  readonly online: boolean;
}

/** What one mode of one trip holds while the sheet is open. */
interface Owned {
  readonly scope: string;
  readonly live: LiveTurn | null;
  readonly quota: { readonly question: string; readonly spent: QuotaSpent } | null;
  /** The thread the server already had for this mode and trip. */
  readonly thread: string | null;
}

const blank = (scope: string): Owned => ({ scope, live: null, quota: null, thread: null });

/** A question's scope with the key the hook's state is held under. */
interface TurnScope extends QuestionScope {
  readonly key: string;
}

/** How a send ended: `left` when the mode changed or the sheet closed before the answer. */
type SendOutcome = 'answered' | 'failed' | 'left';

export function quotaOf(detail: Record<string, unknown>): QuotaSpent {
  const holders = detail['crew_pass_holders'] ?? detail['crewPassHolders'];
  const reset = detail['reset_at'] ?? detail['resetAt'];
  return {
    used: typeof detail['used'] === 'number' ? detail['used'] : 0,
    limit: typeof detail['limit'] === 'number' ? detail['limit'] : 0,
    resetAt: typeof reset === 'string' ? reset : null,
    crewPassHolders: Array.isArray(holders)
      ? holders.filter((uid): uid is string => typeof uid === 'string')
      : [],
  };
}

export function useGuideTurn(target: TurnTarget) {
  const services = useGuideServices();
  const uid = target.uid ?? null;
  const scopeKey = `${target.mode}:${target.tripId ?? ''}:${uid ?? ''}`;
  const [owned, setOwned] = useState<Owned>(() => blank(scopeKey));
  // The other mode's turn is dropped in the render that switches, so not one frame shows it.
  if (owned.scope !== scopeKey) setOwned(blank(scopeKey));
  const mine = owned.scope === scopeKey ? owned : null;
  const live = mine?.live ?? null;
  const quota = mine?.quota ?? null;
  const threadId = mine?.thread ?? target.threadId;
  const scope: TurnScope = useMemo(
    () => ({ key: scopeKey, mode: target.mode, tripId: target.tripId, uid, threadId }),
    [scopeKey, target.mode, target.tripId, uid, threadId],
  );
  const queued = useWaitingQuestions(scope);

  const abort = useRef<AbortController | null>(null);
  const counter = useRef(0);
  // The scope on screen, and the sends cut short by leaving theirs.
  const current = useRef(scopeKey);
  const [left] = useState(() => new WeakSet<AbortController>());
  useEffect(() => {
    current.current = scopeKey;
    return () => {
      if (abort.current !== null) left.add(abort.current);
      abort.current?.abort();
    };
  }, [scopeKey, left]);

  const run = useCallback(
    /** Asks in the scope the question was asked in; a scope no longer on screen sends nothing. */
    async (question: string, asked: TurnScope): Promise<SendOutcome> => {
      if (asked.key !== current.current) return 'left';
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const key = ++counter.current;
      /** Changes this scope's state only: a late frame never lands in another mode. */
      const own = (next: (state: Owned) => Owned) =>
        setOwned((state) => (state.scope === asked.key ? next(state) : state));
      const update = (next: (state: TurnState) => TurnState) =>
        own((state) =>
          state.live?.key === key
            ? { ...state, live: { ...state.live, state: next(state.live.state) } }
            : state,
        );
      own((state) => ({ ...state, live: { key, question, state: THINKING }, quota: null }));
      let thread = asked.threadId;
      // A thread the server already has for this mode and trip answers with its id: ask there.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await services.streamTurn(
            thread,
            { text: question, thread_mode: asked.mode, context: { trip_id: asked.tripId } },
            (frame) => update((state) => applyTurnFrame(state, frame)),
            controller.signal,
          );
          update((state) => failTurn(state, 'AI_UNAVAILABLE', true));
          return 'answered';
        } catch (error) {
          if (controller.signal.aborted) {
            return left.has(controller) ? 'left' : 'failed';
          }
          const failure = error instanceof GuideStreamError ? error : new GuideStreamError(null);
          const existing = failure.detail['thread_id'];
          if (failure.code === 'STATE_INVALID' && typeof existing === 'string' && attempt === 0) {
            thread = existing;
            own((state) => ({ ...state, thread: existing }));
            continue;
          }
          if (failure.code === 'QUOTA_EXHAUSTED') {
            const spent = quotaOf(failure.detail);
            own((state) => ({ ...state, live: null, quota: { question, spent } }));
            return 'failed';
          }
          const retryable = failure.status === null || failure.status >= 500;
          update((state) => failTurn(state, failure.code, retryable));
          return 'failed';
        }
      }
      return 'failed';
    },
    [services, left],
  );

  const ask = useCallback(
    (text: string) => {
      const question = text.trim();
      if (question === '') return;
      if (!target.online) {
        queueQuestion(scope, question);
        return;
      }
      void run(question, scope);
    },
    [run, target.online, scope],
  );

  // Back online: the questions asked offline go out one after another.
  const busy =
    live !== null && (live.state.phase === 'thinking' || live.state.phase === 'streaming');
  // `liveKey`: a turn that finished within one render still lets the next question go.
  const liveKey = live?.key ?? 0;
  useEffect(() => {
    if (!target.online || busy) return;
    const first = takeQuestion(scope);
    if (first === null) return;
    void run(first.text, scope).then((outcome) => {
      if (outcome === 'answered') first.from.answered(first.id);
      // Left before the answer: it waits again, for this mode only.
      else if (outcome === 'left') first.from.release(first.id);
      // The live turn holds the question (with its retry); the queue lets it go.
      else first.from.remove(first.id);
    });
  }, [target.online, busy, liveKey, scope, run, queued]);

  const liveQuestion = live?.question ?? null;
  const retry = useCallback(() => {
    if (liveQuestion !== null) void run(liveQuestion, scope);
  }, [liveQuestion, run, scope]);

  return { threadId, live, queued, quota, busy, ask, retry };
}
