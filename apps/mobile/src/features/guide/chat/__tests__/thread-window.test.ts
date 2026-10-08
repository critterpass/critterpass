/**
 * The guide thread's window and its follow rule: a long thread opens on its latest page, new
 * answers never push shown ones out, "Earlier messages" keeps the reader on their line, and a
 * growing answer pulls the view down only while the reader is at the end.
 */
import { describe, expect, it } from '@jest/globals';

import {
  atThreadEnd,
  earlierPin,
  scrollAfterResize,
  THREAD_PAGE,
  windowStart,
} from '../data/thread-window';

/** A thread of question and answer pairs: q0, a0, q1, a1, ... */
const thread = (pairs: number) =>
  Array.from({ length: pairs * 2 }, (_, index) => ({
    id: `${index % 2 === 0 ? 'q' : 'a'}${Math.floor(index / 2)}`,
    role: index % 2 === 0 ? ('user' as const) : ('guide' as const),
  }));

describe('the thread window', () => {
  it('shows a short thread whole', () => {
    expect(windowStart(thread(4), null)).toBe(0);
  });

  it('opens a long thread on its latest page', () => {
    const messages = thread(40);
    expect(windowStart(messages, null)).toBe(messages.length - THREAD_PAGE);
  });

  it('keeps the question of the first answer shown', () => {
    const messages = thread(5);
    // Three from the end would start on an answer: its question comes too.
    expect(messages[windowStart(messages, null, 3)]?.id).toBe('q3');
  });

  it('does not slide when answers arrive: the first shown message stays first', () => {
    const before = thread(40);
    const pinned = before[windowStart(before, null)]?.id ?? null;
    const after = [...before, ...thread(42).slice(80)];
    expect(after[windowStart(after, pinned)]?.id).toBe(pinned);
  });

  it('adds a page above on "Earlier messages", then the rest', () => {
    const messages = thread(40);
    const start = windowStart(messages, null);
    const earlier = earlierPin(messages, start);
    const next = windowStart(messages, earlier);
    expect(start - next).toBe(THREAD_PAGE);
    expect(windowStart(messages, earlierPin(messages, next))).toBe(0);
  });

  it('falls back to the latest page when the pinned message is gone', () => {
    const messages = thread(40);
    expect(windowStart(messages, 'removed')).toBe(messages.length - THREAD_PAGE);
  });
});

describe('following the end of the thread', () => {
  const at = (offset: number, content = 2000) => ({ offset, viewport: 600, content });

  it('counts the end, and a thread shorter than the screen, as the end', () => {
    expect(atThreadEnd(at(1400))).toBe(true);
    expect(atThreadEnd(at(1370))).toBe(true);
    expect(atThreadEnd(at(0, 300))).toBe(true);
    expect(atThreadEnd(at(900))).toBe(false);
  });

  it('follows a growing answer only while the reader is at the end', () => {
    expect(
      scrollAfterResize({ before: at(1400), content: 2040, following: true, addedAbove: false }),
    ).toBe('end');
    expect(
      scrollAfterResize({ before: at(900), content: 2040, following: false, addedAbove: false }),
    ).toBeNull();
  });

  it('keeps the reader on their line when earlier messages are added above', () => {
    expect(
      scrollAfterResize({ before: at(0), content: 3200, following: false, addedAbove: true }),
    ).toEqual({ y: 1200 });
  });
});
