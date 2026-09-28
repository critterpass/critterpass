/**
 * Bulk, latency-tolerant work (quests, the notification template library, the content factory)
 * runs as direct gateway calls with bounded concurrency: DeepSeek has no batch API and no batch
 * discount. Every call goes through the gateway, so each one bills
 * its own `ai_usage` row as it finishes. The durable side (skipping requests a retried step already
 * finished, applying each result exactly once) is the worker's batch step.
 *
 * A request ends as `succeeded`, `refused` (the model declined it) or `errored` (the provider
 * rejected it for good, e.g. an invalid request). A transient failure after the gateway's own
 * retries stops the run: no new request starts, the ones in flight finish and are reported, and the
 * error is thrown so the job retries later from where it stopped.
 */
import type Anthropic from '@anthropic-ai/sdk';
import { switchedOffKey, type AiErrorCode, type AiRoute } from '@cp/domain';

import type { Gateway, GatewayInput } from './client';
import { GatewayConfigError, toGatewayError, type GatewayError } from './errors';
import type { TokenUsage } from './pricing';
import type { UsageContext } from './usage';

/** 1–64 characters of `[A-Za-z0-9_-]`: the key a request's result is stored and matched under. */
const CUSTOM_ID = /^[\w-]{1,64}$/u;

export const DEFAULT_BATCH_CONCURRENCY = 4;

export interface BatchRequest {
  readonly customId: string;
  readonly input: Omit<GatewayInput, 'signal'>;
}

export type BatchItemResult =
  | {
      readonly customId: string;
      readonly type: 'succeeded';
      readonly message: Anthropic.Messages.Message;
      readonly usage: TokenUsage;
      readonly costMicros: number;
    }
  | { readonly customId: string; readonly type: 'refused' }
  | {
      readonly customId: string;
      readonly type: 'errored';
      readonly code: AiErrorCode;
      readonly errorMessage: string;
    };

export interface RunBatchOptions {
  /** Requests in flight at once (default 4). */
  readonly concurrency?: number;
  /** Who every call is billed to (the agent job). */
  readonly context?: UsageContext;
  readonly signal?: AbortSignal;
  /** Called once per finished request, as it finishes (results arrive in any order). */
  readonly onResult?: (result: BatchItemResult) => Promise<void>;
}

export function checkBatchRequests(requests: readonly BatchRequest[]): void {
  const seen = new Set<string>();
  for (const { customId } of requests) {
    if (!CUSTOM_ID.test(customId)) {
      throw new GatewayConfigError(`batch custom_id ${JSON.stringify(customId)} is not allowed`);
    }
    if (seen.has(customId)) throw new GatewayConfigError(`duplicate batch custom_id ${customId}`);
    seen.add(customId);
  }
}

/** A failure that retrying later cannot fix (the provider rejected the request itself). */
function isPermanent(error: GatewayError): boolean {
  return error.code !== 'AI_UNAVAILABLE' || error.detail?.transient === false;
}

async function runOne(
  gateway: Gateway,
  route: AiRoute,
  request: BatchRequest,
  options: RunBatchOptions,
): Promise<BatchItemResult> {
  try {
    const input =
      options.signal === undefined ? request.input : { ...request.input, signal: options.signal };
    const result = await gateway.callModel(route, input, options.context ?? {});
    return {
      customId: request.customId,
      type: 'succeeded',
      message: result.message,
      usage: result.usage,
      costMicros: result.costMicros,
    };
  } catch (caught) {
    // A switched-off route stops the whole batch: every other item would be refused the same way.
    if (switchedOffKey(caught) !== undefined) throw caught;
    const error = toGatewayError(caught);
    if (error.code === 'AI_REFUSED') return { customId: request.customId, type: 'refused' };
    if (isPermanent(error)) {
      return {
        customId: request.customId,
        type: 'errored',
        code: error.code,
        errorMessage: error.message,
      };
    }
    throw error;
  }
}

/** Runs every request (at most `concurrency` at once) and returns the results in request order. */
export async function runBatch(
  gateway: Gateway,
  route: AiRoute,
  requests: readonly BatchRequest[],
  options: RunBatchOptions = {},
): Promise<BatchItemResult[]> {
  checkBatchRequests(requests);
  const results = new Map<string, BatchItemResult>();
  let next = 0;
  let failure: Error | undefined;
  const worker = async (): Promise<void> => {
    while (failure === undefined && next < requests.length) {
      const request = requests[next];
      next += 1;
      if (request === undefined) return;
      try {
        const result = await runOne(gateway, route, request, options);
        await options.onResult?.(result);
        results.set(request.customId, result);
      } catch (error) {
        failure ??= error instanceof Error ? error : toGatewayError(error);
      }
    }
  };
  const width = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_BATCH_CONCURRENCY, requests.length),
  );
  await Promise.all(Array.from({ length: width }, worker));
  if (failure !== undefined) throw failure;
  return requests.flatMap((request) => {
    const result = results.get(request.customId);
    return result === undefined ? [] : [result];
  });
}
