/**
 * Generate stage: one gateway call per brief unit on the `content.factory` route, structured
 * output validated by the unit's schema. Outputs are cached by the content hash of the full
 * request (route, model, prompt, schema), so re-running an unchanged batch makes no model calls
 * and an interrupted run resumes with only the missing units. Calls stop once the batch cost cap
 * is reached; the next run picks up the rest.
 */
import path from 'node:path';

import {
  parseStructuredText,
  resolveRoute,
  runBatch,
  textOf,
  type BatchRequest,
  type Gateway,
} from '@cp/ai';
import { canonicalJson, sha256Hex } from '@cp/content';

import { addCall, DEFAULT_MAX_COST_MICROS, emptyCost, formatCost, type CostTotals } from '../cost';
import type { AnyKindModule, KindContext, Prompt } from '../kinds/types';
import { readJsonIfExists, writeJson } from '../work';
import { required, type GenerateLog, type StageFiles } from './state';

export const FACTORY_ROUTE = 'content.factory';

export interface GenerateDeps {
  readonly gateway: Gateway | null;
  readonly maxCostMicros?: number;
  readonly concurrency?: number;
  /** Billing row for this batch's calls (an `agent_jobs` row), when a database is configured. */
  readonly agentJobId?: string | null;
  readonly log?: (line: string) => void;
}

export function requestHash(prompt: Prompt): string {
  const route = resolveRoute(FACTORY_ROUTE);
  return sha256Hex(
    canonicalJson({
      route: FACTORY_ROUTE,
      model: route.model,
      system: prompt.system,
      user: prompt.user,
      schema: prompt.jsonSchema,
    }),
  );
}

export async function runGenerate(
  module: AnyKindModule,
  _ctx: KindContext,
  files: StageFiles,
  deps: GenerateDeps,
): Promise<GenerateLog> {
  const brief = required(files.brief(), 'brief');
  const log = deps.log ?? (() => undefined);
  const outputs: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  let cost: CostTotals = emptyCost();
  const pending: { unitId: string; prompt: Prompt; hash: string }[] = [];

  if (module.prompt !== undefined) {
    for (const unit of brief.units) {
      const prompt = module.prompt(unit, brief);
      const hash = requestHash(prompt);
      const cached = readJsonIfExists<{ output: unknown }>(
        path.join(files.paths.cacheDir, `${hash}.json`),
      );
      if (cached !== undefined && prompt.schema.safeParse(cached.output).success) {
        outputs[unit.id] = cached.output;
        cost = { ...cost, cachedUnits: cost.cachedUnits + 1 };
      } else {
        pending.push({ unitId: unit.id, prompt, hash });
      }
    }
  }

  if (pending.length > 0) {
    if (deps.gateway === null) {
      throw new Error(`${pending.length} units need the model: set ANTHROPIC_API_KEY`);
    }
    const cap = deps.maxCostMicros ?? DEFAULT_MAX_COST_MICROS;
    const abort = new AbortController();
    const requests: BatchRequest[] = pending.map((entry, index) => ({
      customId: `u${index}`,
      input: {
        system: entry.prompt.system,
        messages: [{ role: 'user', content: entry.prompt.user }],
        outputFormat: { type: 'json_schema', schema: entry.prompt.jsonSchema },
      },
    }));
    await runBatch(deps.gateway, FACTORY_ROUTE, requests, {
      concurrency: deps.concurrency ?? 4,
      signal: abort.signal,
      context: { jobId: deps.agentJobId ?? null },
      onResult: (result) => {
        const entry = pending[Number(result.customId.slice(1))];
        if (entry === undefined) return Promise.resolve();
        if (result.type !== 'succeeded') {
          errors[entry.unitId] =
            result.type === 'refused' ? 'the model declined' : result.errorMessage;
          return Promise.resolve();
        }
        cost = addCall(cost, {
          tokensIn:
            result.usage.inputTokens + result.usage.cacheReadTokens + result.usage.cacheWriteTokens,
          tokensOut: result.usage.outputTokens,
          costMicros: result.costMicros,
        });
        const parsed = entry.prompt.schema.safeParse(safeParseJson(textOf(result.message)));
        if (!parsed.success) {
          errors[entry.unitId] =
            `reply did not match the schema: ${parsed.error.issues[0]?.message ?? ''}`;
        } else {
          outputs[entry.unitId] = parsed.data;
          writeJson(path.join(files.paths.cacheDir, `${entry.hash}.json`), { output: parsed.data });
        }
        if (cost.costMicros >= cap) abort.abort();
        return Promise.resolve();
      },
    }).catch((error: unknown) => {
      if (!abort.signal.aborted) throw error;
    });
    if (abort.signal.aborted) log(`cost cap reached; re-run to finish the remaining units`);
  }

  const result: GenerateLog = { outputs, errors, cost, agentJobId: deps.agentJobId ?? null };
  files.write('generate', result);
  log(`generate: ${Object.keys(outputs).length}/${brief.units.length} units · ${formatCost(cost)}`);
  return result;
}

function safeParseJson(text: string): unknown {
  try {
    return parseStructuredText(text);
  } catch {
    return undefined;
  }
}
