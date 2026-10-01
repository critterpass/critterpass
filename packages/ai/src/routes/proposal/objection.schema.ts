/**
 * The private objection reply (route `proposal.objection`): one line in the guide's voice, then
 * the offered options in the order the guide ranks them, each worded once. The options, their
 * amounts and which of them exist are the cost engine's; the model only orders and words them.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { PersonaId } from '../../persona/schema';

export const OBJECTION_LINE_MAX = 200;
export const OBJECTION_OPTION_MAX = 90;

export const objectionReplySchema = z.object({
  line: z.string(),
  options: z.array(z.object({ option_id: z.string(), text: z.string() })).max(6),
});
export type ObjectionReply = z.infer<typeof objectionReplySchema>;

export const OBJECTION_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['line', 'options'],
    properties: {
      line: { type: 'string' },
      options: {
        type: 'array',
        maxItems: 6,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['option_id', 'text'],
          properties: { option_id: { type: 'string' }, text: { type: 'string' } },
        },
      },
    },
  },
};

/** One deterministic option, with the display amount it saves (or none). */
export interface ObjectionOptionFact {
  readonly id: string;
  readonly kind: 'skip_item' | 'ask_crew' | 'follow_up';
  readonly label: string;
  readonly saves: string | null;
}

export interface ObjectionInput {
  readonly guide: PersonaId;
  readonly reason: 'cost' | 'dates' | 'plan' | 'other';
  /** The organiser's first name, for "{organiser} only sees 'maybe'". */
  readonly organiser: string;
  readonly options: readonly ObjectionOptionFact[];
  /** The recipient's own free text, if any: data, never instructions. */
  readonly text: string | null;
  /** The language the member's app is in: the reply is written in it. Absent or `en`: English. */
  readonly locale?: string;
}
