/**
 * One streamed model round of a turn: text tokens pass through the tool-markup filter
 * (./tool-markup.ts) and the paragraph joiner before they reach the client, tool calls are
 * announced as they start, and the round ends with the model's message, the text it streamed and
 * what the filter held back (markup removed).
 */
import type Anthropic from '@anthropic-ai/sdk';
import type { AiRoute } from '@cp/domain';

import type { Gateway, GatewayInput } from '../client';
import type { UsageContext } from '../usage';
import type { TurnEvent } from './sse';
import type { TextJoiner } from './text-join';
import { toolMarkupFilter } from './tool-markup';

export interface RoundResult {
  readonly message: Anthropic.Messages.Message;
  /** Text already streamed this round. */
  readonly text: string;
  /** Text the filter held to the end of the round, markup removed; not yet streamed. */
  readonly tail: string;
  /** The round's text held tool-call markup. */
  readonly markup: boolean;
}

function streamEvent(event: Anthropic.Messages.RawMessageStreamEvent): TurnEvent | undefined {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    return { type: 'token', text: event.delta.text };
  }
  if (event.type === 'content_block_start') {
    const block = event.content_block;
    if (block.type === 'tool_use') {
      return { type: 'tool_start', tool: block.name, id: block.id };
    }
  }
  return undefined;
}

export async function* streamRound(
  gateway: Gateway,
  route: AiRoute,
  request: GatewayInput,
  usage: UsageContext,
  joiner: TextJoiner,
): AsyncGenerator<TurnEvent, RoundResult, undefined> {
  const filter = toolMarkupFilter();
  let message: Anthropic.Messages.Message | undefined;
  let text = '';
  for await (const part of gateway.streamModel(route, request, usage)) {
    if (part.kind === 'done') {
      message = part.result.message;
      continue;
    }
    const event = streamEvent(part.event);
    if (event?.type === 'token') {
      const safe = filter.push(event.text);
      if (safe === '') continue;
      text += safe;
      yield { type: 'token', text: joiner.token(safe) };
    } else if (event !== undefined) {
      if (event.type === 'tool_start') joiner.toolCall();
      yield event;
    }
  }
  if (message === undefined) throw new Error('model stream ended without a message');
  const end = filter.end();
  return { message, text, tail: end.text, markup: end.found };
}
