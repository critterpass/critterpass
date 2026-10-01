/**
 * Translating guide-written lines (route `guide_text.translate`): the lines go in with short ids,
 * the same ids come back with the line in the reader's language.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

/** Lines per model call; a longer list is sent in batches of this size. */
export const TRANSLATE_BATCH_LINES = 30;

export interface TranslateLine {
  /** Stable within one call (`t1`, `t2`, …); the model answers with these ids only. */
  readonly id: string;
  readonly text: string;
  /** The longest translation the surface can show, in characters. */
  readonly max: number;
  /** A heading shown on one line. */
  readonly title?: boolean;
}

export const translateReplySchema = z.object({
  items: z.array(z.object({ id: z.string(), text: z.string() })),
});
export type TranslateReply = z.infer<typeof translateReplySchema>;

export const TRANSLATE_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['id', 'text'],
          properties: { id: { type: 'string' }, text: { type: 'string' } },
        },
      },
    },
  },
};
