/**
 * The guide stream's wire events (docs/api-contracts.md §5.3) and their Server-Sent Events
 * encoding. `sseStream` pulls one event at a time from the turn, so a client that stops reading
 * stops the turn; it sends a comment heartbeat while the model is quiet (tool calls, long
 * thinking) so proxies keep the connection open, and cancels the turn when the client disconnects.
 */
import type { AiErrorCode } from '@cp/domain';

export type ToolCardStatus = 'ok' | 'no_data' | 'unavailable';

export interface ToolCard {
  readonly tool: string;
  readonly status: ToolCardStatus;
  /** Validated tool output; absent unless `status` is `ok`, never an invented value. */
  readonly data?: unknown;
}

export interface UsageSnapshot {
  readonly used: number;
  readonly limit: number;
  readonly reset_at: string;
}

export type TurnEvent =
  | { readonly type: 'token'; readonly text: string }
  | { readonly type: 'tool_start'; readonly tool: string; readonly id: string }
  | { readonly type: 'tool_result'; readonly id: string; readonly card: ToolCard }
  | { readonly type: 'proposal'; readonly changeset_id: string }
  /** The Help screen's routing card, shown beside the answer (Safety: self-harm or violence). */
  | { readonly type: 'help_card'; readonly topic: 'safety' }
  | { readonly type: 'audio'; readonly seq: number; readonly url?: string; readonly b64?: string }
  | ({ readonly type: 'usage' } & UsageSnapshot)
  | {
      readonly type: 'done';
      /** EU AI Act Art. 50: every guide payload is marked as AI-generated. */
      readonly ai_generated: true;
      readonly sources: readonly string[];
    }
  | { readonly type: 'error'; readonly code: AiErrorCode; readonly retryable: boolean };

/** One SSE frame: `event:` is the type, `data:` the JSON payload without it. */
export function encodeSseEvent(event: TurnEvent, id?: number): string {
  const { type, ...payload } = event;
  const idLine = id === undefined ? '' : `id: ${id}\n`;
  return `${idLine}event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export const SSE_HEARTBEAT = ': keep-alive\n\n';
export const SSE_HEADERS: Readonly<Record<string, string>> = {
  'content-type': 'text/event-stream; charset=utf-8',
  'cache-control': 'no-cache, no-transform',
  connection: 'keep-alive',
  'x-accel-buffering': 'no',
};

export interface SseStreamOptions {
  /** Heartbeat interval while no event is ready; default 15 s. */
  readonly heartbeatMs?: number;
  /** Aborted when the client disconnects, so the turn can stop its model call. */
  readonly abort?: AbortController;
}

/** A pull-based byte stream over the turn's events. */
export function sseStream(
  events: AsyncGenerator<TurnEvent, void, undefined>,
  options: SseStreamOptions = {},
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  let seq = 0;
  let pending: Promise<IteratorResult<TurnEvent, void>> | undefined;

  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      pending ??= events.next();
      let timer: ReturnType<typeof setTimeout> | undefined;
      const heartbeat = new Promise<'heartbeat'>((resolve) => {
        timer = setTimeout(() => resolve('heartbeat'), heartbeatMs);
      });
      const next = await Promise.race([pending, heartbeat]);
      clearTimeout(timer);
      if (next === 'heartbeat') {
        controller.enqueue(encoder.encode(SSE_HEARTBEAT));
        return;
      }
      pending = undefined;
      if (next.done === true) {
        controller.close();
        return;
      }
      seq += 1;
      controller.enqueue(encoder.encode(encodeSseEvent(next.value, seq)));
    },
    async cancel() {
      options.abort?.abort();
      // Wait for a model call already in flight to settle before finishing the generator, so its
      // cleanup (quota release) runs exactly once and after the call stopped.
      if (pending !== undefined) await pending.catch(() => undefined);
      await events.return(undefined);
    },
  });
}
