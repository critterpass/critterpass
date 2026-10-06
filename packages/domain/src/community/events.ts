/**
 * Community domain events (docs/api-contracts.md §4.16). Payloads carry ids and enum values only:
 * never a tip's text, and a consent answer names nobody but the person who gave it.
 */
import { z } from 'zod';

export const COMMUNITY_EVENT_TYPES = [
  'shared_plan.requested',
  'shared_plan.consent_given',
  'shared_plan.declined',
  'shared_plan.published',
  'shared_plan.updated',
  'shared_plan.unpublished',
  'shared_plan.saved',
  'shared_plan.unsaved',
  'shared_plan.copied',
  'shared_plan.suggested',
  'plan_link.created',
  'plan_link.revoked',
  'place.rated',
] as const;
export type CommunityEventType = (typeof COMMUNITY_EVENT_TYPES)[number];

const plan = z.object({ shared_plan_id: z.uuid() });
const tripPlan = plan.extend({ trip_id: z.uuid() });
const link = z.object({ link_id: z.uuid(), trip_id: z.uuid() });

export const COMMUNITY_EVENT_PAYLOADS = {
  'shared_plan.requested': tripPlan.extend({ user_id: z.uuid() }),
  'shared_plan.consent_given': tripPlan.extend({ user_id: z.uuid() }),
  'shared_plan.declined': tripPlan,
  'shared_plan.published': tripPlan,
  'shared_plan.updated': tripPlan,
  'shared_plan.unpublished': tripPlan.extend({
    reason: z.enum(['crew', 'consent_withdrawn', 'participant_left', 'ops']),
  }),
  'shared_plan.saved': plan.extend({ user_id: z.uuid() }),
  'shared_plan.unsaved': plan.extend({ user_id: z.uuid() }),
  'shared_plan.copied': tripPlan.extend({ user_id: z.uuid(), days: z.array(z.number().int()) }),
  'shared_plan.suggested': tripPlan.extend({ user_id: z.uuid() }),
  'plan_link.created': link,
  'plan_link.revoked': link,
  'place.rated': z.object({
    trip_id: z.uuid(),
    user_id: z.uuid(),
    poi_ids: z.array(z.uuid()),
    tips: z.number().int().min(0),
  }),
} as const satisfies Record<CommunityEventType, z.ZodType>;
