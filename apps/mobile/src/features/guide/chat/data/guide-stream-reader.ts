/**
 * Posts a guide request and reads its Server-Sent Events, handing each frame to `onFrame` as it
 * arrives. A stream that goes quiet (the server beats every 15 s) is given up as a dropped
 * connection, so the guide never thinks for ever on a stalled line; stopping the request ends the
 * wait at once, whatever the transport does with the abort.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values and headers, never copy. */
import {
  GuideStreamError,
  parseGuideFrames,
  refusal,
  type GuideFetch,
  type GuideFrame,
} from './guide-frames';

/** How long a stream may send nothing, heartbeats included, before it counts as stalled. */
export const STREAM_QUIET_MS = 45_000;

/**
 * Ends a wait when the caller stops the request or nothing has arrived for `quietMs`: the request
 * is aborted and whatever `race` is waiting on fails. `alive` restarts the quiet period.
 */
function watchdog(outer: AbortSignal | undefined, quietMs: number) {
  const request = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let end: () => void = () => undefined;
  const cut = new Promise<never>((_resolve, reject) => {
    end = () => {
      request.abort();
      reject(new GuideStreamError(null));
    };
  });
  // Nobody may be waiting on `cut` when it rejects (the stream had already ended).
  cut.catch(() => undefined);
  const stopped = () => end();
  outer?.addEventListener('abort', stopped);
  if (outer?.aborted === true) end();
  return {
    signal: request.signal,
    /** `step`, unless the request is cut first; a step that fails after the cut is let go. */
    race: <T>(step: Promise<T>): Promise<T> => {
      step.catch(() => undefined);
      return Promise.race([step, cut]);
    },
    alive: () => {
      clearTimeout(timer);
      timer = setTimeout(end, quietMs);
    },
    done: () => {
      clearTimeout(timer);
      outer?.removeEventListener('abort', stopped);
    },
  };
}

export async function postGuideStream(
  send: GuideFetch,
  request: {
    readonly url: string;
    readonly headers: Record<string, string>;
    readonly body: unknown;
  },
  onFrame: (frame: GuideFrame) => void,
  options: { signal?: AbortSignal; quietMs?: number } = {},
): Promise<void> {
  const watch = watchdog(options.signal, options.quietMs ?? STREAM_QUIET_MS);
  watch.alive();
  try {
    let response;
    try {
      response = await watch.race(
        send(request.url, {
          method: 'POST',
          headers: {
            ...request.headers,
            'content-type': 'application/json',
            accept: 'text/event-stream',
          },
          body: JSON.stringify(request.body),
          signal: watch.signal,
        }),
      );
    } catch {
      throw new GuideStreamError(null);
    }
    if (!response.ok || response.body === null) {
      throw refusal(response.status, await response.text().catch(() => ''));
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    try {
      for (;;) {
        watch.alive();
        const { value, done } = await watch.race(reader.read());
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseGuideFrames(buffer);
        buffer = parsed.rest;
        for (const frame of parsed.frames) onFrame(frame);
      }
    } catch {
      void reader.cancel().catch(() => undefined);
      throw new GuideStreamError(null);
    }
    for (const frame of parseGuideFrames(`${buffer}\n\n`).frames) onFrame(frame);
  } finally {
    watch.done();
  }
}
