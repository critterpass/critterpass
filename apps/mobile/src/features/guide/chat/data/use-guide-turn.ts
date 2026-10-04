/**
 * Asking the guide from the sheet. A question streams its answer in at once; asked offline it
 * waits on the device ("I'll answer when you're back online", not metered until it is sent), kept
 * through an app kill in the phone's question queue (shared with search's plain words), and goes
 * out, in order, when the connection returns. A failed stream keeps the question with a
 * retry (the server released the meter); a spent meter ends the ask with the 4b-1 details.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire codes, never copy. */
import { generateUuidV7, type GuideThreadMode } from '@cp/domain';
import { useCallback, useEffect, useRef, useState } from 'react';

import { questionQueue, useQueuedQuestions } from '@/data/places/question-queue';

import { GuideStreamError } from './guide-frames';
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
  readonly online: boolean;
}

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
  const [live, setLive] = useState<LiveTurn | null>(null);
  const [quota, setQuota] = useState<{ question: string; spent: QuotaSpent } | null>(null);
  const [threadOverride, setThreadOverride] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  const counter = useRef(0);
  const threadId = threadOverride ?? target.threadId;
  const waiting = useQueuedQuestions();
  const queued = waiting
    .filter(
      (entry) =>
        entry.state === 'queued' &&
        entry.tripId === target.tripId &&
        (entry.threadId === null || entry.threadId === threadId),
    )
    .map((entry) => entry.text);

  useEffect(() => () => abort.current?.abort(), []);

  const run = useCallback(
    /** Resolves true when the answer streamed in. */
    async (question: string, firstThread: string): Promise<boolean> => {
      abort.current?.abort();
      const controller = new AbortController();
      abort.current = controller;
      const key = ++counter.current;
      const update = (next: (state: TurnState) => TurnState) =>
        setLive((current) =>
          current?.key === key ? { ...current, state: next(current.state) } : current,
        );
      setLive({ key, question, state: THINKING });
      setQuota(null);
      let thread = firstThread;
      // A thread the server already has for this mode and trip answers with its id: ask there.
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          await services.streamTurn(
            thread,
            { text: question, thread_mode: target.mode, context: { trip_id: target.tripId } },
            (frame) => update((state) => applyTurnFrame(state, frame)),
            controller.signal,
          );
          update((state) => failTurn(state, 'AI_UNAVAILABLE', true));
          return true;
        } catch (error) {
          if (controller.signal.aborted) return false;
          const failure = error instanceof GuideStreamError ? error : new GuideStreamError(null);
          const existing = failure.detail['thread_id'];
          if (failure.code === 'STATE_INVALID' && typeof existing === 'string' && attempt === 0) {
            thread = existing;
            setThreadOverride(existing);
            continue;
          }
          if (failure.code === 'QUOTA_EXHAUSTED') {
            setLive(null);
            setQuota({ question, spent: quotaOf(failure.detail) });
            return false;
          }
          const retryable = failure.status === null || failure.status >= 500;
          update((state) => failTurn(state, failure.code, retryable));
          return false;
        }
      }
      return false;
    },
    [services, target.mode, target.tripId],
  );

  const ask = useCallback(
    (text: string) => {
      const question = text.trim();
      if (question === '') return;
      if (!target.online) {
        questionQueue().enqueue({
          id: generateUuidV7(),
          tripId: target.tripId,
          threadId,
          text: question,
        });
        return;
      }
      void run(question, threadId);
    },
    [run, target.online, target.tripId, threadId],
  );

  // Back online: the questions asked offline go out one after another.
  const busy =
    live !== null && (live.state.phase === 'thinking' || live.state.phase === 'streaming');
  // `liveKey`: a turn that finished within one render still lets the next question go.
  const liveKey = live?.key ?? 0;
  useEffect(() => {
    if (!target.online || busy) return;
    const first = questionQueue().take({ threadId, tripId: target.tripId });
    if (first === null) return;
    // The live turn now holds the question (with its retry); the queue lets it go.
    void run(first.text, threadId).then((answered) => {
      if (answered) questionQueue().answered(first.id);
      else questionQueue().remove(first.id);
    });
  }, [target.online, target.tripId, busy, liveKey, threadId, run, waiting]);

  const retry = useCallback(() => {
    if (live !== null) void run(live.question, threadId);
  }, [live, run, threadId]);

  return { threadId, live, queued, quota, busy, ask, retry };
}
