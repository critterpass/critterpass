/**
 * Which face the Share the plan sheet shows for this person, from the trip's publishing state:
 * the composer (nothing shared yet, or the last ask was declined or taken down), the consent card
 * (someone asked and this person has not answered), waiting for the others, the published plan's
 * own page, or nothing to share yet (no plan).
 */
import type { TripSharedPlan } from '@cp/domain';

export type PublishFace =
  | { readonly kind: 'no_plan' }
  | { readonly kind: 'compose'; readonly after: 'declined' | 'unpublished' | null }
  | { readonly kind: 'consent'; readonly planId: string }
  | {
      readonly kind: 'waiting';
      readonly planId: string;
      readonly approved: number;
      readonly total: number;
    }
  | { readonly kind: 'published'; readonly planId: string };

export function publishFace(state: TripSharedPlan): PublishFace {
  const plan = state.plan;
  if (plan !== null && plan.status === 'published') return { kind: 'published', planId: plan.id };
  if (plan !== null && (plan.status === 'pending_consent' || plan.status === 'preparing')) {
    if (plan.my_decision === 'pending') return { kind: 'consent', planId: plan.id };
    return {
      kind: 'waiting',
      planId: plan.id,
      approved: plan.consents.approved,
      total: plan.consents.total,
    };
  }
  if (state.skeleton === null) return { kind: 'no_plan' };
  const after =
    plan?.status === 'declined'
      ? 'declined'
      : plan?.status === 'unpublished'
        ? 'unpublished'
        : null;
  return { kind: 'compose', after };
}

/** Only the person who asked and the trip's organisers change or take down a published plan. */
export function canManage(state: TripSharedPlan): boolean {
  return state.organiser || state.plan?.requested_by_me === true;
}
