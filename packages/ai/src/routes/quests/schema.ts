/**
 * The quest generator's reply shape (route `quests.generate`): up to four proposed quests, each a
 * registered template with its params, the guide's title and line, and an XP amount the validator
 * checks against the template's table. Targets, progress and extra rewards never come from here.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { MAX_DAILY_QUESTS, questCandidateSchema } from '@cp/domain';
import { z } from 'zod';

export const questsReplySchema = z.object({
  quests: z.array(questCandidateSchema).max(MAX_DAILY_QUESTS * 2),
});
export type QuestsReply = z.infer<typeof questsReplySchema>;

export function questsFormat(templateIds: readonly string[]): Anthropic.Messages.JSONOutputFormat {
  return {
    type: 'json_schema',
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['quests'],
      properties: {
        quests: {
          type: 'array',
          maxItems: MAX_DAILY_QUESTS,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['template_id', 'params', 'title', 'desc', 'reward'],
            properties: {
              template_id: { type: 'string', enum: [...templateIds] },
              params: { type: 'object' },
              title: { type: 'string' },
              desc: { type: 'string' },
              reward: {
                type: 'object',
                additionalProperties: false,
                required: ['xp'],
                properties: { xp: { type: 'integer' } },
              },
            },
          },
        },
      },
    },
  };
}
