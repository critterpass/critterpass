/**
 * Closed value sets of the AI tables (docs/data-model.md §3.3, §3.13); each migration CHECK
 * constraint is generated from these lists (packages/db/sql/gen-checks.ts). GuideAction statuses
 * live with the other plan enums in ../enums/plan.ts.
 */
import { z } from 'zod';

import type { GuideActionStatus } from '../enums/plan';

export const AGENT_JOB_KINDS = [
  'draft',
  'redraft',
  'merge',
  'proposal',
  'disruption',
  'recap',
  'quests',
  'pitch',
  'briefing',
  'content',
] as const;
export const agentJobKindSchema = z.enum(AGENT_JOB_KINDS);
export type AgentJobKind = z.infer<typeof agentJobKindSchema>;

export const AGENT_JOB_STATUSES = [
  'queued',
  'running',
  'succeeded',
  'failed',
  'cancelled',
] as const;
export const agentJobStatusSchema = z.enum(AGENT_JOB_STATUSES);
export type AgentJobStatus = z.infer<typeof agentJobStatusSchema>;

export const PERSONA_PACK_STATUSES = ['draft', 'approved'] as const;
export const personaPackStatusSchema = z.enum(PERSONA_PACK_STATUSES);
export type PersonaPackStatus = z.infer<typeof personaPackStatusSchema>;

export const GUIDE_OFFER_STATUSES = ['open', 'full', 'expired', 'cancelled'] as const;
export const guideOfferStatusSchema = z.enum(GUIDE_OFFER_STATUSES);
export type GuideOfferStatus = z.infer<typeof guideOfferStatusSchema>;

/**
 * GuideAction machine (docs/data-model-sync-and-privacy.md §3.6): planned → needs_approval →
 * running → done | failed; done → undone (compensation). An action the autonomy policy decides
 * `auto` skips approval (planned → running). Mirrored by the `guide_actions` status trigger.
 */
export const GUIDE_ACTION_TRANSITIONS: Readonly<
  Record<GuideActionStatus, readonly GuideActionStatus[]>
> = {
  planned: ['needs_approval', 'running'],
  needs_approval: ['running'],
  running: ['done', 'failed'],
  done: ['undone'],
  failed: [],
  undone: [],
};

export function canTransitionGuideAction(from: GuideActionStatus, to: GuideActionStatus): boolean {
  return GUIDE_ACTION_TRANSITIONS[from].includes(to);
}
