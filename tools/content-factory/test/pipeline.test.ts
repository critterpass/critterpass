import { mkdtempSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { createGateway } from '@cp/ai';
import { loadRelease } from '@cp/content';
import { describe, expect, it } from 'vitest';

import { checkName, ipChecklist } from '../src/ip/check';
import { kindModule, registerKind } from '../src/kinds/registry';
import { runPipeline } from '../src/pipeline';
import { StageError, stageFiles } from '../src/stages/state';
import { readJson } from '../src/work';
import { replayFetch } from './fixture-fetch';
import { quizKind } from './quiz-kind';

registerKind(quizKind());

function gatewayWith(names: readonly string[]) {
  const replay = replayFetch(names);
  return {
    replay,
    gateway: createGateway({ apiKey: 'test-key', fetch: replay.fetch, maxAttempts: 1 }),
  };
}

describe('pipeline stages', () => {
  it('generates once, then re-runs an unchanged batch without a model call', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-'));
    const first = gatewayWith(['deepseek-quiz-mornings']);
    const run = (gateway: ReturnType<typeof gatewayWith>['gateway'], batchKey: string) =>
      runPipeline({
        kind: 'taste_quiz',
        batchKey,
        stages: ['brief', 'generate', 'validate', 'render', 'review'],
        pool: null,
        gateway,
        root,
        now: new Date('2026-09-28T00:00:00Z'),
      });
    const result = await run(first.gateway, 'batch-a');
    expect(first.replay.requests).toHaveLength(1);
    expect(result.report?.severity).toBe('pass');
    expect(result.queued?.status).toBe('review');

    const second = gatewayWith([]);
    const again = await run(second.gateway, 'batch-b');
    expect(second.replay.requests).toHaveLength(0);
    expect(again.queued?.artifact.items).toEqual(result.queued?.artifact.items);

    const artifact = readJson<unknown>(stageFiles('taste_quiz', 'batch-a', root).paths.artifact);
    expect(loadRelease(artifact, 'taste_quiz').items).toHaveLength(1);
  });

  it('keeps a batch with a failing validator out of review', async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'factory-'));
    const module = quizKind({ failing: true });
    const { gateway } = gatewayWith(['deepseek-quiz-mornings']);
    const base = { kind: 'taste_quiz' as const, batchKey: 'failing', pool: null, gateway, root };
    // Swap the registered module's validators for this run only.
    const registered = kindModule('taste_quiz') as unknown as { validators: unknown };
    const original = registered.validators;
    registered.validators = module.validators;
    try {
      const { report } = await runPipeline({ ...base, stages: ['brief', 'generate', 'validate'] });
      expect(report?.severity).toBe('fail');
      await expect(runPipeline({ ...base, stages: ['review'] })).rejects.toThrow(StageError);
    } finally {
      registered.validators = original;
    }
  });
});

describe('IP screen', () => {
  it('flags exact and near matches of protected names and clears the rest', () => {
    expect(checkName('Buddy Bear').status).toBe('flagged');
    expect(checkName('Pikachuu').status).toBe('flagged');
    expect(checkName('Golden Tokek').status).toBe('clear');
    expect(checkName('Merlina').status).toBe('clear');
  });

  it('writes a checklist with register search links', () => {
    const md = ipChecklist('2026-09-28-critters-01', [checkName('Sakura Pon')]);
    expect(md).toContain('| [ ] | Sakura Pon | clear |');
    expect(md).toContain('tmsearch.uspto.gov');
  });
});

describe('pull', () => {
  it('writes the live release into the package and imports every current kind', async () => {
    const { mkdirSync } = await import('node:fs');
    const { writeCurrentRelease } = await import('../src/stages/pull');
    const { currentRelease: current } = await import('@cp/content');
    const root = mkdtempSync(path.join(os.tmpdir(), 'content-pkg-'));
    mkdirSync(path.join(root, 'src'), { recursive: true });
    const forms = current('forms');
    expect(writeCurrentRelease('forms', forms, root)).toBe(1);
    const module = await import('node:fs').then((fs) =>
      fs.readFileSync(path.join(root, 'src', 'current.ts'), 'utf8'),
    );
    expect(module).toContain("import forms from '../releases/forms/current.json'");
    expect(() => writeCurrentRelease('windows', undefined, root)).toThrow(/no published windows/u);
  });
});
