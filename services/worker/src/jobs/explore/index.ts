/**
 * Explore jobs, wired from the worker's environment: the crew's Q&A line on a place page. Without
 * a model key the job stores nothing and the place page shows no line.
 */
import {
  createGateway,
  type AiUsageRecord,
  type AssertRouteOn,
  type Gateway,
  type Telemetry,
} from '@cp/ai';

import type { AnyJobDefinition } from '../../boss';
import { placeQnaJob } from './place-qna-summary';

export interface ExploreJobsEnv {
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
}

export type GatewayFactory = (
  onUsage: (record: AiUsageRecord) => Promise<void>,
) => Pick<Gateway, 'callModel'>;

export function exploreGateway(
  env: ExploreJobsEnv,
  assertRouteOn: AssertRouteOn,
  telemetry: Telemetry | undefined,
): GatewayFactory | undefined {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (apiKey === undefined || apiKey.length === 0) return undefined;
  return (onUsage) =>
    createGateway({
      apiKey,
      ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
      ...(telemetry === undefined ? {} : { telemetry }),
      onUsage,
      assertRouteOn,
    });
}

export function exploreJobs(
  env: ExploreJobsEnv,
  switches: { readonly assertAiRoute: AssertRouteOn },
  telemetry?: Telemetry,
): AnyJobDefinition[] {
  const gateway = exploreGateway(env, switches.assertAiRoute, telemetry);
  return [placeQnaJob(gateway)];
}
