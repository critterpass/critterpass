/**
 * Where a guide question asked with no signal waits, by who may read it.
 *
 * A GROUP question waits in the phone's shared question queue: search drains that queue too, into
 * the trip's crew-visible thread, which is where a group question belongs. A JUST ME question must
 * never be there to take, so it waits in a list of its own (the same store under the account's own
 * key) that only the guide on JUST ME reads. It names no thread: the account's private thread for
 * the trip is resolved when the question is sent.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys, never copy. */
import { generateUuidV7, type GuideThreadMode } from '@cp/domain';
import { useMemo, useSyncExternalStore } from 'react';

import {
  createQuestionQueue,
  questionQueue,
  useQueuedQuestions,
  type QuestionQueue,
} from '@/data/places/question-queue';
import { searchStore } from '@/data/places/search-store';

/** Who is asking, and where the answer may be read. */
export interface QuestionScope {
  readonly mode: GuideThreadMode;
  readonly tripId: string | null;
  readonly uid: string | null;
  /** The thread for this mode and trip as the phone knows it (a fresh id before the first turn). */
  readonly threadId: string;
}

export interface WaitingQuestion {
  readonly id: string;
  readonly text: string;
}

const lists = new Map<string, QuestionQueue>();

/** One account's JUST ME questions waiting for signal. */
export function privateQuestions(uid: string | null): QuestionQueue {
  const owner = uid ?? '';
  let list = lists.get(owner);
  if (list === undefined) {
    const prefix = `private.${owner}.`;
    list = createQuestionQueue({
      getString: (key) => searchStore().getString(`${prefix}${key}`),
      set: (key, value) => searchStore().set(`${prefix}${key}`, value),
    });
    lists.set(owner, list);
  }
  return list;
}

/** Keeps a question asked offline until there is signal. */
export function queueQuestion(scope: QuestionScope, text: string): void {
  if (scope.mode === 'private') {
    privateQuestions(scope.uid).enqueue({
      id: generateUuidV7(),
      tripId: scope.tripId,
      threadId: null,
      text,
    });
    return;
  }
  questionQueue().enqueue({
    id: generateUuidV7(),
    tripId: scope.tripId,
    threadId: scope.threadId,
    text,
  });
}

export interface TakenQuestion {
  readonly id: string;
  readonly text: string;
  /** The list it came from, to mark it answered, put it back or let it go. */
  readonly from: QuestionQueue;
}

/**
 * The next waiting question this scope may send, marked sending. JUST ME takes its own list first,
 * then what the shared queue holds for its thread (and search's questions, which name none); GROUP
 * never sees the private list.
 */
export function takeQuestion(scope: QuestionScope): TakenQuestion | null {
  if (scope.mode === 'private') {
    const own = privateQuestions(scope.uid);
    const first = own.take({ tripId: scope.tripId });
    if (first !== null) return { id: first.id, text: first.text, from: own };
  }
  const shared = questionQueue();
  const next = shared.take({ threadId: scope.threadId, tripId: scope.tripId });
  return next === null ? null : { id: next.id, text: next.text, from: shared };
}

/** The questions waiting for signal that this scope will send, oldest first. */
export function useWaitingQuestions(scope: QuestionScope): readonly WaitingQuestion[] {
  const own = privateQuestions(scope.uid);
  const mine = useSyncExternalStore(own.subscribe, own.all);
  const shared = useQueuedQuestions();
  const { mode, tripId, threadId } = scope;
  return useMemo(() => {
    const waiting = [
      ...(mode === 'private' ? mine : []),
      ...shared.filter((entry) => entry.threadId === null || entry.threadId === threadId),
    ].filter((entry) => entry.state === 'queued' && entry.tripId === tripId);
    return waiting
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt))
      .map((entry) => ({ id: entry.id, text: entry.text }));
  }, [mine, shared, mode, tripId, threadId]);
}
