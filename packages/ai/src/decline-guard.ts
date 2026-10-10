/** The gateway's streamed decline check (./client.ts): a declined reply's text is never streamed. */
import type Anthropic from '@anthropic-ai/sdk';

import { DECLINE_MARKER } from './structured';

type StreamEvent = Anthropic.Messages.RawMessageStreamEvent;

function textDelta(event: StreamEvent): string | undefined {
  return event.type === 'content_block_delta' && event.delta.type === 'text_delta'
    ? event.delta.text
    : undefined;
}

/**
 * Holds a stream's first text until it can tell a decline marker from an answer: an answer's
 * events are released in order, a declined reply's text never leaves the gateway.
 */
export class DeclineGuard {
  private held: StreamEvent[] = [];
  private text = '';
  private decided = false;
  declined = false;

  /** Events that may be yielded now. */
  push(event: StreamEvent): StreamEvent[] {
    const text = textDelta(event);
    if (this.decided) return this.declined && text !== undefined ? [] : [event];
    if (text === undefined && this.held.length === 0) return [event];
    this.held.push(event);
    this.text += text ?? '';
    const head = this.text.trimStart();
    if (head.length < DECLINE_MARKER.length && DECLINE_MARKER.startsWith(head)) return [];
    return this.decide();
  }

  /** Called at the end of the stream: whatever is still held is decided now. */
  flush(): StreamEvent[] {
    return this.decided ? [] : this.decide();
  }

  private decide(): StreamEvent[] {
    this.decided = true;
    this.declined = this.text.trimStart().startsWith(DECLINE_MARKER);
    const released = this.declined
      ? this.held.filter((event) => textDelta(event) === undefined)
      : this.held;
    this.held = [];
    return released;
  }
}
