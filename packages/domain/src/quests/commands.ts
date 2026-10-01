/**
 * Quest command payloads (docs/api-contracts.md §4.13): a traveller signs up for an optional quest;
 * the evaluator grants a finished quest's reward, and the daily job generates the day's quests.
 */
import { z } from 'zod';

export const signupQuestPayloadSchema = z.object({ quest_id: z.uuid() });
export type SignupQuestPayload = z.infer<typeof signupQuestPayloadSchema>;

/** System: the travellers the reward goes to (the quest's audience when it finished). */
export const grantQuestRewardPayloadSchema = z.object({
  quest_id: z.uuid(),
  uids: z.array(z.uuid()).max(64),
});
export type GrantQuestRewardPayload = z.infer<typeof grantQuestRewardPayloadSchema>;

export const QUEST_STATUSES = ['offered', 'active', 'completed', 'failed', 'expired'] as const;
export const questStatusSchema = z.enum(QUEST_STATUSES);
export type QuestStatus = z.infer<typeof questStatusSchema>;

/** `crew`: every traveller counts; `optional`: only those who signed up. */
export const QUEST_SCOPES = ['crew', 'optional'] as const;
export type QuestScope = (typeof QUEST_SCOPES)[number];
