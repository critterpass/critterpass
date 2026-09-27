/**
 * The closed set of AI gateway routes (docs/api-contracts.md §6 "Model routing"): every model call
 * names one, and `packages/ai/src/routing.ts` maps each to a model tier and request shape. Callers
 * are the tool allow-list classes from the same section: C guide chat 1:1, G guide in crew chat,
 * D drafting/redraft jobs, R replan/disruption/watch jobs, B briefing/roundup/quests/recap jobs,
 * M camera/receipt/email parsers (no tools, structured output only).
 *
 * Decision routes (`DECISION_ROUTES`) pick a label, answer yes/no or score a rubric; they run on
 * TypeSafe's Jev with a Haiku twin of the same answer shape as fallback
 * (docs/decisions/20260927-jev-decision-model.md). Every other route is generation and stays on
 * Claude.
 */
import { z } from 'zod';

export const AI_ROUTES = [
  // Haiku 4.5: chat, voice, quests, parsing and micro-lines.
  'guide.chat',
  'guide.voice',
  'guide.crew_mention',
  'quests.generate',
  'roundup.evening',
  'email.parse',
  'must_do.fit_line',
  'micro.line',
  // Sonnet 5: the workhorse.
  'guide.chat_escalation',
  'pitch.place',
  'draft.day',
  'draft.repair',
  'redraft.day',
  'proposal.personal',
  'briefing.daily',
  'disruption.plan_b',
  'recap.narration',
  'photo.picks',
  'notification.templates',
  'content.factory',
  'receipt.parse',
  'menu.parse',
  'email.parse_fallback',
  'guest.guide',
  // Opus 5.5: the itinerary skeleton only.
  'draft.skeleton',
  // Jev 1.13 typed decisions, each with a Haiku twin.
  'guide.chime_in_classifier',
  'help.intent_classifier',
  'idea.duplicate_tiebreak',
  'compliance.check',
] as const;
export const aiRouteSchema = z.enum(AI_ROUTES);
export type AiRoute = z.infer<typeof aiRouteSchema>;

/** Routes whose answer is a closed label, a yes/no probability or a rubric score. */
export const DECISION_ROUTES = [
  'guide.chime_in_classifier',
  'help.intent_classifier',
  'idea.duplicate_tiebreak',
  'compliance.check',
] as const satisfies readonly AiRoute[];
export type DecisionRoute = (typeof DECISION_ROUTES)[number];

export function isDecisionRoute(route: AiRoute): route is DecisionRoute {
  return (DECISION_ROUTES as readonly AiRoute[]).includes(route);
}

export const CLAUDE_TIERS = ['haiku', 'sonnet', 'opus'] as const;
export type ClaudeTier = (typeof CLAUDE_TIERS)[number];

/** Billing tier of one model call (`ai_usage.tier`): a Claude tier or the Jev decision model. */
export const AI_TIERS = [...CLAUDE_TIERS, 'jev'] as const;
export const aiTierSchema = z.enum(AI_TIERS);
export type AiTier = z.infer<typeof aiTierSchema>;

export const AI_PROVIDERS = ['claude', 'jev'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Which model answered a decision: Jev, or the route's Haiku twin on fallback. */
export const DECISION_ANSWERERS = ['jev', 'haiku'] as const;
export type DecisionAnswerer = (typeof DECISION_ANSWERERS)[number];

export const AI_CALLERS = ['C', 'G', 'D', 'R', 'B', 'M'] as const;
export const aiCallerSchema = z.enum(AI_CALLERS);
export type AiCaller = z.infer<typeof aiCallerSchema>;
