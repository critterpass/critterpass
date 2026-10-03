/**
 * The `links.extract_places` reply: whether the post is about the trip's destination, and up to ten
 * place mentions, each with the words that name it and the line it came from, both copied from the
 * post. No ids: matching mentions to places is code.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { POI_CATEGORIES, type PoiCategory } from '@cp/domain';
import { z } from 'zod';

export const LINK_MENTIONS_MAX = 10;
export const LINK_LABEL_MAX = 120;
export const LINK_QUOTE_MAX = 240;

export const LINK_DESTINATIONS = ['this', 'other', 'unclear'] as const;

export const LINK_EXTRACT_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['destination', 'mentions'],
    properties: {
      destination: {
        type: 'string',
        enum: [...LINK_DESTINATIONS],
        description: 'Is the post about the trip destination?',
      },
      mentions: {
        type: 'array',
        maxItems: LINK_MENTIONS_MAX,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['label', 'kind_hint', 'area_hint', 'quote'],
          properties: {
            label: { type: 'string', description: 'The words naming the place, copied exactly' },
            kind_hint: { type: 'string', enum: [...POI_CATEGORIES] },
            area_hint: { type: ['string', 'null'], description: 'An area name from the post' },
            quote: { type: 'string', description: 'The line it came from, copied exactly' },
          },
        },
      },
    },
  },
};

export const linkExtractReplySchema = z.object({
  destination: z.enum(LINK_DESTINATIONS),
  mentions: z.array(
    z.object({
      label: z.string(),
      kind_hint: z.enum(POI_CATEGORIES),
      area_hint: z.string().nullable(),
      quote: z.string(),
    }),
  ),
});
export type LinkExtractReply = z.infer<typeof linkExtractReplySchema>;

export interface PlaceMention {
  readonly label: string;
  readonly kind_hint: PoiCategory;
  readonly area_hint?: string;
  readonly quote: string;
}

/**
 * `found`: mentions to match. `other_destination`: the post is about somewhere else. `none`: no
 * place could be read (a decline, a failed call or nothing in the post), so the screen offers a
 * screenshot or a search instead.
 */
export type LinkExtractResult =
  | { readonly status: 'found'; readonly mentions: readonly PlaceMention[] }
  | { readonly status: 'other_destination'; readonly mentions: readonly [] }
  | { readonly status: 'none'; readonly mentions: readonly []; readonly reason: string };
