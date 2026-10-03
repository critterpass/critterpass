/**
 * Plan version and ChangeSet enums (docs/data-model.md §3.3, docs/data-model-sync-and-privacy.md
 * §3.6). `ChangeSet`'s allowed transitions are a state machine, not an enum: see
 * `packages/domain/src/state/change-set.ts`.
 */
import { z } from 'zod';

export const ITINERARY_VERSION_VISIBILITIES = ['organiser', 'crew'] as const;
export const itineraryVersionVisibilitySchema = z.enum(ITINERARY_VERSION_VISIBILITIES);
export type ItineraryVersionVisibility = z.infer<typeof itineraryVersionVisibilitySchema>;

export const ITINERARY_VERSION_STATUSES = [
  'drafting',
  'draft',
  'proposed',
  'current',
  'superseded',
] as const;
export const itineraryVersionStatusSchema = z.enum(ITINERARY_VERSION_STATUSES);
export type ItineraryVersionStatus = z.infer<typeof itineraryVersionStatusSchema>;

export const PLAN_ITEM_COST_MODELS = ['per_person', 'group', 'unit'] as const;
export const planItemCostModelSchema = z.enum(PLAN_ITEM_COST_MODELS);
export type PlanItemCostModel = z.infer<typeof planItemCostModelSchema>;

export const PLAN_ITEM_STATUSES = ['confirmed', 'proposed', 'voting'] as const;
export const planItemStatusSchema = z.enum(PLAN_ITEM_STATUSES);
export type PlanItemStatus = z.infer<typeof planItemStatusSchema>;

/** Also used by `change_sets.author_kind`; guides never write `plan_items` directly either way. */
export const CREATED_BY_KINDS = ['user', 'guide'] as const;
export const createdByKindSchema = z.enum(CREATED_BY_KINDS);
export type CreatedByKind = z.infer<typeof createdByKindSchema>;

export const CHANGE_SET_STATUSES = [
  'draft',
  'proposed',
  'voting',
  'approved',
  'applied',
  'rejected',
  'reverted',
  'stale',
] as const;
export const changeSetStatusSchema = z.enum(CHANGE_SET_STATUSES);
export type ChangeSetStatus = z.infer<typeof changeSetStatusSchema>;

export const CHANGE_SET_TRIGGERS = [
  'weather',
  'manual',
  'dropout',
  'delay',
  'chat',
  'redraft',
  'swap',
  'check',
  'ideas',
  'gap',
  'split',
] as const;
export const changeSetTriggerSchema = z.enum(CHANGE_SET_TRIGGERS);
export type ChangeSetTrigger = z.infer<typeof changeSetTriggerSchema>;

export const CHANGE_SET_SCOPES = ['group', 'personal'] as const;
export const changeSetScopeSchema = z.enum(CHANGE_SET_SCOPES);
export type ChangeSetScope = z.infer<typeof changeSetScopeSchema>;

/** Only `app_system` may write `'policy'` (docs/data-model.md §3.3). */
export const CHANGE_SET_APPROVED_BY_KINDS = ['vote', 'organiser', 'self', 'policy'] as const;
export const changeSetApprovedByKindSchema = z.enum(CHANGE_SET_APPROVED_BY_KINDS);
export type ChangeSetApprovedByKind = z.infer<typeof changeSetApprovedByKindSchema>;

export const GUIDE_ACTION_STATUSES = [
  'planned',
  'needs_approval',
  'running',
  'done',
  'failed',
  'undone',
] as const;
export const guideActionStatusSchema = z.enum(GUIDE_ACTION_STATUSES);
export type GuideActionStatus = z.infer<typeof guideActionStatusSchema>;
