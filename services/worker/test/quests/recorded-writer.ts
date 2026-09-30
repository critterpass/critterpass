/**
 * A quest writer whose only double is DeepSeek's network boundary: the real gateway, prompt and
 * validator, answered by a live recording from the `quests` eval suite.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { createGateway } from '@cp/ai';

import type { QuestWriter } from '../../src/jobs/quests/generate';

export function recordedWriter(caseId: string): QuestWriter {
  const file = fileURLToPath(
    new URL(`../../../../packages/ai/evals/quests/fixtures/${caseId}.json`, import.meta.url),
  );
  const { response } = JSON.parse(readFileSync(file, 'utf8')) as {
    response: { status: number; body: unknown };
  };
  return (onUsage) =>
    createGateway({
      apiKey: 'replay',
      maxAttempts: 1,
      onUsage,
      fetch: () =>
        Promise.resolve(
          new Response(JSON.stringify(response.body), {
            status: response.status,
            headers: { 'content-type': 'application/json' },
          }),
        ),
    });
}
