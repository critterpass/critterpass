/**
 * A case's model for the draft evals: replay serves the recorded DeepSeek responses
 * (`<dir>/<case>.json`, one per call key) through the real gateway; a live run calls DeepSeek and,
 * with `record`, stores them on `save()`.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createGateway } from '../../src/client';
import type { DraftModel } from '../../src/prompts/draft/context';
import type { EvalMode } from '../lib/provider';
import { jsonResponse } from '../lib/transports';

/** The key-off recordings, which the suite replays. */
export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
/** Recordings of drafts planned from typed place facts (`planner.typed_places` on). */
export const TYPED_FIXTURES = fileURLToPath(new URL('./fixtures-typed/', import.meta.url));

export interface RecordingOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

interface Recorded {
  readonly source: string;
  readonly calls: Record<string, { readonly status: number; readonly body: unknown }>;
}

function withoutThinking(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || !('content' in body)) return body;
  const content = body.content;
  if (!Array.isArray(content)) return body;
  return {
    ...body,
    content: content.filter(
      (block: { type?: string }) => block.type !== 'thinking' && block.type !== 'redacted_thinking',
    ),
  };
}

/** One model per case: every call is served or recorded under its key. */
export function caseModel(
  caseId: string,
  options: RecordingOptions,
  dir: string = FIXTURES,
): { model: DraftModel; save: () => void } {
  const file = resolve(dir, `${caseId}.json`);
  const recorded: Recorded =
    options.mode === 'replay'
      ? (JSON.parse(readFileSync(file, 'utf8')) as Recorded)
      : {
          source: `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`,
          calls: {},
        };
  const transport = (key: string): typeof fetch =>
    options.mode === 'replay'
      ? () => {
          const call = recorded.calls[key];
          if (call === undefined) throw new Error(`${caseId}: no recorded call ${key}`);
          return Promise.resolve(jsonResponse(call.body, call.status));
        }
      : async (url, init) => {
          const response = await fetch(url, init);
          if (options.record === true) {
            const body = (await response.clone().json()) as unknown;
            recorded.calls[key] = { status: response.status, body: withoutThinking(body) };
          }
          return response;
        };
  const model: DraftModel = {
    call: (route, input, key) =>
      createGateway({
        apiKey: options.apiKey ?? 'replay',
        ...(options.baseURL === undefined ? {} : { baseURL: options.baseURL }),
        fetch: transport(key),
        maxAttempts: options.mode === 'replay' ? 1 : 3,
        timeoutMs: 180_000,
      }).callModel(route, input),
  };
  const save = () => {
    if (options.mode !== 'live' || options.record !== true) return;
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, `${JSON.stringify(recorded, null, 1)}\n`);
  };
  return { model, save };
}
