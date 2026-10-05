import { describe, expect, it, jest } from '@jest/globals';

import { ensurePlaceOnPhone } from '../use-place-on-phone';

jest.mock('expo-router', () => ({ useFocusEffect: () => undefined }));

/** A phone whose catalogue holds the place once `arrives` says so. */
function phone(arrives: () => boolean) {
  return {
    getAll: <T>() => Promise.resolve((arrives() ? [{ held: 1 }] : []) as T[]),
    onChange: () => undefined,
  };
}

describe('getting a searched place onto the phone before Add to plan opens', () => {
  it('opens at once for a place the phone holds, without saving it', async () => {
    const send = jest.fn(() => Promise.resolve({ kind: 'sent' }));
    expect(
      await ensurePlaceOnPhone(
        phone(() => true),
        send,
        'trip-a',
        'place-a',
      ),
    ).toBe('here');
    expect(send).not.toHaveBeenCalled();
  });

  it('says a refused save was refused', async () => {
    const send = jest.fn(() => Promise.resolve({ kind: 'rejected' }));
    expect(
      await ensurePlaceOnPhone(
        phone(() => false),
        send,
        'trip-b',
        'place-b',
      ),
    ).toBe('refused');
  });

  it('opens once the saved place arrives', async () => {
    let calls = 0;
    const send = jest.fn(() => Promise.resolve({ kind: 'sent' }));
    // Not there at first, there on the next look.
    expect(
      await ensurePlaceOnPhone(
        phone(() => calls++ > 0),
        send,
        'trip-c',
        'place-c',
      ),
    ).toBe('here');
  });

  it('never opens on a place that has not arrived, and asking again does not save it twice', async () => {
    jest.useFakeTimers();
    const send = jest.fn(() => Promise.resolve({ kind: 'sent' }));
    const db = phone(() => false);
    const first = ensurePlaceOnPhone(db, send, 'trip-d', 'place-d');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await first).toBe('onTheWay');
    const again = ensurePlaceOnPhone(db, send, 'trip-d', 'place-d');
    await jest.advanceTimersByTimeAsync(10_000);
    expect(await again).toBe('onTheWay');
    expect(send).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });
});
