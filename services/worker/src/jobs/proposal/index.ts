/**
 * Proposal jobs, wired from the worker's environment: the model writes versions, reads replies and
 * words suggestions when `ANTHROPIC_API_KEY` (the DeepSeek key) or `TYPESAFE_API_KEY` is set, and
 * the poster and postcard are drawn when the R2 media bucket is configured. Building the jobs also
 * registers the proposal pushes, once per process.
 */
import {
  createDecisionClient,
  createGateway,
  recordUsage,
  type AiUsageRecord,
  type AssertRouteOn,
  type Telemetry,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type { DecisionRoute } from '@cp/domain';
import type pg from 'pg';

import type { AnyJobDefinition } from '../../boss/define-job';
import { createAvatarMediaStore } from '../avatar/media-store';
import { dropoutJob } from './dropout';
import { followupJob } from './followup';
import { registerProposalNotifications } from './notify';
import { replyByJob } from './reply-by';
import { decisionIntentReader, rsvpIntentJob } from './rsvp-intent';
import { createShareCardRenderer } from './share-cards';
import { suggestionsJob } from './suggestions';
import { proposalVersionsJob } from './versions';
import { proposalWaitlistJob } from './waitlist';

export { registerProposalNotifications } from './notify';

export interface ProposalJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
  readonly R2_S3_ENDPOINT?: string | undefined;
  readonly R2_BUCKET?: string | undefined;
  readonly R2_ACCESS_KEY_ID?: string | undefined;
  readonly R2_SECRET_ACCESS_KEY?: string | undefined;
}

export function proposalJobs(
  env: ProposalJobsEnv,
  pool: pg.Pool,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  registerProposalNotifications();
  const onUsage = (record: AiUsageRecord) => recordUsage((fn) => withSystem(pool, fn), record);
  const gateway =
    env.ANTHROPIC_API_KEY === undefined
      ? undefined
      : createGateway({
          apiKey: env.ANTHROPIC_API_KEY,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...(telemetry === undefined ? {} : { telemetry }),
          onUsage,
          assertRouteOn: switches.assertAiRoute,
        });
  const decisions =
    gateway === undefined && env.TYPESAFE_API_KEY === undefined
      ? undefined
      : createDecisionClient({
          apiKey: env.TYPESAFE_API_KEY,
          ...(gateway === undefined ? {} : { gateway }),
          onUsage,
          assertRouteOn: (route: DecisionRoute) => switches.assertAiRoute(route),
          ...(telemetry === undefined ? {} : { telemetry }),
        });
  const store =
    env.R2_S3_ENDPOINT && env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY
      ? createAvatarMediaStore({
          endpoint: env.R2_S3_ENDPOINT,
          bucket: env.R2_BUCKET,
          accessKeyId: env.R2_ACCESS_KEY_ID,
          secretAccessKey: env.R2_SECRET_ACCESS_KEY,
        })
      : undefined;
  return [
    proposalVersionsJob({
      writer: gateway === undefined ? undefined : () => gateway,
      render: store === undefined ? undefined : createShareCardRenderer(store),
      onUsage,
    }),
    rsvpIntentJob(decisions === undefined ? undefined : decisionIntentReader(decisions)),
    dropoutJob(),
    suggestionsJob(gateway),
    replyByJob(),
    followupJob(),
    proposalWaitlistJob(),
  ];
}
