/**
 * `compliance.check`: screens text that was created offline once its command reaches the server
 * (docs/api-contracts.md §6 "Input compliance check"), never on the device. The payload names the
 * content only (`content_kind`, `content_id`); the text is read by the kind's registered handler,
 * so no user text sits in the job table. One job per content id (`exclusive` on
 * `<kind>:<id>`), and each kind's `apply` must be idempotent (a re-sent job applies the same
 * verdict again). A kind with no registered handler fails the job instead of dropping a verdict.
 *
 * Decision usage rows are written as app_system; with both Jev and the fast-tier twin down the surface
 * policy still answers (`public_text` goes to review), so the job completes either way.
 */
import {
  checkCompliance,
  createDecisionClient,
  createGateway,
  recordUsage,
  type AiUsageRecord,
  type AssertRouteOn,
  type GatewayEnvOptions,
  type Telemetry,
} from '@cp/ai';
import { withSystem } from '@cp/db';
import type { ComplianceResult, ComplianceSurface } from '@cp/domain';
import type pg from 'pg';
import { z } from 'zod';

import { DEFAULT_QUEUE_SPEC, defineJob, type JobDefinition, type QueueSpec } from '../boss';

export const COMPLIANCE_CHECK_QUEUE = 'compliance.check';

/** Keyed on the content (one queued-or-active check per item), dead-lettered after its retries. */
export const COMPLIANCE_CHECK_SPEC: QueueSpec = {
  ...DEFAULT_QUEUE_SPEC,
  policy: 'exclusive',
  deadLetter: true,
  notify: true,
};

export interface ComplianceContent {
  readonly text: string;
  /** Billed to (usage rows only); never sent to the model. */
  readonly userId?: string | null;
  readonly tripId?: string | null;
}

export interface ComplianceHandler {
  /** The surface this kind of content is screened as (`guide_input` is never offline). */
  readonly surface: Exclude<ComplianceSurface, 'guide_input'>;
  /** Reads the content; `null` when it was deleted before the check ran (nothing to do). */
  load(contentId: string, pool: pg.Pool): Promise<ComplianceContent | null>;
  /** Records the verdict on the content (publish, hold for review, reject); idempotent. */
  apply(contentId: string, result: ComplianceResult, pool: pg.Pool): Promise<void>;
}

const HANDLERS = new Map<string, ComplianceHandler>();

/** Called once per content kind by its owning feature module. */
export function registerComplianceHandler(kind: string, handler: ComplianceHandler): void {
  if (HANDLERS.has(kind)) throw new Error(`compliance handler already registered: ${kind}`);
  HANDLERS.set(kind, handler);
}

export const complianceCheckPayloadSchema = z.strictObject({
  content_kind: z.string().min(1),
  content_id: z.uuid(),
});
export type ComplianceCheckPayload = z.infer<typeof complianceCheckPayloadSchema>;

export interface ComplianceJobOptions {
  /** `TYPESAFE_API_KEY`; unset = every check answers from the fast-tier twin. */
  readonly typesafeApiKey?: string | undefined;
  /** The DeepSeek key (and endpoint override) for the fast-tier twin; unset with no Jev key =
   *  every check takes the surface's unavailable outcome. */
  readonly generation?: GatewayEnvOptions | undefined;
  readonly telemetry?: Telemetry;
  /** The ops kill switches: a switched-off check takes the surface's unavailable outcome. */
  readonly assertRouteOn?: AssertRouteOn | undefined;
}

export function complianceCheckJob(
  options: ComplianceJobOptions = {},
): JobDefinition<ComplianceCheckPayload> {
  return defineJob({
    queue: COMPLIANCE_CHECK_QUEUE,
    spec: COMPLIANCE_CHECK_SPEC,
    schema: complianceCheckPayloadSchema,
    singletonKey: (data) => `${data.content_kind}:${data.content_id}`,
    handler: async (data, ctx) => {
      const handler = HANDLERS.get(data.content_kind);
      if (handler === undefined) {
        throw new Error(`no compliance handler for content kind ${data.content_kind}`);
      }
      const content = await handler.load(data.content_id, ctx.pool);
      if (content === null) return { skipped: 'content_gone' };
      const onUsage = (record: AiUsageRecord) =>
        recordUsage((fn) => withSystem(ctx.pool, fn), record);
      const telemetry = options.telemetry === undefined ? {} : { telemetry: options.telemetry };
      const gate =
        options.assertRouteOn === undefined ? {} : { assertRouteOn: options.assertRouteOn };
      const gateway =
        options.generation === undefined
          ? {}
          : { gateway: createGateway({ ...options.generation, ...telemetry, ...gate, onUsage }) };
      const decisions = createDecisionClient({
        apiKey: options.typesafeApiKey,
        ...gateway,
        ...telemetry,
        ...gate,
        onUsage,
        onFallback: (route, reason) =>
          ctx.logger.warn({ route, reason }, 'decision answered by the fast-tier twin'),
      });
      const result = await checkCompliance(
        {
          decisions,
          onUnavailable: (surface, error) =>
            ctx.logger.warn({ surface, err: error }, 'compliance check unavailable'),
        },
        { surface: handler.surface, text: content.text },
        { userId: content.userId ?? null, tripId: content.tripId ?? null },
      );
      await handler.apply(data.content_id, result, ctx.pool);
      return {
        outcome: result.outcome,
        answered_by: result.answered_by,
        flags: result.flags.map((flag) => flag.category),
      };
    },
  });
}
