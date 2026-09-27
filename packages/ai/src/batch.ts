/**
 * Message Batches (docs/api-contracts.md §6 "Batch"): bulk, latency-tolerant work (quests, the
 * notification template library, the content factory) at half the token price. `submit` sends one
 * batch of routed requests, `retrieve` reads its processing status, and `results` maps every
 * finished request back by `custom_id` with its batch-priced usage record. The durable side
 * (submitting once, polling, applying results once) is the worker's `ai.batch.poll` job.
 */
import Anthropic from '@anthropic-ai/sdk';
import type { AiRoute } from '@cp/domain';

import { buildMessageParams, type GatewayInput } from './client';
import { ANTHROPIC_API_URL } from './env';
import { GatewayConfigError, toGatewayError } from './errors';
import { computeCostMicros, type TokenUsage } from './pricing';
import { resolveRoute } from './routing';
import { buildUsageRecord, toTokenUsage, type AiUsageRecord, type UsageContext } from './usage';

/** Anthropic's `custom_id` rule: 1–64 characters of `[A-Za-z0-9_-]`. */
const CUSTOM_ID = /^[\w-]{1,64}$/;

export interface BatchRequest {
  readonly customId: string;
  readonly input: Omit<GatewayInput, 'signal'>;
}

export type BatchProcessingStatus = 'in_progress' | 'canceling' | 'ended';

export interface BatchStatus {
  readonly id: string;
  readonly status: BatchProcessingStatus;
  readonly counts: {
    readonly processing: number;
    readonly succeeded: number;
    readonly errored: number;
    readonly canceled: number;
    readonly expired: number;
  };
  readonly endedAt: string | null;
}

export type BatchItemResult =
  | {
      readonly customId: string;
      readonly type: 'succeeded';
      readonly message: Anthropic.Messages.Message;
      /** `stop_reason: refusal`: billed like any answer, but carries no usable output. */
      readonly refused: boolean;
      readonly usage: TokenUsage;
      readonly costMicros: number;
      readonly record: AiUsageRecord;
    }
  | {
      readonly customId: string;
      readonly type: 'errored';
      readonly errorType: string;
      readonly errorMessage: string;
    }
  | { readonly customId: string; readonly type: 'canceled' | 'expired' };

export interface BatchClient {
  submit(route: AiRoute, requests: readonly BatchRequest[]): Promise<BatchStatus>;
  retrieve(batchId: string): Promise<BatchStatus>;
  /** Every result of an ended batch; usage records are billed to `context` at batch prices. */
  results(batchId: string, route: AiRoute, context?: UsageContext): Promise<BatchItemResult[]>;
}

export interface BatchClientOptions {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly timeoutMs?: number;
  /** Network boundary override (recorded fixtures in tests). */
  readonly fetch?: typeof fetch;
  readonly now?: () => Date;
}

function toStatus(batch: Anthropic.Messages.Batches.MessageBatch): BatchStatus {
  const counts = batch.request_counts;
  return {
    id: batch.id,
    status: batch.processing_status,
    counts: {
      processing: counts.processing,
      succeeded: counts.succeeded,
      errored: counts.errored,
      canceled: counts.canceled,
      expired: counts.expired,
    },
    endedAt: batch.ended_at,
  };
}

function checkRequests(requests: readonly BatchRequest[]): void {
  if (requests.length === 0) throw new GatewayConfigError('a batch needs at least one request');
  const seen = new Set<string>();
  for (const { customId } of requests) {
    if (!CUSTOM_ID.test(customId)) {
      throw new GatewayConfigError(`batch custom_id ${JSON.stringify(customId)} is not allowed`);
    }
    if (seen.has(customId)) throw new GatewayConfigError(`duplicate batch custom_id ${customId}`);
    seen.add(customId);
  }
}

export function createBatchClient(options: BatchClientOptions): BatchClient {
  const client = new Anthropic({
    apiKey: options.apiKey,
    maxRetries: 2,
    timeout: options.timeoutMs ?? 120_000,
    baseURL: options.baseURL ?? ANTHROPIC_API_URL,
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  });
  const now = options.now ?? (() => new Date());

  const call = async <T>(run: () => Promise<T>): Promise<T> => {
    try {
      return await run();
    } catch (error) {
      throw toGatewayError(error);
    }
  };

  return {
    async submit(routeId, requests) {
      checkRequests(requests);
      const route = resolveRoute(routeId);
      const params = requests.map((request) => ({
        custom_id: request.customId,
        params: buildMessageParams(route, request.input),
      }));
      return toStatus(await call(() => client.messages.batches.create({ requests: params })));
    },

    async retrieve(batchId) {
      return toStatus(await call(() => client.messages.batches.retrieve(batchId)));
    },

    async results(batchId, routeId, context = {}) {
      const route = resolveRoute(routeId);
      const decoder = await call(() => client.messages.batches.results(batchId));
      const at = now();
      const mapped: BatchItemResult[] = [];
      for await (const line of decoder) {
        const { custom_id: customId, result } = line;
        if (result.type === 'succeeded') {
          const usage = toTokenUsage(result.message.usage);
          const costMicros = computeCostMicros(route.tier, usage, { batch: true });
          mapped.push({
            customId,
            type: 'succeeded',
            message: result.message,
            refused: result.message.stop_reason === 'refusal',
            usage,
            costMicros,
            record: buildUsageRecord({
              model: route.model,
              tier: route.tier,
              usage,
              costMicros,
              context,
              at,
            }),
          });
        } else if (result.type === 'errored') {
          mapped.push({
            customId,
            type: 'errored',
            errorType: result.error.error.type,
            errorMessage: result.error.error.message,
          });
        } else {
          mapped.push({ customId, type: result.type });
        }
      }
      return mapped;
    },
  };
}
