import type { TurnEvent } from '../../runner/sse';

/**
 * Runs `events` to the end in the background and replays them to whoever reads the returned
 * generator; a reader that stops early no longer stops the source.
 */
export function detach(
  events: AsyncGenerator<TurnEvent, void, undefined>,
): AsyncGenerator<TurnEvent, void, undefined> {
  const buffer: TurnEvent[] = [];
  let finished = false;
  let failure: Error | undefined;
  let wake: (() => void) | undefined;
  const done = (async () => {
    try {
      for await (const event of events) {
        buffer.push(event);
        wake?.();
      }
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      finished = true;
      wake?.();
    }
  })();
  async function* reader(): AsyncGenerator<TurnEvent, void, undefined> {
    for (;;) {
      const next = buffer.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (finished) {
        await done;
        if (failure !== undefined) throw failure;
        return;
      }
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
      wake = undefined;
    }
  }
  return reader();
}
