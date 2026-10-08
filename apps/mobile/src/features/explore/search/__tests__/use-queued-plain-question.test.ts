/**
 * A plain-words question asked with no signal survives the app being killed and goes out once:
 * two senders racing at the first bar never both take it, a failed send puts it back, and a send
 * the app was killed in the middle of is retried.
 */
import { describe, expect, it } from '@jest/globals';

import { createQuestionQueue, type QueueStorage } from '@/data/places/question-queue';

function memory(): QueueStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getString: (key) => data.get(key), set: (key, value) => data.set(key, value) };
}

const TRIP = '0199a3f0-0000-7000-8000-00000000f001';
const THREAD = '0199a3f0-0000-7000-8000-00000000a001';

describe('queued plain-words questions', () => {
  it('survives an app kill: a new queue over the same storage still has it', () => {
    const storage = memory();
    createQuestionQueue(storage).enqueue({
      id: 'q1',
      tripId: TRIP,
      threadId: null,
      text: 'coffee near the terraces',
    });
    const relaunched = createQuestionQueue(storage);
    expect(relaunched.all().map((entry) => [entry.text, entry.state])).toEqual([
      ['coffee near the terraces', 'queued'],
    ]);
  });

  it('sends once: the second sender at the first bar finds nothing to take', () => {
    const storage = memory();
    const queue = createQuestionQueue(storage);
    queue.enqueue({ id: 'q1', tripId: TRIP, threadId: null, text: 'a waterfall without crowds' });
    const first = queue.take({ threadId: THREAD });
    expect([first?.id, first?.threadId, first?.state]).toEqual(['q1', THREAD, 'sending']);
    expect(queue.take()).toBeNull();
    expect(createQuestionQueue(storage, () => Date.now()).take()).toBeNull();
    queue.answered('q1');
    expect(queue.all().map((entry) => entry.state)).toEqual(['answered']);
  });

  it('a failed send waits for the next bar; a send cut off by a kill is retried later', () => {
    const storage = memory();
    let clock = Date.parse('2026-10-04T03:00:00Z');
    const queue = createQuestionQueue(storage, () => clock);
    queue.enqueue({ id: 'q1', tripId: TRIP, threadId: null, text: 'dinner' });
    queue.take();
    queue.release('q1');
    expect(queue.take()?.id).toBe('q1');
    clock += 3 * 60 * 1000;
    const relaunched = createQuestionQueue(storage, () => clock);
    expect(relaunched.take()?.id).toBe('q1');
  });

  it('keeps questions of another thread for their own sender', () => {
    const queue = createQuestionQueue(memory());
    queue.enqueue({ id: 'q1', tripId: TRIP, threadId: 'other', text: 'x' });
    expect(queue.take({ threadId: THREAD })).toBeNull();
    expect(queue.take({ threadId: 'other' })?.id).toBe('q1');
  });

  it('never hands a question bound to a thread to a sender that names no thread', () => {
    const bound = () => {
      const queue = createQuestionQueue(memory());
      queue.enqueue({ id: 'private', tripId: TRIP, threadId: 'A', text: 'only for me' });
      return queue;
    };
    expect(bound().take({ tripId: TRIP })).toBeNull();
    expect(bound().take()).toBeNull();
    expect(bound().take({ threadId: 'B', tripId: TRIP })).toBeNull();
    expect(bound().take({ threadId: 'A' })?.id).toBe('private');
  });

  it('hands a question with no thread yet to any sender of its trip', () => {
    const unbound = () => {
      const queue = createQuestionQueue(memory());
      queue.enqueue({ id: 'search', tripId: TRIP, threadId: null, text: 'coffee' });
      return queue;
    };
    expect(unbound().take({ tripId: TRIP })?.id).toBe('search');
    expect(unbound().take({ threadId: 'B', tripId: TRIP })?.threadId).toBe('B');
    expect(unbound().take({ threadId: 'A' })?.id).toBe('search');
  });
});
