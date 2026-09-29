/**
 * A small Server-Sent Events body for the structured AI routes (pitches, the guest brief): each
 * item of the source generator is one `event:`/`data:` frame; a comment heartbeat keeps proxies
 * open while the model is quiet; a client that disconnects aborts the work.
 */
export const SSE_RESPONSE_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

export interface SseFrame {
  readonly type: string;
  readonly [field: string]: unknown;
}

export function encodeFrame(frame: SseFrame, id: number): string {
  const { type, ...data } = frame;
  return `id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
}

export function sseBody(
  source: (signal: AbortSignal) => AsyncGenerator<SseFrame, void, undefined>,
  heartbeatMs = 15_000,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const abort = new AbortController();
  const frames = source(abort.signal);
  let seq = 0;
  let pending: Promise<IteratorResult<SseFrame, void>> | undefined;
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      pending ??= frames.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const beat = new Promise<'beat'>((resolve) => {
        timer = setTimeout(() => resolve('beat'), heartbeatMs);
      });
      const next = await Promise.race([pending, beat]);
      clearTimeout(timer);
      if (next === 'beat') {
        controller.enqueue(encoder.encode(': keep-alive\n\n'));
        return;
      }
      pending = undefined;
      if (next.done === true) {
        controller.close();
        return;
      }
      seq += 1;
      controller.enqueue(encoder.encode(encodeFrame(next.value, seq)));
    },
    async cancel() {
      abort.abort();
      if (pending !== undefined) await pending.catch(() => undefined);
      await frames.return(undefined);
    },
  });
}
