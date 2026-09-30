/**
 * The morning briefing: the guide words the worker's candidates, the validator checks every id and
 * number against them, and anything short of a clean reply (a failed call, a decline, bad JSON, an
 * invented number) falls back to the template lines with `fallbackUsed` set.
 */
import type { Gateway } from '../../client';
import { isDeclined, parseStructuredText, textOf } from '../../structured';
import type { UsageContext } from '../../usage';
import { templateBriefing } from './fallback';
import { buildBriefingRequest, BRIEFING_ROUTE, type BriefingPromptInput } from './prompt';
import { briefingReplySchema, type BriefingLine } from './schema';
import { validateBriefingReply } from './validate';

export * from './fallback';
export * from './prompt';
export * from './schema';
export * from './validate';

export interface BriefingResult {
  readonly lines: readonly BriefingLine[];
  readonly fallbackUsed: boolean;
  /** Why the model's reply was not used, when it was not. */
  readonly rejected?: string;
}

export async function writeBriefing(
  gateway: Pick<Gateway, 'callModel'>,
  input: BriefingPromptInput,
  context: UsageContext = {},
): Promise<BriefingResult> {
  if (input.candidates.length === 0) return { lines: [], fallbackUsed: false };
  const fallback = (rejected: string): BriefingResult => ({
    lines: templateBriefing(input.candidates),
    fallbackUsed: true,
    rejected,
  });
  try {
    const result = await gateway.callModel(BRIEFING_ROUTE, buildBriefingRequest(input), context);
    if (isDeclined(result.message)) return fallback('declined');
    const reply = briefingReplySchema.safeParse(parseStructuredText(textOf(result.message)));
    if (!reply.success) return fallback('unparseable');
    const verdict = validateBriefingReply(reply.data, input.candidates);
    return verdict.ok ? { lines: verdict.lines, fallbackUsed: false } : fallback(verdict.reason);
  } catch {
    return fallback('call_failed');
  }
}
