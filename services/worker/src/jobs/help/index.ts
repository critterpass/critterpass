/**
 * Help centre jobs: feedback triage with the tracker forward, and the "we fixed it" card. Triage
 * runs on whatever AI is configured (the typed decision needs `TYPESAFE_API_KEY` or the model key
 * for its twin; the summary needs the model key); the forward is on only when
 * `FEEDBACK_GITHUB_REPO` and `FEEDBACK_GITHUB_TOKEN` are both set.
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

import type { AnyJobDefinition } from '../../boss';
import { feedbackForwardJob } from './feedback-forward';
import { feedbackFixShippedJob } from './fix-shipped';
import { trackerFromEnv, type FeedbackTrackerEnv } from './github';

export { feedbackForwardJob, forwardFeedback } from './feedback-forward';
export { feedbackFixShippedJob, registerHelpFanouts, tellFixShipped } from './fix-shipped';

export interface HelpJobsEnv extends FeedbackTrackerEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
}

export interface HelpJobsDeps {
  readonly pool: pg.Pool;
  readonly assertRouteOn: AssertRouteOn;
  readonly telemetry?: Telemetry | undefined;
}

export function helpJobs(env: HelpJobsEnv, deps: HelpJobsDeps): AnyJobDefinition[] {
  const onUsage = (record: AiUsageRecord) => recordUsage((fn) => withSystem(deps.pool, fn), record);
  const telemetry = deps.telemetry === undefined ? {} : { telemetry: deps.telemetry };
  const apiKey = env.ANTHROPIC_API_KEY;
  const gateway =
    apiKey === undefined || apiKey === ''
      ? undefined
      : createGateway({
          apiKey,
          ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
          ...telemetry,
          onUsage,
          assertRouteOn: deps.assertRouteOn,
        });
  const decisions =
    gateway === undefined && (env.TYPESAFE_API_KEY ?? '') === ''
      ? undefined
      : createDecisionClient({
          apiKey: env.TYPESAFE_API_KEY,
          ...(gateway === undefined ? {} : { gateway }),
          onUsage,
          assertRouteOn: (route: DecisionRoute) => deps.assertRouteOn(route),
          ...telemetry,
        });
  return [
    feedbackForwardJob({ ai: { decisions, gateway }, tracker: trackerFromEnv(env) }),
    feedbackFixShippedJob(),
  ];
}
