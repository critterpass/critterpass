/**
 * The closed set of AI gateway routes (docs/api-contracts.md §6 "Model routing"): every model call
 * names one, and `packages/ai/src/routing.ts` maps each to a model tier and request shape. Callers
 * are the tool allow-list classes from the same section: C guide chat 1:1, G guide in crew chat,
 * D drafting/redraft jobs, R replan/disruption/watch jobs, B briefing/roundup/quests/recap jobs,
 * M camera/receipt/email parsers (no tools, structured output only).
 *
 * Decision routes (`DECISION_ROUTES`) pick a label, answer yes/no or score a rubric; they run on
 * TypeSafe's Jev with a fast-tier twin of the same answer shape as fallback
 * (docs/decisions/20260927-jev-decision-model.md). Every other route is generation and runs on
 * DeepSeek: the fast tier for chat, voice, parsing and short lines,
 * the pro tier for planning, redrafts, proposals and the itinerary skeleton.
 */
import { z } from 'zod';

export const AI_ROUTES = [
  // Chat, voice, quests, parsing and micro-lines.
  'guide.chat',
  'guide.voice',
  'guide.crew_mention',
  'quests.generate',
  'roundup.evening',
  'email.parse',
  'must_do.fit_line',
  'micro.line',
  'tips.phrase',
  'season.research',
  'hours.research',
  // Pitches, drafting, redrafts, proposals, briefings, recaps, parsers and the guest guide.
  'guide.chat_escalation',
  'pitch.place',
  'draft.day',
  'draft.repair',
  'redraft.day',
  'proposal.personal',
  'briefing.daily',
  'disruption.plan_b',
  'replan.weather',
  'recap.narration',
  'photo.picks',
  'avatar.moderate',
  'notification.templates',
  'content.factory',
  'receipt.parse',
  'menu.parse',
  'email.parse_fallback',
  'guest.guide',
  // Explore: the crew's Q&A line on a place page and the guide's notes on swipe cards.
  'explore.place_qna',
  'explore.swipe_notes',
  // The itinerary skeleton.
  'draft.skeleton',
  // Drafting on the fast tier: the skeleton when routed there, the summary line, closure extraction.
  'draft.skeleton_fast',
  'draft.summary',
  'draft.closures',
  // Disruption copy on the fast tier: the forecast watch list and running-late options.
  'watch.copy',
  'late.options',
  // Proposal lines on the fast tier: the private objection reply and the organiser's suggestions.
  'proposal.objection',
  'proposal.suggestion',
  // Guide-written shared text (plan notes, briefings, quests, pitches) into a reader's language.
  'guide_text.translate',
  // Help checklist wording and the crew SOS summary: words only, every fact from curated data.
  'help.checklist',
  'sos.summary',
  // Planning: plain words into search chips.
  'search.parse',
  // Jev 1.13 typed decisions, each with a fast-tier twin.
  'guide.chime_in_classifier',
  'help.intent_classifier',
  'idea.duplicate_tiebreak',
  'poi.duplicate_tiebreak',
  'compliance.check',
  'availability.reply_intent',
  'vendor.reply_intent',
  'rsvp.reply_intent',
] as const;
export const aiRouteSchema = z.enum(AI_ROUTES);
export type AiRoute = z.infer<typeof aiRouteSchema>;

/** Routes whose answer is a closed label, a yes/no probability or a rubric score. */
export const DECISION_ROUTES = [
  'guide.chime_in_classifier',
  'help.intent_classifier',
  'idea.duplicate_tiebreak',
  'poi.duplicate_tiebreak',
  'compliance.check',
  'availability.reply_intent',
  'vendor.reply_intent',
  'rsvp.reply_intent',
] as const satisfies readonly AiRoute[];
export type DecisionRoute = (typeof DECISION_ROUTES)[number];

export function isDecisionRoute(route: AiRoute): route is DecisionRoute {
  return (DECISION_ROUTES as readonly AiRoute[]).includes(route);
}

/** Generation tiers: `fast` (DeepSeek Flash) and `pro` (DeepSeek V4 Pro). */
export const GENERATION_TIERS = ['fast', 'pro'] as const;
export type GenerationTier = (typeof GENERATION_TIERS)[number];

/** Billing tier of one model call (`ai_usage.tier`): a generation tier or the Jev decision model. */
export const AI_TIERS = [...GENERATION_TIERS, 'jev'] as const;
export const aiTierSchema = z.enum(AI_TIERS);
export type AiTier = z.infer<typeof aiTierSchema>;

export const AI_PROVIDERS = ['deepseek', 'jev'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** Which model answered a decision: Jev, or the route's fast-tier twin on fallback. */
export const DECISION_ANSWERERS = ['jev', 'fast'] as const;
export type DecisionAnswerer = (typeof DECISION_ANSWERERS)[number];

export const AI_CALLERS = ['C', 'G', 'D', 'R', 'B', 'M'] as const;
export const aiCallerSchema = z.enum(AI_CALLERS);
export type AiCaller = z.infer<typeof aiCallerSchema>;
