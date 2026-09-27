/**
 * The worker's AI jobs: every agent job definition (features append theirs to `AGENT_JOBS`) and the
 * `ai.batch.poll` job that finishes their batch steps, registered once a Claude key is configured.
 */
import { createBatchClient, createLangfuseTelemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../boss';
import { aiBatchPollJob } from './batch-poll';
import type { AgentJobDefinition } from './job-runner';

export const AGENT_JOBS: readonly AgentJobDefinition[] = [];

export interface AiJobsEnv {
  readonly APP_ENV: string;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly LANGFUSE_PUBLIC_KEY?: string | undefined;
  readonly LANGFUSE_SECRET_KEY?: string | undefined;
  readonly LANGFUSE_HOST?: string | undefined;
}

export function aiJobs(
  env: AiJobsEnv,
  onTelemetryError: (error: unknown) => void = () => undefined,
): AnyJobDefinition[] {
  if (env.ANTHROPIC_API_KEY === undefined) return [...AGENT_JOBS];
  const telemetry = createLangfuseTelemetry({
    publicKey: env.LANGFUSE_PUBLIC_KEY,
    secretKey: env.LANGFUSE_SECRET_KEY,
    host: env.LANGFUSE_HOST,
    environment: env.APP_ENV,
    onError: onTelemetryError,
  });
  const batches = createBatchClient({
    apiKey: env.ANTHROPIC_API_KEY,
    telemetry,
    ...(env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL }),
  });
  return [...AGENT_JOBS, aiBatchPollJob({ batches, jobs: AGENT_JOBS })];
}

export { AI_BATCH_POLL_QUEUE, aiBatchPollJob, batchStep, type BatchStep } from './batch-poll';
export {
  defineAgentJob,
  suspendStep,
  type AgentJobDefinition,
  type AgentStep,
  type AgentStepContext,
} from './job-runner';
