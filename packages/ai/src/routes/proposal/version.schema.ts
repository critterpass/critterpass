/**
 * A personal proposal version's reply shape (route `proposal.personal`): story slides, the poster
 * and postcard lines, the picks with their reason tags, the savings the recipient may take and
 * the lead item. The model names plan items and options by id; every number is injected.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import type { PersonaId } from '../../persona/schema';

export const REASON_TAGS = [
  'your_must_do',
  'matches_taste',
  'crew_favourite',
  'good_value',
  'only_here',
] as const;
export type ReasonTag = (typeof REASON_TAGS)[number];

export const MAX_SLIDES = 6;
export const SLIDE_HEADLINE_MAX = 60;
export const SLIDE_BODY_MAX = 200;

export const versionReplySchema = z.object({
  slides: z
    .array(
      z.object({
        headline: z.string(),
        body: z.string(),
        item_id: z.string().nullable(),
      }),
    )
    .min(3)
    .max(MAX_SLIDES),
  poster: z.object({ title: z.string() }),
  postcard: z.object({ message: z.string() }),
  highlights: z.array(z.object({ item_id: z.string(), reason_tag: z.enum(REASON_TAGS) })).max(5),
  savings: z.array(z.object({ option_id: z.string() })).max(3),
  lead_item_id: z.string(),
});
export type VersionReply = z.infer<typeof versionReplySchema>;

export const VERSION_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['slides', 'poster', 'postcard', 'highlights', 'savings', 'lead_item_id'],
    properties: {
      slides: {
        type: 'array',
        minItems: 3,
        maxItems: MAX_SLIDES,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['headline', 'body', 'item_id'],
          properties: {
            headline: { type: 'string' },
            body: { type: 'string' },
            item_id: { type: ['string', 'null'] },
          },
        },
      },
      poster: {
        type: 'object',
        additionalProperties: false,
        required: ['title'],
        properties: { title: { type: 'string' } },
      },
      postcard: {
        type: 'object',
        additionalProperties: false,
        required: ['message'],
        properties: { message: { type: 'string' } },
      },
      highlights: {
        type: 'array',
        maxItems: 5,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item_id', 'reason_tag'],
          properties: {
            item_id: { type: 'string' },
            reason_tag: { type: 'string', enum: [...REASON_TAGS] },
          },
        },
      },
      savings: {
        type: 'array',
        maxItems: 3,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['option_id'],
          properties: { option_id: { type: 'string' } },
        },
      },
      lead_item_id: { type: 'string' },
    },
  },
};

/** One plan item as the guide sees it (via guide_reader). */
export interface VersionItem {
  readonly id: string;
  readonly title: string;
  readonly day: number | null;
  readonly category: string | null;
  /** The recipient asked for this one. */
  readonly must_do: boolean;
}

/** A saving the cost engine priced for this recipient; `amount` is the display label. */
export interface VersionSaving {
  readonly id: string;
  readonly label: string;
  readonly amount: string;
}

export interface VersionContext {
  readonly guide: PersonaId;
  readonly recipientFirstName: string;
  readonly destination: string;
  readonly dates: string | null;
  readonly tasteTags: readonly string[];
  readonly items: readonly VersionItem[];
  /** The recipient's own share label ("$1,310"); null when cost is hidden or unknown. */
  readonly share: string | null;
  readonly savings: readonly VersionSaving[];
  /** First names of the rest of the crew: the version may name none of them. */
  readonly otherNames: readonly string[];
  /**
   * The language the recipient's app is in (`app.user_locale`): their version is written in it.
   * Absent or `en` writes English.
   */
  readonly locale?: string;
}
