/**
 * The `facts.research` reply: an entry fee, what to wear and up to three things to know before
 * going, each with the result URL it came from and the sentence on that page that says it, or a
 * decline. The JSON schema is what the model is asked for; the zod schema is what code accepts
 * before any check.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export const FACTS_ENTRY_MAX = 32;
export const FACTS_DRESS_MAX = 32;
export const FACTS_KNOW_MAX = 90;
export const FACTS_KNOW_COUNT = 3;

const SOURCED = {
  type: 'object',
  additionalProperties: false,
  required: ['value', 'source_url', 'quote'],
  properties: {
    value: { type: 'string' },
    source_url: { type: 'string', description: 'The result URL that says it' },
    quote: { type: 'string', description: 'The sentence from that result, copied exactly' },
  },
};

export const FACTS_RESEARCH_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'reason', 'confidence', 'entry', 'dress', 'know_before'],
    properties: {
      decision: { type: 'string', enum: ['propose', 'decline'] },
      reason: { type: 'string', description: 'One short sentence: why this answer' },
      confidence: { type: 'number', description: '0 to 1' },
      entry: { anyOf: [SOURCED, { type: 'null' }], description: 'Entry fee for one adult' },
      dress: { anyOf: [SOURCED, { type: 'null' }], description: 'What to wear to enter' },
      know_before: { type: 'array', maxItems: FACTS_KNOW_COUNT, items: SOURCED },
    },
  },
};

const sourced = z.object({ value: z.string(), source_url: z.string(), quote: z.string() });
export type SourcedFact = z.infer<typeof sourced>;

export const factsResearchReplySchema = z.object({
  decision: z.enum(['propose', 'decline']),
  reason: z.string(),
  confidence: z.number().min(0).max(1),
  entry: sourced.nullable(),
  dress: sourced.nullable(),
  know_before: z.array(sourced).default([]),
});
export type FactsResearchReply = z.infer<typeof factsResearchReplySchema>;
