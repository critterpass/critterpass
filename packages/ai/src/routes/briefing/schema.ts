/**
 * The morning briefing's reply shape (route `briefing.daily`): at most three of the candidates the
 * worker computed, each worded once. The model names candidates by id; it never adds one.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { BRIEFING_ICONS, MAX_BRIEFING_ITEMS } from '@cp/domain';

export {
  briefingCandidateSchema,
  briefingReplySchema,
  BRIEFING_TEXT_MAX,
  MAX_BRIEFING_ITEMS,
  type BriefingCandidate,
  type BriefingLine,
  type BriefingReply,
} from '@cp/domain';

export const BRIEFING_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items'],
    properties: {
      items: {
        type: 'array',
        maxItems: MAX_BRIEFING_ITEMS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['candidate_id', 'text', 'icon'],
          properties: {
            candidate_id: { type: 'string' },
            text: { type: 'string' },
            icon: { type: 'string', enum: [...BRIEFING_ICONS] },
          },
        },
      },
    },
  },
};
