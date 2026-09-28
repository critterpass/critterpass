/**
 * The worker's AI jobs: every agent job definition (features append theirs to `AGENT_JOBS`; bulk
 * work uses `batchStep`, direct calls with bounded concurrency) and `compliance.check` for
 * offline-created text (always registered: with no model configured it still applies each
 * surface's unavailable outcome, so public text fails closed to review).
 */
import { createLangfuseTelemetry, type AssertRouteOn, type Telemetry } from '@cp/ai';

import type { AnyJobDefinition } from '../boss';
import { complianceCheckJob } from './compliance-job';
import type { AgentJobDefinition } from './job-runner';

export const AGENT_JOBS: readonly AgentJobDefinition[] = [];

export interface AiJobsEnv {
  readonly APP_ENV: string;
  readonly ANTHROPIC_API_KEY?: string | undefined;
  readonly ANTHROPIC_BASE_URL?: string | undefined;
  readonly TYPESAFE_API_KEY?: string | undefined;
  readonly LANGFUSE_PUBLIC_KEY?: string | undefined;
  readonly LANGFUSE_SECRET_KEY?: string | undefined;
  readonly LANGFUSE_HOST?: string | undefined;
}

export function aiJobs(
  env: AiJobsEnv,
  onTelemetryError: (error: unknown) => void = () => undefined,
  /** The process's LLM observability (obs/langfuse.ts); Langfuse-only when absent. */
  observability: Telemetry | undefined,
  /** The ops kill switches, checked before every model call. */
  assertRouteOn: AssertRouteOn,
): AnyJobDefinition[] {
  const telemetry =
    observability ??
    createLangfuseTelemetry({
      publicKey: env.LANGFUSE_PUBLIC_KEY,
      secretKey: env.LANGFUSE_SECRET_KEY,
      host: env.LANGFUSE_HOST,
      environment: env.APP_ENV,
      onError: onTelemetryError,
    });
  const baseURL = env.ANTHROPIC_BASE_URL === undefined ? {} : { baseURL: env.ANTHROPIC_BASE_URL };
  const compliance = complianceCheckJob({
    typesafeApiKey: env.TYPESAFE_API_KEY,
    generation:
      env.ANTHROPIC_API_KEY === undefined
        ? undefined
        : { apiKey: env.ANTHROPIC_API_KEY, ...baseURL },
    telemetry,
    assertRouteOn,
  });
  return [...AGENT_JOBS, compliance];
}

export { batchStep, type BatchDeps, type BatchProgress, type BatchStepInput } from './batch-step';
export {
  COMPLIANCE_CHECK_QUEUE,
  COMPLIANCE_CHECK_SPEC,
  complianceCheckJob,
  complianceCheckPayloadSchema,
  registerComplianceHandler,
  type ComplianceCheckPayload,
  type ComplianceContent,
  type ComplianceHandler,
  type ComplianceJobOptions,
} from './compliance-job';
export {
  defineAgentJob,
  suspendStep,
  type AgentJobDefinition,
  type AgentStep,
  type AgentStepContext,
} from './job-runner';
