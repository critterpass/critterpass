/**
 * Client specs for the community commands. Answers and ratings may wait in the offline queue;
 * copying a plan and making a link need the server's answer at once.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names, never copy. */
import type { ReportContentPayload, SharedPlanToggles } from '@cp/domain';
import { msg } from '@lingui/core/macro';

import { defineClientCommand } from '@/data/commands/summaries';

type PlanId = { readonly shared_plan_id: string };

export const publishSharedPlan = defineClientCommand<{
  readonly trip_id: string;
  readonly toggles: SharedPlanToggles;
}>({
  name: 'publish_shared_plan',
  offline: true,
  summarize: () =>
    msg({ id: 'community.queued.publish', message: 'Asking the crew to share the plan' }),
});

export const respondPublishConsent = defineClientCommand<PlanId & { readonly approve: boolean }>({
  name: 'respond_publish_consent',
  offline: true,
  summarize: () =>
    msg({ id: 'community.queued.consent', message: 'Your answer on sharing the plan' }),
});

export const withdrawPublishConsent = defineClientCommand<PlanId>({
  name: 'withdraw_publish_consent',
  offline: true,
  summarize: () => msg({ id: 'community.queued.withdraw', message: 'Taking the shared plan down' }),
});

export const updateSharedPlan = defineClientCommand<
  PlanId & { readonly toggles: SharedPlanToggles }
>({
  name: 'update_shared_plan',
  offline: true,
  summarize: () => msg({ id: 'community.queued.update', message: 'What the shared plan shows' }),
});

export const unpublishSharedPlan = defineClientCommand<PlanId>({
  name: 'unpublish_shared_plan',
  offline: true,
  summarize: () =>
    msg({ id: 'community.queued.unpublish', message: 'Taking the shared plan down' }),
});

export const createPlanLink = defineClientCommand<{ readonly trip_id: string }>({
  name: 'create_plan_link',
  offline: false,
  summarize: () => msg({ id: 'community.queued.link', message: 'A read-only link' }),
});

export const revokePlanLink = defineClientCommand<{ readonly link_id: string }>({
  name: 'revoke_plan_link',
  offline: true,
  summarize: () => msg({ id: 'community.queued.revoke', message: 'Turning a read-only link off' }),
});

export const saveSharedPlan = defineClientCommand<PlanId>({
  name: 'save_shared_plan',
  offline: true,
  summarize: () => msg({ id: 'community.queued.save', message: 'A crew plan saved' }),
});

export const unsaveSharedPlan = defineClientCommand<PlanId>({
  name: 'unsave_shared_plan',
  offline: true,
  summarize: () => msg({ id: 'community.queued.unsave', message: 'A crew plan unsaved' }),
});

export interface CopyPayload {
  readonly shared_plan_id: string;
  readonly trip_id: string;
  readonly days?: readonly number[];
}

export const copySharedPlan = defineClientCommand<CopyPayload>({
  name: 'copy_shared_plan',
  offline: false,
  summarize: () => msg({ id: 'community.queued.copy', message: 'A crew plan copied' }),
});

export const suggestSharedPlan = defineClientCommand<CopyPayload>({
  name: 'suggest_shared_plan_to_organiser',
  offline: true,
  summarize: () => msg({ id: 'community.queued.suggest', message: 'A crew plan suggested' }),
});

export interface RateVerdict {
  readonly poi_id: string;
  readonly verdict: 'loved' | 'fine' | 'skip';
  readonly tip?: string;
}

export const ratePlaces = defineClientCommand<{
  readonly trip_id: string;
  readonly verdicts: readonly RateVerdict[];
}>({
  name: 'rate_places',
  offline: true,
  summarize: () => msg({ id: 'community.queued.rate', message: 'Your place ratings' }),
});

export const reportContent = defineClientCommand<ReportContentPayload>({
  name: 'report_content',
  offline: true,
  summarize: () => msg({ id: 'community.queued.report', message: 'A crew plan reported' }),
});
