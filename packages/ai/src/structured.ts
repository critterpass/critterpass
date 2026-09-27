/**
 * Reply conventions the gateway enforces in code rather than through provider features: JSON
 * replies requested by schema (the provider has no server-side output format) and the decline
 * marker that stands in for a refusal stop reason.
 */
import type Anthropic from '@anthropic-ai/sdk';

/**
 * The whole reply when the guide will not help (src/prompts/global-rules.md "Declining"). The
 * gateway maps it to `AI_REFUSED`, so a declined request gets the persona-voiced fallback copy and
 * releases its meter unit, exactly like a refusal.
 */
export const DECLINE_MARKER = '[[decline]]';

export const REPAIR_INSTRUCTION =
  'Your reply was not a JSON value. Reply again with the JSON only: no prose, no code fences.';

export function textOf(message: Pick<Anthropic.Messages.Message, 'content'>): string {
  return message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
}

export function isDeclined(message: Pick<Anthropic.Messages.Message, 'content'>): boolean {
  return textOf(message).trimStart().startsWith(DECLINE_MARKER);
}

/** The system instruction that carries a requested JSON output format. */
export function structuredInstruction(format: Anthropic.Messages.JSONOutputFormat): string {
  return [
    '# Reply format',
    '',
    'Reply with one JSON value only: no prose before or after it and no code fences. It must match this JSON Schema:',
    JSON.stringify(format.schema),
  ].join('\n');
}

const FENCED = /^```(?:json)?\s*\n([\s\S]*?)\n?```$/u;

/** The JSON value of a structured reply (a fenced block is unwrapped); `undefined` if it has none. */
export function parseStructuredText(text: string): unknown {
  const trimmed = text.trim();
  const body = (FENCED.exec(trimmed)?.[1] ?? trimmed).trim();
  if (!body.startsWith('{') && !body.startsWith('[')) return undefined;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
