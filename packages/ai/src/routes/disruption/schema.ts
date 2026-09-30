/**
 * Grounded disruption copy (routes `disruption.plan_b`, `watch.copy`, `replan.weather`,
 * `late.options`): code decides every row, option, time and amount; the guide only words them.
 * The model gets items with ids, facts and a template line, and answers a headline, one detail
 * line and one line per item it words, by id. It never adds an item, a number or a claim.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

export type CopyFacts = Readonly<Record<string, string | number>>;

export interface CopyItem {
  readonly id: string;
  /** What the row is (for the model only): `retime_item`, `swap`, `rain`, … */
  readonly kind: string;
  readonly facts: CopyFacts;
  /** The deterministic wording, used whenever the model's is not. */
  readonly template: string;
}

export interface CopyInput {
  /** Facts the headline and detail may use (plus every item's). */
  readonly facts: CopyFacts;
  readonly headlineTemplate: string;
  readonly detailTemplate: string;
  readonly items: readonly CopyItem[];
}

export interface CopyLimits {
  readonly headlineMax: number;
  readonly detailMax: number;
  readonly itemMax: number;
  /**
   * Words the copy may not use unless the item's facts say so (`confirmed` only on a confirmed
   * vendor row, never "rebooked" for a flight we did not rebook). Matched case-insensitively.
   */
  readonly claims: readonly {
    readonly word: string;
    readonly allowedWhen: (facts: CopyFacts) => boolean;
  }[];
}

export const copyReplySchema = z.object({
  headline: z.string(),
  detail: z.string(),
  items: z.array(z.object({ id: z.string(), text: z.string() })).max(40),
});
export type CopyReply = z.infer<typeof copyReplySchema>;

export interface CopyResult {
  readonly headline: string;
  readonly detail: string;
  /** id → line, for every item (template where the guide's line was not used). */
  readonly lines: Readonly<Record<string, string>>;
  readonly fallbackUsed: boolean;
  readonly rejected?: string;
}

export const COPY_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['headline', 'detail', 'items'],
    properties: {
      headline: { type: 'string' },
      detail: { type: 'string' },
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
