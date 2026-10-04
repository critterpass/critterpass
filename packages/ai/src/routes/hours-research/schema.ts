/**
 * The `hours.research` reply: propose one weekly schedule from one cited page, or decline. The JSON
 * schema is what the model is asked for; the zod schema is what code accepts before any check.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { WEEKDAYS } from '@cp/domain';
import { z } from 'zod';

const SPANS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['start', 'end'],
    properties: {
      start: { type: 'string', description: 'HH:MM, 24-hour, local time' },
      end: { type: 'string', description: 'HH:MM, 24-hour; 24:00 for midnight' },
    },
  },
};

export const HOURS_RESEARCH_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['decision', 'reason', 'source_url', 'confidence', 'always_open', 'weekly'],
    properties: {
      decision: { type: 'string', enum: ['propose', 'decline'] },
      reason: { type: 'string', description: 'One short sentence: why this answer' },
      source_url: { type: 'string', description: 'The result URL that states the hours' },
      confidence: { type: 'number', description: '0 to 1' },
      always_open: { type: 'boolean', description: 'True only when a result says open 24 hours' },
      weekly: {
        type: 'object',
        additionalProperties: false,
        required: [...WEEKDAYS],
        properties: Object.fromEntries(WEEKDAYS.map((day) => [day, SPANS_SCHEMA])),
      },
    },
  },
};

const spans = z.array(z.object({ start: z.string(), end: z.string() })).default([]);

export const hoursResearchReplySchema = z.object({
  decision: z.enum(['propose', 'decline']),
  reason: z.string(),
  source_url: z.string(),
  confidence: z.number().min(0).max(1),
  always_open: z.boolean(),
  weekly: z.object({
    mo: spans,
    tu: spans,
    we: spans,
    th: spans,
    fr: spans,
    sa: spans,
    su: spans,
  }),
});
export type HoursResearchReply = z.infer<typeof hoursResearchReplySchema>;
