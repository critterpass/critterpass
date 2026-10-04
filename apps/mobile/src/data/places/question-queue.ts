/**
 * Plain-words questions asked with no signal (7i-2 "QUEUED · 1"), kept on the phone (MMKV) until
 * they are answered, so an app kill loses none. Search and the guide chat queue into the same
 * place; whichever sender is running when the first bar comes back takes each question once
 * (`take` marks it sending), and a failed send puts it back. Only the question's own words are
 * kept, never an answer.
 */
/* eslint-disable lingui/no-unlocalized-strings -- storage keys and states, never copy. */
import { useSyncExternalStore } from 'react';

import { searchStore } from './search-store';

export interface QueuedQuestion {
  readonly id: string;
  readonly tripId: string | null;
  /** The guide thread it goes to; null until a sender resolves the trip's thread. */
  readonly threadId: string | null;
  readonly text: string;
  readonly queuedAt: string;
  readonly state: 'queued' | 'sending' | 'answered';
  /** When a sender took it. */
  readonly sentAt?: string;
}

export interface QueueStorage {
  getString(key: string): string | undefined;
  set(key: string, value: string): void;
}

const KEY = 'queued_questions';
/** Answered questions are kept this long for the "TOKEK ANSWERED" flip, then dropped. */
const ANSWERED_TTL_MS = 6 * 60 * 60 * 1000;
/** A send that never finished (the app was killed mid-answer) is retried after this. */
const SENDING_STALE_MS = 2 * 60 * 1000;

export function createQuestionQueue(storage: QueueStorage, now: () => number = Date.now) {
  const listeners = new Set<() => void>();
  let cache: readonly QueuedQuestion[] | null = null;

  const read = (): readonly QueuedQuestion[] => {
    if (cache !== null) return cache;
    try {
      const raw = storage.getString(KEY);
      const parsed: unknown = raw === undefined ? [] : JSON.parse(raw);
      cache = Array.isArray(parsed) ? (parsed as QueuedQuestion[]) : [];
    } catch {
      cache = [];
    }
    // A question left "sending" by a killed app goes back in line.
    cache = cache.map((entry) =>
      entry.state === 'sending' &&
      now() - Date.parse(entry.sentAt ?? entry.queuedAt) > SENDING_STALE_MS
        ? { ...entry, state: 'queued' }
        : entry,
    );
    return cache;
  };
  const write = (next: readonly QueuedQuestion[]) => {
    const kept = next.filter(
      (entry) => entry.state !== 'answered' || now() - Date.parse(entry.queuedAt) < ANSWERED_TTL_MS,
    );
    cache = kept;
    storage.set(KEY, JSON.stringify(kept));
    listeners.forEach((listener) => listener());
  };
  const update = (id: string, patch: Partial<QueuedQuestion>) =>
    write(read().map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)));

  return {
    all: read,
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    enqueue(question: Omit<QueuedQuestion, 'state' | 'queuedAt'>): QueuedQuestion {
      const entry: QueuedQuestion = {
        ...question,
        queuedAt: new Date(now()).toISOString(),
        state: 'queued',
      };
      write([...read(), entry]);
      return entry;
    },
    /**
     * The oldest queued question (for that trip and thread, when given; one with no thread yet goes
     * to the trip's), marked sending; null when none.
     */
    take(
      filter: { readonly threadId?: string; readonly tripId?: string | null } = {},
    ): QueuedQuestion | null {
      const next = read().find(
        (entry) =>
          entry.state === 'queued' &&
          (filter.tripId === undefined || entry.tripId === filter.tripId) &&
          (filter.threadId === undefined ||
            entry.threadId === null ||
            entry.threadId === filter.threadId),
      );
      if (next === undefined) return null;
      const taken: QueuedQuestion = {
        ...next,
        state: 'sending',
        sentAt: new Date(now()).toISOString(),
        threadId: filter.threadId ?? next.threadId,
      };
      update(next.id, taken);
      return taken;
    },
    answered(id: string): void {
      update(id, { state: 'answered' });
    },
    /** A send failed: the question waits for the next bar again. */
    release(id: string): void {
      update(id, { state: 'queued' });
    },
    remove(id: string): void {
      write(read().filter((entry) => entry.id !== id));
    },
  };
}

export type QuestionQueue = ReturnType<typeof createQuestionQueue>;

let shared: QuestionQueue | undefined;
/** The phone's queue (MMKV `cp-search`). */
export const questionQueue = (): QuestionQueue => (shared ??= createQuestionQueue(searchStore()));

/** The queue's questions, following every change. */
export function useQueuedQuestions(): readonly QueuedQuestion[] {
  const queue = questionQueue();
  return useSyncExternalStore(queue.subscribe, queue.all);
}
