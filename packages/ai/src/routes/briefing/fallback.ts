/**
 * The template briefing: the three highest-priority candidates in their deterministic wording.
 * Used whenever the model fails, declines or answers out of bounds, so a morning never goes without
 * its briefing and never shows a number the facts do not hold.
 */
import { MAX_BRIEFING_ITEMS, type BriefingCandidate, type BriefingLine } from '@cp/domain';

export function templateBriefing(candidates: readonly BriefingCandidate[]): BriefingLine[] {
  return [...candidates]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_BRIEFING_ITEMS)
    .map((candidate) => ({ candidate, text: candidate.template, icon: candidate.icon }));
}
