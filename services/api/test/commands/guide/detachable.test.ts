/**
 * The turn behind "ping me": when the phone lets go of the stream, the turn keeps running to its
 * end if someone is waiting for a ping, and is stopped otherwise; the phone's stream ends either way.
 */
import type { TurnEvent } from '@cp/ai';
import { describe, expect, it } from 'vitest';

import { detachable } from '../../../src/commands/guide/answer-pings';

function gate() {
  let open: () => void = () => undefined;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open };
}

function turn(after: Promise<void>, consumed: TurnEvent[]) {
  return (async function* events(): AsyncGenerator<TurnEvent, void, undefined> {
    const first: TurnEvent = { type: 'token', text: 'Checking' };
    consumed.push(first);
    yield first;
    await after;
    const done: TurnEvent = { type: 'done', sources: [] } as unknown as TurnEvent;
    consumed.push(done);
    yield done;
  })();
}

describe('detachable', () => {
  it('passes events through while the phone holds the stream', async () => {
    const consumed: TurnEvent[] = [];
    const { stream } = detachable(
      turn(Promise.resolve(), consumed),
      () => Promise.resolve(false),
      () => undefined,
    );
    const seen: string[] = [];
    for await (const event of stream) seen.push(event.type);
    expect(seen).toEqual(['token', 'done']);
  });

  it('keeps the turn running after the phone leaves when a ping waits', async () => {
    const consumed: TurnEvent[] = [];
    const wait = gate();
    let stopped = false;
    const { stream, leave } = detachable(
      turn(wait.opened, consumed),
      () => Promise.resolve(true),
      () => {
        stopped = true;
      },
    );
    expect((await stream.next()).value).toMatchObject({ type: 'token' });
    leave();
    expect((await stream.next()).done).toBe(true);
    wait.open();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(consumed.map((event) => event.type)).toEqual(['token', 'done']);
    expect(stopped).toBe(false);
  });

  it('stops the turn when the phone leaves and nobody waits', async () => {
    const consumed: TurnEvent[] = [];
    let stopped = false;
    const { stream, leave } = detachable(
      turn(new Promise(() => undefined), consumed),
      () => Promise.resolve(false),
      () => {
        stopped = true;
      },
    );
    await stream.next();
    leave();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(stopped).toBe(true);
  });
});
