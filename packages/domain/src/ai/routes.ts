/**
 * The closed set of AI gateway routes (docs/api-contracts.md §6 "Model routing"): every model call
 * names one, and `packages/ai/src/routing.ts` maps each to a model tier and request shape. Callers
 * are the tool allow-list classes from the same section: C guide chat 1:1, G guide in crew chat,
 * D drafting/redraft jobs, R replan/disruption/watch jobs, B briefing/roundup/quests/recap jobs,
 * M camera/receipt/email parsers (no tools, structured output only).
 */
import { z } from 'zod';

export const AI_ROUTES = [
  // Haiku 4.5: chat, voice, quests, parsing, micro-lines and classifiers.
  'guide.chat',
  'guide.voice',
  'guide.crew_mention',
  'guide.chime_in_classifier',
  'help.intent_classifier',
  'quests.generate',
  'roundup.evening',
  'email.parse',
  'idea.duplicate_tiebreak',
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
] as const;
export const aiRouteSchema = z.enum(AI_ROUTES);
export type AiRoute = z.infer<typeof aiRouteSchema>;

export const AI_TIERS = ['haiku', 'sonnet', 'opus'] as const;
export const aiTierSchema = z.enum(AI_TIERS);
export type AiTier = z.infer<typeof aiTierSchema>;

export const AI_CALLERS = ['C', 'G', 'D', 'R', 'B', 'M'] as const;
export const aiCallerSchema = z.enum(AI_CALLERS);
export type AiCaller = z.infer<typeof aiCallerSchema>;
