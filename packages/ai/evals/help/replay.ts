/**
 * The one network boundary the safety suites (`help`, `sos`) replay: DeepSeek's reply to a case,
 * stored per case under the suite's `fixtures/`. Live runs call DeepSeek and, when recording,
 * write what came back.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

import type { EvalMode } from '../lib/provider';
import { jsonResponse } from '../lib/transports';

export interface SafetySuiteOptions {
  readonly mode: EvalMode;
  readonly apiKey?: string;
  readonly baseURL?: string;
  readonly record?: boolean;
}

export function caseTransport(file: string, options: SafetySuiteOptions): typeof fetch {
  if (options.mode === 'replay') {
    return () => {
      const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
        response: { status: number; body: unknown };
      };
      return Promise.resolve(jsonResponse(response.body, response.status));
    };
  }
  return async (url, init) => {
    const response = await fetch(url, init);
    if (options.record === true) {
      const body = (await response.clone().json()) as unknown;
      mkdirSync(dirname(file), { recursive: true });
      const source = `Live recording from DeepSeek through its Anthropic-format API, ${new Date().toISOString().slice(0, 10)}.`;
      writeFileSync(
        file,
        `${JSON.stringify({ source, response: { status: response.status, body } }, null, 2)}\n`,
      );
    }
    return response;
  };
}
