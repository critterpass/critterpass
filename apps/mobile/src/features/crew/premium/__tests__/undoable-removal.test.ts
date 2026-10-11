import { describe, expect, it, jest } from '@jest/globals';

import { createUndoableRemoval } from '../../members/undoable-removal';

function harness() {
  jest.useFakeTimers();
  const sent: string[] = [];
  const waiting: (readonly string[])[] = [];
  const removal = createUndoableRemoval(
    (uid) => sent.push(uid),
    (now) => waiting.push(now),
    10_000,
  );
  return { sent, waiting, removal };
}

describe('removing with an Undo window', () => {
  it('sends the removal only once the window has passed', () => {
    const { sent, removal } = harness();
    removal.remove('dev');
    jest.advanceTimersByTime(9_999);
    expect(sent).toEqual([]);
    jest.advanceTimersByTime(1);
    expect(sent).toEqual(['dev']);
    expect(removal.waiting()).toEqual([]);
  });

  it('sends nothing when undone inside the window, and cannot undo after', () => {
    const { sent, removal } = harness();
    removal.remove('dev');
    expect(removal.undo('dev')).toBe(true);
    jest.advanceTimersByTime(20_000);
    expect(sent).toEqual([]);
    removal.remove('maya');
    jest.advanceTimersByTime(10_000);
    expect(removal.undo('maya')).toBe(false);
    expect(sent).toEqual(['maya']);
  });

  it('sends every waiting removal at once when the screen goes', () => {
    const { sent, removal } = harness();
    removal.remove('dev');
    removal.remove('rin');
    removal.remove('dev');
    removal.flush();
    expect(sent).toEqual(['dev', 'rin']);
    jest.advanceTimersByTime(20_000);
    expect(sent).toEqual(['dev', 'rin']);
  });
});
