/**
 * Crew quest generation: the guide proposes, the validator decides. Every proposed quest is checked
 * against the day and the template table; invalid ones are dropped and the day is filled to three
 * with deterministic quests. A failed call, a decline or an unreadable reply means the day runs on
 * fallback quests alone (`fallbackUsed`).
 */
import { fillWithFallback, validateQuestList, type ValidQuest } from '@cp/domain';

import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { buildQuestsRequest, QUESTS_ROUTE, type QuestsPromptInput } from './prompt';
import { questsReplySchema } from './schema';

export * from './prompt';
export * from './schema';

export interface QuestsResult {
  readonly quests: readonly ValidQuest[];
  /** How many of the published quests came from the guide (the rest are fallback). */
  readonly fromGuide: number;
  readonly fallbackUsed: boolean;
  /** Why the guide's quests were dropped, item by item or whole. */
  readonly rejected: readonly string[];
}

export function fallbackQuests(
  input: QuestsPromptInput,
  rejected: readonly string[],
): QuestsResult {
  const quests = fillWithFallback([], input.day, input.templates);
  return { quests, fromGuide: 0, fallbackUsed: true, rejected };
}

export async function writeQuests(
  gateway: Pick<Gateway, 'callModel'>,
  input: QuestsPromptInput,
  context: UsageContext = {},
): Promise<QuestsResult> {
  try {
    const result = await gateway.callModel(QUESTS_ROUTE, buildQuestsRequest(input), context);
    if (isDeclined(result.message)) return fallbackQuests(input, ['declined']);
    const reply = questsReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return fallbackQuests(input, ['unparseable']);
    return fromReply(reply.data.quests, input);
  } catch {
    return fallbackQuests(input, ['call_failed']);
  }
}

/** The validator and the fill, on an already parsed reply (the eval suite grades this too). */
export function fromReply(
  candidates: Parameters<typeof validateQuestList>[0],
  input: QuestsPromptInput,
): QuestsResult {
  const valid = validateQuestList(candidates, input.day, input.templates);
  const quests = fillWithFallback(valid.quests, input.day, input.templates);
  return {
    quests,
    fromGuide: valid.quests.length,
    fallbackUsed: quests.length > valid.quests.length,
    rejected: valid.rejected,
  };
}
